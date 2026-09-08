import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    root: Path = ROOT
    data: Path = field(default_factory=lambda: ROOT / 'data')
    key: str = field(default='', repr=False)
    model: str = 'deepseek-v4-flash'
    base_url: str = 'https://api.deepseek.com'
    port: int = 8000
    max_mb: int = 50
    max_pages: int = 150
    timeout: int = 300
    max_output: int = 16384
    chunk_chars: int = 8000
    max_calls: int = 200
    max_tokens: int = 2000000
    ocr: bool = True

    @property
    def origin(self):
        return f'http://127.0.0.1:{self.port}'

    def validate(self):
        url = urlparse(self.base_url)
        if (url.scheme != 'https' or url.hostname != 'api.deepseek.com'
                or url.port not in (None, 443) or url.username or url.password
                or url.query or url.fragment or url.path not in ('', '/', '/v1', '/v1/')):
            raise ValueError('Only the official DeepSeek HTTPS endpoint is allowed.')
        if not 1024 <= self.port <= 65535:
            raise ValueError('APP_PORT must be between 1024 and 65535.')
        if not (1000 <= self.chunk_chars <= 100000 and 500 <= self.max_output <= 65536):
            raise ValueError('Invalid model context limits.')
        if min(self.max_calls, self.max_tokens, self.timeout, self.max_mb, self.max_pages) <= 0:
            raise ValueError('Resource limits must be positive.')
        self.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.data.chmod(0o700)


def load_settings():
    env = ROOT / '.env'
    if env.exists():
        env.chmod(0o600)
    load_dotenv(env, override=False)
    settings = Settings(
        key=os.getenv('DEEPSEEK_API_KEY', '').strip(),
        model=os.getenv('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
        base_url=os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').rstrip('/'),
        port=int(os.getenv('APP_PORT', '8000')),
        max_mb=int(os.getenv('MAX_UPLOAD_MB', '50')),
        max_pages=int(os.getenv('MAX_PDF_PAGES', '150')),
        timeout=int(os.getenv('MODEL_TIMEOUT_SECONDS', '300')),
        max_output=int(os.getenv('MODEL_MAX_OUTPUT_TOKENS', '16384')),
        chunk_chars=int(os.getenv('CHUNK_CHARACTERS', '8000')),
        max_calls=int(os.getenv('TASK_MAX_MODEL_CALLS', '200')),
        max_tokens=int(os.getenv('TASK_MAX_TOTAL_TOKENS', '2000000')),
        ocr=os.getenv('OCR_ENABLED', 'true').lower() == 'true',
    )
    settings.validate()
    return settings
