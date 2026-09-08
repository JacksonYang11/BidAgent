import json
import os
import queue
import re
import selectors
import subprocess
import sys
import threading
import time

from app.ai import UserError, analyze, outline, write_chapter
from app.models import Analysis, Profile
from app.store import now, uid

ACTIVE = ('queued', 'running')


class Jobs:
    def __init__(self, settings, store, client):
        self.s, self.store, self.client = settings, store, client
        self.queue = queue.Queue()
        self.stopping = threading.Event()
        self.thread = None

    def start(self):
        for job in self.store.all('job'):
            if job['status'] in ACTIVE:
                job.update(status='interrupted', error='服务重启，任务已中断，可从检查点重试。', error_code='INTERRUPTED')
                self.store.put('job', job['id'], job)
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.stopping.set()
        self.queue.put(None)
        if self.thread:
            self.thread.join(timeout=3)

    def active(self, task_id=None):
        return [j for j in self.store.all('job') if j['status'] in ACTIVE and (task_id is None or j['task_id'] == task_id)]

    def submit(self, task_id, kind, payload=None):
        with self.store.lock:
            if self.active():
                raise UserError('JOB_ACTIVE', '已有任务在处理中，请等待完成或先取消。')
            job = {'id': uid(), 'task_id': task_id, 'kind': kind, 'payload': payload or {},
                   'status': 'queued', 'stage': kind, 'completed': 0, 'total': 0, 'created_at': now(),
                   'cancel': False, 'calls': 0, 'reserved_tokens': 0}
            self.store.put('job', job['id'], job)
            self.queue.put(job['id'])
            return job

    def loop(self):
        while not self.stopping.is_set():
            identifier = self.queue.get()
            if identifier is None:
                return
            job = self.store.get('job', identifier)
            try:
                self.check(identifier)
                self.update(identifier, status='running')
                update = lambda stage, done, total: self.update(identifier, stage=stage, completed=done, total=total)
                check = lambda: self.check(identifier)
                if job['kind'] == 'extract':
                    self.extract(job, check, update)
                elif job['kind'] == 'analyze':
                    pages = self.pages(job['task_id'])
                    result = analyze(self.client, job, pages, check, update)
                    previous = self.store.get('analysis', job['task_id'])
                    revision = (previous or {}).get('revision', 0) + 1
                    if previous:
                        self.store.put('analysis_history', f'{job["task_id"]}:{previous["revision"]}', previous)
                    self.store.put('analysis', job['task_id'], {'revision': revision, 'analysis': result.model_dump()})
                elif job['kind'] in ('generate', 'regenerate'):
                    self.generate(job, check, update)
                elif job['kind'] == 'check_model':
                    self.client.call(job, '只返回空的三类数组和连接正常的简短 summary。', {}, Analysis, check)
                check()
                finished = self.store.get('job', identifier)
                self.update(identifier, status='succeeded', completed=finished.get('total', 0), finished_at=now())
            except UserError as exc:
                self.update(identifier, status='cancelled' if exc.code == 'CANCELLED' else 'failed',
                            error_code=exc.code, error=exc.message, finished_at=now())
            except Exception:
                self.update(identifier, status='failed', error_code='PROCESSING_FAILED',
                            error='处理失败，已保存完成内容。请检查依赖或重试；不会自动跳过失败阶段。', finished_at=now())

    def update(self, identifier, **changes):
        with self.store.lock:
            job = self.store.get('job', identifier)
            job.update(changes)
            self.store.put('job', identifier, job)

    def check(self, identifier):
        if self.stopping.is_set() or self.store.get('job', identifier).get('cancel'):
            raise UserError('CANCELLED', '任务已取消。已发出的模型请求仍可能计费。')

    def pages(self, task_id):
        path = self.store.task_file(task_id, 'pages.json')
        return json.loads(path.read_text()) if path.exists() else []

    def extract(self, job, check, update):
        task_id = job['task_id']
        cmd = [sys.executable, '-m', 'app.pdf_worker', str(self.store.task_file(task_id, 'source.pdf')),
               str(self.store.task_file(task_id, 'pages.json')), '--max-pages', str(self.s.max_pages)]
        if not self.s.ocr:
            cmd.append('--no-ocr')
        # Do not pass model credentials to native document processing subprocesses.
        env = {k: v for k, v in os.environ.items() if not any(part in k.upper() for part in ('KEY', 'TOKEN', 'SECRET', 'PASSWORD'))}
        process = subprocess.Popen(cmd, cwd=self.s.root, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, bufsize=1)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + max(180, self.s.max_pages * 30)
        try:
            while process.poll() is None:
                check()
                if time.monotonic() > deadline:
                    raise UserError('PDF_TIMEOUT', 'PDF 处理超时，请拆分文件后重试。')
                for key, _ in selector.select(timeout=.3):
                    line = key.fileobj.readline()
                    try:
                        message = json.loads(line)
                        if 'stage' in message:
                            update(message['stage'], message['completed'], message['total'])
                    except (ValueError, KeyError):
                        pass
            if process.returncode:
                raise UserError('PDF_FAILED', 'PDF 读取或 OCR 失败，请确认文件未加密、页数符合限制且本地 OCR 可用。')
            pages = self.pages(task_id)
            task = self.store.get('task', task_id)
            task.update(page_count=len(pages), extracted=True, ocr_pages=sum(p['ocr'] for p in pages),
                        warnings=[f'PDF 第 {p["page"]} 页：{w}' for p in pages for w in p['warnings']])
            self.store.put('task', task_id, task)
        finally:
            selector.close()
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            process.stdout.close()

    def generate(self, job, check, update):
        payload = job['payload']
        draft = self.store.get('draft', payload['draft_id'])
        analysis, profile = draft['analysis_snapshot'], draft['profile']
        if not draft['chapters']:
            update('outlining', 0, 1)
            result = outline(self.client, job, analysis, profile, check)
            draft['title'] = result.title
            draft['chapters'] = [dict(c.model_dump(), id=uid(), blocks=[]) for c in result.chapters]
            self.store.put('draft', draft['id'], draft)
        target = payload.get('chapter_id')
        for index, chapter in enumerate(draft['chapters']):
            if (target and chapter['id'] != target) or (not target and chapter['blocks']):
                continue
            check()
            update('writing', index, len(draft['chapters']))
            result = write_chapter(self.client, job, chapter, analysis, profile, check)
            result.id = chapter['id']
            allowed_requirements = {i['id'] for i in analysis['requirements']}
            allowed_scores = {i['id'] for i in analysis['scores']}
            result.requirement_ids = [i for i in chapter['requirement_ids'] if i in allowed_requirements]
            result.score_ids = [i for i in chapter['score_ids'] if i in allowed_scores]
            self.store.put('draft_history', f'{draft["id"]}:{draft["revision"]}', draft)
            draft['chapters'][index] = result.model_dump()
            draft['revision'] += 1
            draft['coverage'] = coverage(draft)
            self.store.put('draft', draft['id'], draft)
        draft['status'] = 'ready'
        draft['coverage'] = coverage(draft)
        draft['warnings'] = list(dict.fromkeys(draft['warnings'] + audit_numbers(draft)))
        self.store.put('draft', draft['id'], draft)


