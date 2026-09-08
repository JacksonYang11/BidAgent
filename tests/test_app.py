import json
import time
from pathlib import Path

import fitz
import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import ModelClient, UserError, verify
from app.config import ROOT, Settings
from app.main import create_app
from app.models import Analysis, Chapter, Evidence, Item, Outline
from app.store import Store, uid


class FakeModel(ModelClient):
    """Only injected into tests; the runnable application has no mock mode."""
    def call(self, job, system, payload, schema, check, progress=None):
        check()
        if schema is Analysis:
            if 'blocks' not in payload:
                return Analysis()
            block = payload['blocks'][0]
            evidence = Evidence(block_id=block['id'], quote=block['text'][:100])
            return Analysis(project_name='虚构测试项目', business_type='人力资源外包',
                requirements=[Item(name='服务要求',value='项目经理1名',evidence=[evidence])],
                scores=[Item(name='技术评分',value='提交实施方案',points='80分',evidence=[evidence])],
                risks=[Item(name='风险测试',value='投标无效',risk_type='invalid',evidence=[evidence])])
        if schema is Outline:
            reqs=[i['id'] for i in payload['analysis']['requirements']]
            scores=[i['id'] for i in payload['analysis']['scores']]
            return Outline(title='虚构测试项目投标初稿',chapters=[Chapter(title=t,requirement_ids=reqs,score_ids=scores) for t in ['项目理解','人员安排','质量管理']])
        chapter=payload['chapter']
        return Chapter(**dict(chapter, blocks=[{'type':'paragraph','text':'本章为虚构测试输出。企业名称：【待补充：企业名称】。'},
            {'type':'table','headers':['岗位','人数'], 'rows':[['项目经理','1'],['招聘顾问','2']]}]))


@pytest.fixture
def client(tmp_path):
    settings=Settings(data=tmp_path/'data',key='TEST_ONLY_CREDENTIAL_SENTINEL')
    app=create_app(settings, client_factory=FakeModel)
    with TestClient(app,base_url='http://127.0.0.1:8000',raise_server_exceptions=False) as browser:
        browser.get('/')
        token=browser.get('/api/session').json()['csrf']
        browser.headers.update({'Origin':'http://127.0.0.1:8000','X-CSRF-Token':token})
        yield browser,app


def pdf_bytes():
    doc=fitz.open();page=doc.new_page();page.insert_text((40,60),'Test tender. Project manager: 1. Invalid late submissions. Technical score: 80.',fontsize=12)
    return doc.tobytes()


def wait(browser,job_id):
    for _ in range(200):
        job=browser.get('/api/jobs/'+job_id).json()
        if job['status'] not in ('queued','running'):
            assert job['status']=='succeeded',job
            return job
        time.sleep(.05)
    pytest.fail('Job timed out')


