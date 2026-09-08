import json

import httpx
import pytest

from app.ai import ModelClient, UserError, analyze, chunks
from app.config import Settings
from app.models import Analysis, Chapter, Evidence, Item
from app.store import Store, uid


def setup_model(tmp_path, **options):
    settings = Settings(data=tmp_path, key='TEST_ONLY_CREDENTIAL_SENTINEL', **options)
    settings.validate()
    store = Store(tmp_path)
    job = {'id': uid(), 'task_id': uid(), 'calls': 0, 'reserved_tokens': 0}
    store.put('job', job['id'], job)
    return ModelClient(settings, store), job


def install_http(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(
        transport=httpx.MockTransport(handler), **kwargs))


def response(result=None, finish='stop', usage=None):
    body = {'choices': [{'finish_reason': finish, 'message': {
        'content': (result or Analysis()).model_dump_json()}}]}
    if usage is not None:
        body['usage'] = usage
    return httpx.Response(200, json=body)


def test_non_thinking_and_usage_settlement(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path, max_output=1000, max_tokens=10000)
    requests = []

    def handle(request):
        payload = json.loads(request.content)
        requests.append(payload)
        assert payload['thinking'] == {'type': 'disabled'}
        assert payload['max_tokens'] == 1000
        return response(usage={'total_tokens': 100, 'completion_tokens': 10})

    install_http(monkeypatch, handle)
    for _ in range(3):
        model.call(job, 'JSON test', {}, Analysis, lambda: None)
    saved = model.store.get('job', job['id'])
    assert len(requests) == saved['calls'] == 3
    assert saved['reserved_tokens'] == saved['actual_tokens'] == 300
    calls = model.store.all('call')
    assert all(c['finish_reason'] == 'stop' and c['thinking'] == 'disabled' for c in calls)


def test_missing_usage_keeps_reservation(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path)
    install_http(monkeypatch, lambda request: response())
    model.call(job, 'test', {}, Analysis, lambda: None)
    saved = model.store.get('job', job['id'])
    assert saved['reserved_tokens'] > model.s.max_output
    assert saved.get('actual_tokens', 0) == 0


def test_usage_above_reservation_stops_next_call(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path, max_tokens=50000)
    install_http(monkeypatch, lambda request: response(usage={'total_tokens': 60000}))
    model.call(job, 'test', {}, Analysis, lambda: None)
    with pytest.raises(UserError, match='MODEL_BUDGET'):
        model.call(job, 'test', {}, Analysis, lambda: None)
    assert model.store.get('job', job['id'])['calls'] == 1


def test_generation_expands_output_with_a_cap(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path, max_output=32000)
    limits = []

    def handle(request):
        limits.append(json.loads(request.content)['max_tokens'])
        return response(Chapter(title='测试'), 'length' if len(limits) < 3 else 'stop',
                        {'total_tokens': 100})

    install_http(monkeypatch, handle)
    assert model.call(job, 'test', {}, Chapter, lambda: None).title == '测试'
    assert limits == [32000, 64000, 65536]
    assert model.store.get('job', job['id'])['actual_tokens'] == 300


def sample_pages(long=False):
    return [{'page': 1, 'warnings': [], 'blocks': [
        {'id': f'b{i}', 'page': 1, 'kind': 'paragraph', 'text':
         (''.join(f'第{n:04}条：项目经理须按时到岗，提供相关证明。' for n in range(800))
          if long else f'服务条款{i}，须提供证明。'),
         'method': 'text', 'bbox': [0, 0, 100, 100]} for i in range(1 if long else 4)]}]


def test_oversized_block_split_retains_text_and_source():
    pages = sample_pages(long=True)
    original = pages[0]['blocks'][0]['text']
    pieces = list(chunks(pages, 1000))
    assert len(pieces) > 1
    end = 0
    for piece in pieces:
        assert len(json.dumps(piece, ensure_ascii=False)) <= 1000
        for block in piece:
            assert block['id'] == 'b0' and block['text'] in original
            # Every boundary retains overlapping original text.
            start = original.find(block['text'], max(0, end-len(block['text'])))
            assert 0 <= start <= end
            end = max(end, start+len(block['text']))
    assert end == len(original)


def test_truncation_split_resume_and_evidence(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path)
    pages = sample_pages()
    called = []
    fail_second = True

    def call(job, system, payload, schema, check):
        ids = tuple(b['id'] for b in payload['blocks'])
        called.append(ids)
        if len(ids) > 2:
            raise UserError('MODEL_TRUNCATED', 'truncated')
        if fail_second and ids[0] == 'b2':
            raise UserError('MODEL_NETWORK', 'network')
        return Analysis(requirements=[Item(name=b['id'], evidence=[
            Evidence(block_id=b['id'], quote=b['text'])]) for b in payload['blocks']])

    monkeypatch.setattr(model, 'call', call)
    with pytest.raises(UserError, match='MODEL_NETWORK'):
        analyze(model, job, pages, lambda: None, lambda *args: None)
    assert len(model.store.all('fragment')) == 1
    assert len(model.store.all('fragment_plan')) == 1
    called.clear()
    fail_second = False
    progress = []
    result = analyze(model, job, pages, lambda: None, lambda *args: progress.append(args))
    assert called == [('b2', 'b3')]
    assert len(result.requirements) == 4
    assert all(i.evidence[0].status == 'matched' for i in result.requirements)
    assert ('analyzing', 2, 2) in progress


def test_truncation_is_bounded(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path)
    called = []

    def call(*args, **kwargs):
        called.append(True)
        raise UserError('MODEL_TRUNCATED', 'truncated')

    monkeypatch.setattr(model, 'call', call)
    with pytest.raises(UserError, match='MODEL_TRUNCATED') as error:
        analyze(model, job, sample_pages(long=True), lambda: None, lambda *args: None)
    assert len(called) <= 5
    assert '已完成 0/' in error.value.message
    assert not model.store.all('fragment')


def test_cancellation_not_overwritten_on_response(tmp_path, monkeypatch):
    model, job = setup_model(tmp_path)

    def handle(request):
        saved = model.store.get('job', job['id'])
        saved['cancel'] = True
        model.store.put('job', job['id'], saved)
        return response(usage={'total_tokens': 100})

    def check():
        if model.store.get('job', job['id']).get('cancel'):
            raise UserError('CANCELLED', 'cancelled')

    install_http(monkeypatch, handle)
    with pytest.raises(UserError, match='CANCELLED'):
        model.call(job, 'test', {}, Analysis, check)
    assert model.store.get('job', job['id'])['actual_tokens'] == 100


def test_relaxed_configuration_still_validates(tmp_path):
    Settings(data=tmp_path, max_output=65536, chunk_chars=100000).validate()
    with pytest.raises(ValueError):
        Settings(data=tmp_path, max_output=65537).validate()
