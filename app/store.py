import json
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


class Store:
    def __init__(self, directory):
        self.directory = directory.resolve()
        self.lock = threading.RLock()
        with self.connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS objects (kind TEXT, id TEXT, body TEXT, PRIMARY KEY(kind,id))')

    def connect(self):
        con = sqlite3.connect(self.directory / 'app.db', timeout=10)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('PRAGMA foreign_keys=ON')
        return con

    def get(self, kind, identifier):
        with self.connect() as con:
            row = con.execute('SELECT body FROM objects WHERE kind=? AND id=?', (kind, identifier)).fetchone()
            return json.loads(row[0]) if row else None

    def put(self, kind, identifier, body):
        with self.lock, self.connect() as con:
            con.execute('INSERT OR REPLACE INTO objects VALUES (?,?,?)',
                        (kind, identifier, json.dumps(body, ensure_ascii=False)))
        return body

    def all(self, kind):
        with self.connect() as con:
            return [json.loads(r[0]) for r in con.execute('SELECT body FROM objects WHERE kind=?', (kind,))]

    def delete(self, kind, identifier):
        with self.lock, self.connect() as con:
            con.execute('DELETE FROM objects WHERE kind=? AND id=?', (kind, identifier))

    def task_dir(self, identifier):
        if not re.fullmatch(r'[a-f0-9]{32}', identifier):
            raise ValueError('Invalid task identifier')
        folder = self.directory / 'tasks' / identifier
        if folder.is_symlink() or (folder.exists() and not folder.resolve().is_relative_to(self.directory)):
            raise ValueError('Invalid task path')
        return folder

    def task_file(self, identifier, filename):
        if filename not in ('source.pdf', 'pages.json') and not re.fullmatch(r'[a-f0-9]{32}\.docx', filename):
            raise ValueError('Invalid file name')
        path = self.task_dir(identifier) / filename
        if path.is_symlink() or not path.resolve().is_relative_to(self.directory):
            raise ValueError('Invalid file path')
        return path