def test_security_boundary(client):
    browser,app=client
    assert browser.get('/',headers={'Host':'attacker.invalid'}).status_code==403
    assert browser.post('/api/model/check',headers={'Origin':'https://evil.test'}).status_code==403
    assert browser.post('/api/model/check',headers={'X-CSRF-Token':'wrong'}).status_code==403
    assert browser.get('/api/status',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403
    status=browser.get('/api/status')
    assert 'TEST_ONLY_CREDENTIAL_SENTINEL' not in status.text
    assert 'frame-ancestors' in status.headers['Content-Security-Policy']
    response=browser.put('/api/company-profile',json={'password':'TEST_ONLY_CREDENTIAL_SENTINEL'})
    assert response.status_code==422 and 'TEST_ONLY_CREDENTIAL_SENTINEL' not in response.text
    assert browser.get('/data/app.db').status_code==404
    assert browser.get('/static/../../.env').status_code!=200
    with TestClient(app,base_url='http://127.0.0.1:8000') as stranger:
        assert stranger.get('/api/tasks').status_code==401


def test_full_flow_and_versions(client):
    browser,app=client
    response=browser.post('/api/tasks',files={'file':('test.pdf',pdf_bytes(),'application/pdf')})
    assert response.status_code==202,response.text
    task_id=response.json()['task']['id'];wait(browser,response.json()['job']['id'])
    assert browser.get('/api/tasks/'+task_id).json()['extracted']
    assert browser.get('/api/tasks/'+task_id+'/source',headers={'Range':'bytes=0-9'}).status_code==206
    assert browser.post('/api/tasks/'+task_id+'/analyze',json={}).status_code==400
    job=browser.post('/api/tasks/'+task_id+'/analyze',json={'consent':True}).json();wait(browser,job['id'])
    result=browser.get('/api/tasks/'+task_id+'/analysis').json()
    assert result['analysis']['requirements'][0]['evidence'][0]['status']=='matched'
    edited=json.loads(json.dumps(result));edited['analysis']['requirements'][0]['value']='修改后'
    saved=browser.put('/api/tasks/'+task_id+'/analysis',json=edited)
    assert saved.status_code==200
    assert browser.put('/api/tasks/'+task_id+'/analysis',json=edited).status_code==409
    generated=browser.post('/api/tasks/'+task_id+'/drafts',json={'consent':True,'allow_incomplete':True}).json()
    wait(browser,generated['job']['id']);draft_id=generated['draft_id']
    draft=browser.get('/api/drafts/'+draft_id).json();assert len(draft['chapters'])==3
    chapter=draft['chapters'][0];chapter['blocks'][0]['text']='人工编辑后的内容'
    response=browser.put(f'/api/drafts/{draft_id}/chapters/{chapter["id"]}',json={'revision':draft['revision'],'chapter':chapter})
    assert response.status_code==200
    export=browser.post(f'/api/drafts/{draft_id}/exports').json()
    download=browser.get('/api/exports/'+export['id']+'/download')
    assert download.status_code==200 and download.content.startswith(b'PK')
    from io import BytesIO
    from docx import Document
    doc=Document(BytesIO(download.content));assert '人工编辑后的内容' in '\n'.join(p.text for p in doc.paragraphs)
    assert 'TEST_ONLY_CREDENTIAL_SENTINEL'.encode() not in download.content
    assert browser.post(f'/api/drafts/{draft_id}/restore').status_code==200
    assert browser.delete('/api/tasks/'+task_id).status_code==200
    assert not app.state.store.task_dir(task_id).exists()
    assert browser.get('/api/exports/'+export['id']+'/download').status_code==400


def test_upload_rejections_and_missing_key(client):
    browser,app=client
    assert browser.post('/api/tasks',files={'file':('file.txt',b'abc')}).status_code==415
    assert browser.post('/api/tasks',files={'file':('file.pdf',b'not a pdf')}).status_code==400
    app.state.settings.key=''
    assert browser.post('/api/model/check').json()['error']['code']=='MODEL_NOT_CONFIGURED'


def test_evidence_does_not_invent_pages():
    result=Analysis(risks=[Item(name='扣分',risk_type='invalid',evidence=[Evidence(block_id='p1-b1',quote='未提供证明该项不得分',page=99)])])
    pages=[{'blocks':[{'id':'p1-b1','text':'未提供证明该项不得分','page':1,'method':'text','bbox':[0,0,1,1]}]}]
    result=verify(result,pages)
    assert result.risks[0].risk_type=='review'
    assert result.risks[0].evidence[0].page==1
    result.risks[0].evidence[0].quote='捏造的引文'
    assert verify(result,pages).risks[0].evidence[0].status=='unmatched'


def test_official_endpoint_only(tmp_path):
    for address in ['http://api.deepseek.com','https://evil.test','https://api.deepseek.com@evil.test','https://api.deepseek.com/redirect']:
        with pytest.raises(ValueError):
            Settings(data=tmp_path,base_url=address).validate()


def test_model_auth_redacted(tmp_path,monkeypatch):
    settings=Settings(data=tmp_path,key='TEST_ONLY_CREDENTIAL_SENTINEL');settings.validate();store=Store(tmp_path)
    model=ModelClient(settings,store);job={'id':uid(),'calls':0,'reserved_tokens':0};store.put('job',job['id'],job)
    class FakeHTTP:
        def __init__(self,**kwargs):
            assert kwargs['trust_env'] is False and kwargs['follow_redirects'] is False
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def post(self,url,headers,json):
            assert url=='https://api.deepseek.com/chat/completions'
            assert headers['Authorization']=='Bearer TEST_ONLY_CREDENTIAL_SENTINEL'
            assert 'TEST_ONLY_CREDENTIAL_SENTINEL' not in str(json)
            return httpx.Response(401,json={'error':'TEST_ONLY_CREDENTIAL_SENTINEL'})
    monkeypatch.setattr(httpx,'Client',FakeHTTP)
    with pytest.raises(UserError) as exc:model.call(job,'test',{},Analysis,lambda:None)
    assert exc.value.code=='MODEL_AUTH' and 'TEST_ONLY' not in exc.value.message


def test_restart_marks_interrupted(tmp_path):
    settings=Settings(data=tmp_path);app=create_app(settings)
    app.state.store.put('job','old',{'id':'old','status':'running'})
    with TestClient(app,base_url='http://127.0.0.1:8000'):
        assert app.state.store.get('job','old')['status']=='interrupted'


def test_ocr_mixed_and_scan(tmp_path):
    from scripts.make_sample import create_samples
    from app.pdf_worker import extract
    create_samples(tmp_path)
    for name in ('scanned-tender','mixed-tender'):
        pages=extract(tmp_path/(name+'.pdf'),tmp_path/(name+'.json'))
        text=''.join(b['text'] for p in pages for b in p['blocks'])
        assert pages[0]['ocr'] and '评分' in text and '80' in text and '20' in text


def test_cancel_blocks_duplicate_work(client, monkeypatch):
    import threading
    browser, app = client
    entered = threading.Event()
    def waiting_call(self, job, system, payload, schema, check, progress=None):
        entered.set()
        for _ in range(200):
            check()
            time.sleep(.01)
        return Analysis()
    monkeypatch.setattr(FakeModel, 'call', waiting_call)
    job = browser.post('/api/model/check').json()
    assert entered.wait(2)
    assert browser.post('/api/model/check').status_code == 409
    assert browser.post('/api/jobs/'+job['id']+'/cancel').status_code == 200
    for _ in range(100):
        result = browser.get('/api/jobs/'+job['id']).json()
        if result['status'] == 'cancelled':
            break
        time.sleep(.02)
    assert result['status'] == 'cancelled'


def test_model_budget_prevents_network(tmp_path, monkeypatch):
    settings = Settings(data=tmp_path, key='TEST_ONLY_CREDENTIAL_SENTINEL', max_tokens=1)
    settings.validate()
    store = Store(tmp_path)
    job = {'id':uid(), 'calls':0, 'reserved_tokens':0}
    store.put('job',job['id'],job)
    def forbidden(*args, **kwargs):
        pytest.fail('Budget exhaustion must prevent an HTTP call')
    monkeypatch.setattr(httpx,'Client',forbidden)
    with pytest.raises(UserError) as exc:
        ModelClient(settings,store).call(job,'test',{},Analysis,lambda:None)
    assert exc.value.code == 'MODEL_BUDGET'


def test_persistence_and_symlink_boundary(tmp_path):
    directory = tmp_path/'data'
    directory.mkdir()
    store = Store(directory)
    identifier = uid()
    store.put('task',identifier,{'id':identifier,'filename':'persisted.pdf'})
    assert Store(directory).get('task',identifier)['filename'] == 'persisted.pdf'
    outside = tmp_path/'outside'
    outside.mkdir()
    (directory/'tasks').mkdir()
    (directory/'tasks'/identifier).symlink_to(outside,target_is_directory=True)
    with pytest.raises(ValueError):
        store.task_file(identifier,'source.pdf')
    with pytest.raises(ValueError):
        store.task_file('../outside','source.pdf')


def test_docx_title_has_no_template_border(client):
    from app.exporter import export_word
    from zipfile import ZipFile
    from lxml import etree
    browser, app = client
    target = app.state.settings.data/'font-check.docx'
    draft = {'title':'中文测试', 'profile':{'name':'','is_demo':False},'chapters':[], 'coverage':[]}
    export_word(draft,target)
    with ZipFile(target) as archive:
        styles = etree.fromstring(archive.read('word/styles.xml'))
        ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        title = styles.xpath('//w:style[@w:styleId="Title"]',namespaces=ns)[0]
        assert not title.xpath('./w:pPr/w:pBdr',namespaces=ns)
        assert title.xpath('./w:rPr/w:rFonts/@w:eastAsia',namespaces=ns) == ['SimSun']
