import uvicorn
from app.config import load_settings
from app.main import create_app

if __name__ == '__main__':
    settings = load_settings()
    uvicorn.run(create_app(settings), host='127.0.0.1', port=settings.port,
                access_log=False, log_level='warning')
