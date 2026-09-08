"""Isolated UI test server. Never run this for a customer demonstration."""
import uvicorn
from app.config import ROOT, Settings
from app.main import create_app
from tests.test_app import FakeModel

if __name__ == '__main__':
    settings=Settings(data=ROOT/'tmp/browser-fixture',port=8001,key='TEST_ONLY_CREDENTIAL_SENTINEL')
    uvicorn.run(create_app(settings,client_factory=FakeModel),host='127.0.0.1',port=8001,access_log=False,log_level='warning')
