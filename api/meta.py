import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # ให้ import _http ได้ไม่ว่า runtime ตั้ง path ไว้อย่างไร
from _http import call  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        call(self, lambda s: s.meta())
