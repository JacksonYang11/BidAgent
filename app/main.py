import hashlib
import importlib.util
import json
import os
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai import ModelClient, UserError, verify
from app.config import load_settings
from app.exporter import export_word
from app.jobs import Jobs, coverage
from app.models import AnalysisEdit, ChapterEdit, GenerateRequest, Profile
from app.security import Security
from app.store import Store, now, uid


def create_app(settings=None, client_factory=ModelClient):
    settings = settings or load_settings()
    settings.validate()
    os.umask(0o077)
    store = Store(settings.data)
    client = client_factory(settings, store)
    jobs = Jobs(settings, store, client)
    sessions = {}

    @asynccontextmanager
    async def lifespan(app):
        jobs.start()
        yield
        jobs.stop()

    app = FastAPI(title='WhaleTalk Bid Agent', docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.store, app.state.jobs, app.state.settings = store, jobs, settings
    app.add_middleware(Security, settings=settings, sessions=sessions)

    @app.exception_handler(UserError)
    async def user_error(request, exc):
        status = 409 if exc.code in ('JOB_ACTIVE', 'VERSION_CONFLICT') else 400
        return JSONResponse({'error': {'code': exc.code, 'message': exc.message}, 'request_id': uid()}, status_code=status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({'error': {'code': 'INVALID_INPUT', 'message': '提交内容格式不正确，请检查输入。'}}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        return JSONResponse({'error': {'code': 'INTERNAL_ERROR', 'message': '请求未完成，请检查文件或稍后重试。'}, 'request_id': uid()}, status_code=500)

    def require(kind, identifier):
        value = store.get(kind, identifier)
        if value is None:
            raise UserError('NOT_FOUND', '指定记录不存在。')
        return value

    def idle(task_id=None):
        if jobs.active(task_id):
            raise UserError('JOB_ACTIVE', '任务处理中，暂不能修改或删除相关内容。')

    def public_job(job):
        return {k: v for k, v in job.items() if k != 'payload'}

    @app.get('/')
    def home():
        return FileResponse(settings.root / 'app/static/index.html')

    @app.get('/api/session')
    def session(request: Request):
        return {'csrf': request.state.session['csrf']}

    @app.get('/api/status')
    def status():
        return {'configured': bool(settings.key), 'model': settings.model,
                'ocr_ready': settings.ocr and importlib.util.find_spec('rapidocr_onnxruntime') is not None,
                'max_mb': settings.max_mb, 'max_pages': settings.max_pages,
                'active_jobs': [public_job(j) for j in jobs.active()]}

    @app.post('/api/model/check', status_code=202)
    def check_model():
        client.require_key()
        return public_job(jobs.submit('system', 'check_model'))

    @app.post('/api/tasks', status_code=202)
    async def upload(file: UploadFile = File(...)):
        idle()
        filename = (file.filename or '').replace('\\', '/').rsplit('/', 1)[-1]
        if not filename.lower().endswith('.pdf'):
            await file.close()
            return JSONResponse({'error': {'code': 'PDF_ONLY', 'message': '仅支持 PDF 文件。'}}, status_code=415)
        identifier = uid()
        folder = store.task_dir(identifier)
        folder.mkdir(parents=True, mode=0o700)
        destination = store.task_file(identifier, 'source.pdf')
        total, digest = 0, hashlib.sha256()
        try:
            with destination.open('wb') as output:
                first = True
                while chunk := await file.read(1024*1024):
                    total += len(chunk)
                    if first and b'%PDF-' not in chunk[:1024]:
                        raise UserError('INVALID_PDF', '文件内容不是有效 PDF。')
                    first = False
                    if total > settings.max_mb*1024*1024:
                        raise UserError('FILE_LIMIT', 'PDF 超过上传大小限制。')
                    output.write(chunk)
                    digest.update(chunk)
            if not total:
                raise UserError('EMPTY_FILE', '文件为空。')
            task = {'id': identifier, 'filename': filename[:200], 'size': total,
                    'hash': digest.hexdigest(), 'created_at': now(), 'page_count': 0,
                    'extracted': False, 'ocr_pages': 0, 'warnings': [], 'consent': False}
            with store.lock:
                idle()
                store.put('task', identifier, task)
                job = jobs.submit(identifier, 'extract')
            return {'task': task, 'job': public_job(job)}
        except Exception:
            shutil.rmtree(folder)
            store.delete('task', identifier)
            raise
        finally:
            await file.close()

    @app.get('/api/tasks')
    def task_list():
        result = []
        all_jobs = store.all('job')
        for task in sorted(store.all('task'), key=lambda t: t['created_at'], reverse=True):
            if task.get('deleting'):
                continue
            task['has_analysis'] = store.get('analysis', task['id']) is not None
            related = sorted([j for j in all_jobs if j['task_id'] == task['id']], key=lambda j: j['created_at'])
            task['latest_job'] = public_job(related[-1]) if related else None
            result.append(task)
        return result

    @app.get('/api/tasks/{identifier}')
    def get_task(identifier: str):
        task = require('task', identifier)
        task['drafts'] = [public_draft(d, summary=True) for d in store.all('draft') if d['task_id'] == identifier]
        return task

    @app.get('/api/tasks/{identifier}/source')
    def source(identifier: str):
        require('task', identifier)
        return FileResponse(store.task_file(identifier, 'source.pdf'), media_type='application/pdf')

    @app.get('/api/tasks/{identifier}/pages')
    def pages(identifier: str):
        require('task', identifier)
        return jobs.pages(identifier)

    @app.post('/api/tasks/{identifier}/analyze', status_code=202)
    def start_analysis(identifier: str, body: GenerateRequest):
        client.require_key()
        task = require('task', identifier)
        if not task['extracted']:
            raise UserError('EXTRACTION_REQUIRED', '请先完成 PDF 提取。')
        if not body.consent:
            raise UserError('CONSENT_REQUIRED', '请确认将相关文本发送至 DeepSeek。')
        with store.lock:
            job = jobs.submit(identifier, 'analyze')
            task['consent'] = True
            store.put('task', identifier, task)
        return public_job(job)

    @app.get('/api/jobs/{identifier}')
    def get_job(identifier: str):
        return public_job(require('job', identifier))

    @app.post('/api/jobs/{identifier}/cancel')
    def cancel(identifier: str):
        job = require('job', identifier)
        if job['status'] in ('queued', 'running'):
            jobs.update(identifier, cancel=True)
        return public_job(require('job', identifier))

    @app.post('/api/jobs/{identifier}/retry', status_code=202)
    def retry(identifier: str):
        previous = require('job', identifier)
        if previous['status'] not in ('failed', 'cancelled', 'interrupted'):
            raise UserError('RETRY_INVALID', '该任务不需要重试。')
        if previous['kind'] != 'extract':
            client.require_key()
        return public_job(jobs.submit(previous['task_id'], previous['kind'], previous['payload']))

    @app.get('/api/tasks/{identifier}/analysis')
    def get_analysis(identifier: str):
        require('task', identifier)
        return store.get('analysis', identifier)

    @app.put('/api/tasks/{identifier}/analysis')
    def edit_analysis(identifier: str, body: AnalysisEdit):
        with store.lock:
            idle(identifier)
            previous = require('analysis', identifier)
            if previous['revision'] != body.revision:
                raise UserError('VERSION_CONFLICT', '分析结果已有新版本，请刷新后编辑。')
            result = verify(body.analysis, jobs.pages(identifier))
            store.put('analysis_history', f'{identifier}:{body.revision}', previous)
            return store.put('analysis', identifier, {'revision': body.revision+1, 'analysis': result.model_dump()})

    @app.get('/api/company-profile')
    def get_profile():
        return store.get('profile', 'default') or Profile().model_dump()

    @app.put('/api/company-profile')
    def put_profile(body: Profile):
        with store.lock:
            previous = get_profile()
            if body.revision != previous['revision']:
                raise UserError('VERSION_CONFLICT', '企业资料已有新版本，请刷新。')
            body.revision += 1
            return store.put('profile', 'default', body.model_dump())

    def public_draft(draft, summary=False):
        result = {k: v for k, v in draft.items() if k not in ('analysis_snapshot', 'profile')}
        current = store.get('analysis', draft['task_id'])
        result['stale'] = (current or {}).get('revision') != draft['analysis_revision'] or get_profile()['revision'] != draft['company_revision']
        result['is_demo'] = draft['profile']['is_demo']
        if summary:
            return {k: result[k] for k in ('id', 'title', 'status', 'revision', 'stale', 'created_at')}
        return result

    @app.post('/api/tasks/{identifier}/drafts', status_code=202)
    def generate(identifier: str, body: GenerateRequest):
        client.require_key()
        analysis = require('analysis', identifier)
        task = require('task', identifier)
        if not body.consent:
            raise UserError('CONSENT_REQUIRED', '请确认将企业资料及相关原文发送至 DeepSeek。')
        if analysis['analysis']['warnings'] and not body.allow_incomplete:
            raise UserError('REVIEW_REQUIRED', '仍有待核对事项，请确认后继续生成。')
        profile = get_profile()
        draft = {'id': uid(), 'task_id': identifier, 'revision': 1,
                 'analysis_revision': analysis['revision'], 'company_revision': profile['revision'],
                 'profile': profile, 'analysis_snapshot': analysis['analysis'], 'chapters': [],
                 'title': analysis['analysis']['project_name'] or task['filename'], 'status': 'writing',
                 'warnings': analysis['analysis']['warnings'], 'coverage': [], 'created_at': now()}
        with store.lock:
            idle()
            store.put('draft', draft['id'], draft)
            job = jobs.submit(identifier, 'generate', {'draft_id': draft['id']})
        return {'draft_id': draft['id'], 'job': public_job(job)}

    @app.get('/api/drafts/{identifier}')
    def get_draft(identifier: str):
        return public_draft(require('draft', identifier))

    @app.put('/api/drafts/{identifier}/chapters/{chapter_id}')
    def edit_chapter(identifier: str, chapter_id: str, body: ChapterEdit):
        with store.lock:
            draft = require('draft', identifier)
            idle(draft['task_id'])
            if draft['revision'] != body.revision:
                raise UserError('VERSION_CONFLICT', '初稿已有新版本，请刷新后重试。')
            index = next((i for i, c in enumerate(draft['chapters']) if c['id'] == chapter_id), None)
            if index is None or body.chapter.id != chapter_id:
                raise UserError('CHAPTER_INVALID', '章节不存在。')
            store.put('draft_history', f'{identifier}:{draft["revision"]}', draft)
            body.chapter.edited = True
            draft['chapters'][index] = body.chapter.model_dump()
            draft['revision'] += 1
            draft['coverage'] = coverage(draft)
            store.put('draft', identifier, draft)
            return public_draft(draft)

    @app.post('/api/drafts/{identifier}/chapters/{chapter_id}/regenerate', status_code=202)
    def regenerate(identifier: str, chapter_id: str):
        client.require_key()
        draft = require('draft', identifier)
        if not any(c['id'] == chapter_id for c in draft['chapters']):
            raise UserError('CHAPTER_INVALID', '章节不存在。')
        return public_job(jobs.submit(draft['task_id'], 'regenerate', {'draft_id': identifier, 'chapter_id': chapter_id}))

    @app.post('/api/drafts/{identifier}/restore')
    def restore(identifier: str):
        with store.lock:
            draft = require('draft', identifier)
            idle(draft['task_id'])
            previous = require('draft_history', f'{identifier}:{draft["revision"]-1}')
            store.put('draft_history', f'{identifier}:{draft["revision"]}', draft)
            previous['revision'] = draft['revision']+1
            store.put('draft', identifier, previous)
            return public_draft(previous)

    @app.post('/api/drafts/{identifier}/exports')
    def export(identifier: str):
        draft = require('draft', identifier)
        idle(draft['task_id'])
        if not any(c['blocks'] for c in draft['chapters']):
            raise UserError('DRAFT_EMPTY', '初稿尚未生成内容。')
        export_id = uid()
        path = store.task_file(draft['task_id'], export_id+'.docx')
        export_word(draft, path)
        record = {'id': export_id, 'task_id': draft['task_id'], 'draft_id': identifier, 'revision': draft['revision']}
        store.put('export', export_id, record)
        return record

    @app.get('/api/exports/{identifier}/download')
    def download(identifier: str):
        record = require('export', identifier)
        return FileResponse(store.task_file(record['task_id'], identifier+'.docx'),
                            filename='投标方案初稿.docx', media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    @app.delete('/api/tasks/{identifier}')
    def delete_task(identifier: str):
        with store.lock:
            idle(identifier)
            task = require('task', identifier)
            task['deleting'] = True
            store.put('task', identifier, task)
            folder = store.task_dir(identifier)
            if folder.exists():
                shutil.rmtree(folder)
            draft_ids = {d['id'] for d in store.all('draft') if d['task_id'] == identifier}
            job_ids = {j['id'] for j in store.all('job') if j['task_id'] == identifier}
            with store.connect() as con:
                rows = con.execute('SELECT kind,id,body FROM objects').fetchall()
                for kind, key, raw in rows:
                    body = json.loads(raw)
                    if (key == identifier or key.startswith(identifier) or body.get('task_id') == identifier
                            or body.get('job_id') in job_ids or any(key.startswith(d) for d in draft_ids)):
                        con.execute('DELETE FROM objects WHERE kind=? AND id=?', (kind, key))
        return {'deleted': True}

    app.mount('/static', StaticFiles(directory=settings.root / 'app/static'), name='static')
    return app
