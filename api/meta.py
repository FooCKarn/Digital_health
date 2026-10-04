from http.server import BaseHTTPRequestHandler

from _http import send, service


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send(self, 200, service.meta())
