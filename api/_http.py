"""ตัวช่วย HTTP ร่วมของ api/*.py (ขึ้นต้นด้วย _ เพื่อไม่ให้ Vercel นับเป็น endpoint)

import service แบบ lazy ใน call() เพื่อไม่ให้ฟังก์ชันตายตั้งแต่โหลดโมดูลถ้าหาไฟล์ข้อมูลไม่เจอ
ข้อผิดพลาดภายในส่งกลับเป็น JSON (ชื่อ error + ข้อความ ไม่มี traceback ไม่มีความลับ ใช้ข้อมูลสมมติเท่านั้น)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

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


def call(handler, fn) -> None:
    """รัน fn(service) แล้วตอบ JSON: ValueError -> 400, อย่างอื่น -> 500 พร้อมสาเหตุ"""
    try:
        import service
        send(handler, 200, fn(service))
    except ValueError as e:  # รวม json.JSONDecodeError
        send(handler, 400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        send(handler, 500, {"error": "server_error", "detail": f"{type(e).__name__}: {e}"})
