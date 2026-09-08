"""Inspect Git candidates without printing secret values or uploading content."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT)


def check():
    candidates=set(git('ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0'))-{''}
    patterns=[re.compile(r'\bsk-[A-Za-z0-9_-]{20,}'),
              re.compile(r'\bgh[pousr]_[A-Za-z0-9]{25,}'),
              re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]
    actual=[]
    # Exact-match configured secrets, without logging them or their lengths.
    from dotenv import dotenv_values
    values=dict(dotenv_values(ROOT/'.env')) if (ROOT/'.env').exists() else {}
    values.update({k:v for k,v in os.environ.items() if k=='DEEPSEEK_API_KEY'})
    actual=[value for key,value in values.items() if value and
            (key.endswith(('_API_KEY','_ACCESS_TOKEN','_SECRET','_PASSWORD')) or key in ('API_KEY','ACCESS_TOKEN','SECRET','PASSWORD'))]
    failures=[]
    forbidden=['.env','.env.local','data/app.db','data/tasks/example/source.pdf','samples/company/private.json','tmp/private.txt',
               '.extracted/page.png','.pylibs/package.py','.venv/bin/python','output/result.docx']
    for path in forbidden:
        result=subprocess.run(['git','check-ignore','--no-index','-q',path],cwd=ROOT)
        if result.returncode!=0:failures.append({'path':path,'issue':'not ignored'})
    for name in sorted(candidates):
        path=ROOT/name
        if not path.is_file():continue
        if (name.startswith(('data/','samples/','tmp/','.extracted/','.pylibs/','.venv/'))
            or Path(name).name.startswith('.env') and name!='.env.example'
            or path.suffix.lower() in ('.pdf','.docx','.pem','.key','.db','.sqlite')):
            failures.append({'path':name,'issue':'private/generated file in Git candidates'})
        if path.stat().st_size>5_000_000:
            failures.append({'path':name,'issue':'oversized file requires review'});continue
        raw=path.read_bytes()
        if any(secret.encode() in raw for secret in actual):
            failures.append({'path':name,'issue':'configured secret found'})
        if b'\0' in raw:continue
        text=raw.decode('utf-8',errors='replace')
        if any(pattern.search(text) for pattern in patterns):
            failures.append({'path':name,'issue':'credential pattern found'})
    # Staged blobs can differ from working files. Scan those separately too.
    for name in filter(None,git('diff','--cached','--name-only','-z','--diff-filter=ACMR').decode().split('\0')):
        raw=git('show',':'+name)
        if any(secret.encode() in raw for secret in actual) or any(p.search(raw.decode('utf-8',errors='ignore')) for p in patterns):
            failures.append({'path':name,'issue':'credential found in staged content'})
    print(json.dumps({'files_checked':len(candidates),'failures':failures},ensure_ascii=False,indent=2))
    return bool(failures)


if __name__=='__main__':
    raise SystemExit(check())
