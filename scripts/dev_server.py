"""เซิร์ฟเวอร์ทดสอบในเครื่อง จำลอง Vercel: เสิร์ฟ public/ และเรียก handler ตัวเดียวกับ api/*.py
ใช้: python scripts/dev_server.py [port]   แล้วเปิด http://localhost:8000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
import analyze  # noqa: E402
import meta  # noqa: E402

ROUTES = {("GET", "/api/meta"): meta.handler.do_GET, ("POST", "/api/analyze"): analyze.handler.do_POST}


class Dev(SimpleHTTPRequestHandler):
    def _route(self, method):
        fn = ROUTES.get((method, self.path.split("?")[0]))
        if fn:
            fn(self)  # handler ของ Vercel ใช้เฉพาะ self.headers/rfile/send_*/wfile ซึ่งตัวนี้มีครบ
            return True
        return False

    def do_GET(self):
        self._route("GET") or super().do_GET()

    def do_POST(self):
        self._route("POST") or self.send_error(404)


def make_server(port=8000):
    return ThreadingHTTPServer(("127.0.0.1", port), partial(Dev, directory=str(ROOT / "public")))


if __name__ == "__main__":
    make_server(int(sys.argv[1]) if len(sys.argv) > 1 else 8000).serve_forever()
