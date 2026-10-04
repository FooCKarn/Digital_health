from http.server import BaseHTTPRequestHandler

from _http import read_json, send, service


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            send(self, 200, service.run(read_json(self)))
        except ValueError as e:  # รวม json.JSONDecodeError; ไม่เปิดเผยรายละเอียดภายในเซิร์ฟเวอร์
            send(self, 400, {"error": str(e)})
