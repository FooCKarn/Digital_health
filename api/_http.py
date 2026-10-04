"""ตัวช่วย HTTP ร่วมของ api/*.py (ขึ้นต้นด้วย _ เพื่อไม่ให้ Vercel นับเป็น endpoint)"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))
import service  # noqa: E402

MAX_BODY = 64 * 1024


def send(handler, status: int, body: dict) -> None:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def read_json(handler):
    n = int(handler.headers.get("Content-Length") or 0)
    if n > MAX_BODY:
        raise ValueError("ข้อมูลใหญ่เกินไป")
    return json.loads(handler.rfile.read(n) or b"null")
