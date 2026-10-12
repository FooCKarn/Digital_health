"""เซิร์ฟเวอร์ทดสอบในเครื่อง จำลอง Vercel: เสิร์ฟ web/dist (ถ้ายังไม่ build ใช้ public/ เดิม) และเรียก handler ตัวเดียวกับ api/*.py
ใช้: (cd web && npm ci && npm run build) แล้ว python scripts/dev_server.py [port]   แล้วเปิด http://localhost:8000
"""
import asyncio
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "cloudflare" / "app"))
import analyze  # noqa: E402
import ask  # noqa: E402
import explain  # noqa: E402
import brief  # noqa: E402
import assistant  # noqa: E402
import feedback  # noqa: E402
import meta  # noqa: E402
import parse  # noqa: E402

# บัญชีผู้ใช้/ซิงก์: ใช้ router เดียวกับ Cloudflare Worker กับ SQLite ในเครื่อง (ไฟล์ .dev/herbguard.sqlite หรือ HERBGUARD_DEV_DB)
ROUTER_PREFIXES = ("/api/auth/", "/api/account", "/api/state")
_dev = {}


def _router_parts():
    if not _dev:
        import router
        from crypto import PyCrypto
        from db import SqliteDb
        path = os.environ.get("HERBGUARD_DEV_DB", str(ROOT / ".dev" / "herbguard.sqlite"))
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        db = SqliteDb(path)
        if not db.conn.execute("SELECT name FROM sqlite_master WHERE name='users'").fetchone():
            db.executescript((ROOT / "cloudflare" / "migrations" / "0002_accounts.sql").read_text(encoding="utf-8"))
        _dev.update(router=router, ctx=router.Ctx(db=db, crypto=PyCrypto(), secure_cookie=False))
    return _dev["router"], _dev["ctx"]


ROUTES = {("GET", "/api/meta"): meta.handler.do_GET, ("POST", "/api/analyze"): analyze.handler.do_POST,
          ("POST", "/api/feedback"): feedback.handler.do_POST,
          ("POST", "/api/parse"): parse.handler.do_POST, ("POST", "/api/explain"): explain.handler.do_POST,
          ("POST", "/api/ask"): ask.handler.do_POST,
          ("POST", "/api/brief"): brief.handler.do_POST, ("POST", "/api/assistant"): assistant.handler.do_POST}


class Dev(SimpleHTTPRequestHandler):
    def _router(self, method):
        path = self.path.split("?")[0]
        if not path.startswith(ROUTER_PREFIXES):
            return False
        import json
        router, ctx = _router_parts()
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n <= 400 * 1024 else b""
        req = router.Request(method, path, {k.lower(): v for k, v in self.headers.items()}, body, self.client_address[0])
        r = asyncio.run(router.handle(req, ctx))
        data = json.dumps(r.body, ensure_ascii=False).encode("utf-8")
        self.send_response(r.status)
        for k, v in r.headers.items():
            self.send_header(k, v)
        for c in r.cookies:
            self.send_header("Set-Cookie", c)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

    def _route(self, method):
        if self._router(method):
            return True
        fn = ROUTES.get((method, self.path.split("?")[0]))
        if fn:
            fn(self)  # handler ของ Vercel ใช้เฉพาะ self.headers/rfile/send_*/wfile ซึ่งตัวนี้มีครบ
            return True
        return False

    def do_GET(self):
        self._route("GET") or super().do_GET()

    def do_POST(self):
        self._route("POST") or self.send_error(404)

    def do_PUT(self):
        self._router("PUT") or self.send_error(404)

    def do_DELETE(self):
        self._router("DELETE") or self.send_error(404)


def static_dir(dist=None):
    """หน้าใหม่ web/dist (ผล npm run build) ถ้ามี ไม่งั้นหน้าเดิม public/"""
    dist = Path(dist) if dist else ROOT / "web" / "dist"
    if (dist / "index.html").is_file():
        return dist
    print(f"ไม่พบ {dist / 'index.html'}: run npm run build in web/ (ตอนนี้เสิร์ฟหน้าเดิม public/)", file=sys.stderr)
    return ROOT / "public"


def make_server(port=8000, dist=None):
    return ThreadingHTTPServer(("127.0.0.1", port), partial(Dev, directory=str(static_dir(dist))))


if __name__ == "__main__":
    make_server(int(sys.argv[1]) if len(sys.argv) > 1 else 8000).serve_forever()
