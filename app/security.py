import secrets
import time
from http.cookies import SimpleCookie

from starlette.responses import JSONResponse


class Security:
    def __init__(self, app, settings, sessions):
        self.app, self.s, self.sessions = app, settings, sessions

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope['headers']}
        path, method = scope['path'], scope['method']
        async def reject(code, message, status=403):
            response = JSONResponse({'error': {'code': code, 'message': message}}, status_code=status)
            await response(scope, receive, send)
        if headers.get('host') != f'127.0.0.1:{self.s.port}':
            return await reject('INVALID_HOST', '仅允许通过本机地址访问。')
        if headers.get('sec-fetch-site') == 'cross-site':
            return await reject('CROSS_SITE', '不允许跨站访问本地服务。')
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get('cookie', ''))
        except Exception:
            return await reject('SESSION', '会话无效。')
        sid = cookie.get('wt_session')
        sid = sid.value if sid else None
        session = self.sessions.get(sid)
        if session and session['expires'] < time.monotonic():
            self.sessions.pop(sid, None)
            session = None
        new_cookie = None
        if path == '/' and method == 'GET' and not session:
            for old in list(self.sessions):
                if self.sessions[old]['expires'] < time.monotonic():
                    self.sessions.pop(old, None)
            if len(self.sessions) > 200:
                return await reject('SESSION_LIMIT', '会话过多，请重启本地服务。', 429)
            sid = secrets.token_urlsafe(32)
            session = {'csrf': secrets.token_urlsafe(32), 'expires': time.monotonic()+43200}
            self.sessions[sid] = session
            new_cookie = f'wt_session={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'
        if path.startswith('/api/'):
            if not session:
                return await reject('SESSION_REQUIRED', '请刷新工作台建立本机会话。', 401)
            if method not in ('GET', 'HEAD'):
                if headers.get('origin') != self.s.origin:
                    return await reject('INVALID_ORIGIN', '写操作来源校验失败。')
                if not secrets.compare_digest(headers.get('x-csrf-token', ''), session['csrf']):
                    return await reject('CSRF', '页面会话已失效，请刷新。')
        scope.setdefault('state', {})['session'] = session
        limit = (self.s.max_mb * 1024 * 1024 + 1024*1024) if path == '/api/tasks' else 2*1024*1024
        try:
            length = int(headers.get('content-length', '0'))
            if length < 0:
                return await reject('BODY_LIMIT', '请求长度无效。', 400)
            if length > limit:
                return await reject('BODY_LIMIT', '请求内容超过大小限制。', 413)
        except ValueError:
            return await reject('BODY_LIMIT', '请求长度无效。', 400)
        consumed = 0
        async def limited_receive():
            nonlocal consumed
            message = await receive()
            consumed += len(message.get('body', b''))
            if consumed > limit:
                raise ValueError('REQUEST_BODY_LIMIT')
            return message
        async def secure_send(message):
            if message['type'] == 'http.response.start':
                h = list(message.get('headers', []))
                h.extend([(b'x-content-type-options', b'nosniff'), (b'x-frame-options', b'DENY'),
                          (b'referrer-policy', b'no-referrer'), (b'cache-control', b'no-store'),
                          (b'content-security-policy', b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")])
                if new_cookie:
                    h.append((b'set-cookie', new_cookie.encode()))
                message['headers'] = h
            await send(message)
        await self.app(scope, limited_receive, secure_send)
