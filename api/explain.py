import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _http import call, read_json  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        call(self, lambda s: s.explain(read_json(self)))