def coverage(draft):
    analysis = draft['analysis_snapshot']
    result = []
    for group, field in (('requirements', 'requirement_ids'), ('scores', 'score_ids')):
        for item in analysis[group]:
            matches = [c['title'] for c in draft['chapters'] if item['id'] in c[field] and c['blocks']]
            result.append({'id': item['id'], 'name': item['name'],
                           'status': '待核对响应：' + '、'.join(matches) if matches else '待补充响应'})
    return result


def audit_numbers(draft):
    """Flag unsupported quantities; this does not certify business compliance."""
    pattern = r'\d[\d,]*(?:\.\d+)?\s*(?:万元|工作日|个月|元|人|名|天|年|%)'
    source = json.dumps([draft['analysis_snapshot'],draft['profile']], ensure_ascii=False)
    known = {re.sub(r'[,\s]', '', x) for x in re.findall(pattern, source)}
    warnings = []
    for chapter in draft['chapters']:
        text = json.dumps(chapter['blocks'], ensure_ascii=False)
        numbers = {re.sub(r'[,\s]', '', x) for x in re.findall(pattern, text)}
        unsupported = sorted(numbers-known)
        if unsupported:
            warnings.append(f'章节「{chapter["title"]}」含输入依据中未匹配的数量或承诺：'+ '、'.join(unsupported[:20])+'，请人工核对。')
    return warnings
