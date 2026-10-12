"""ให้ engine (ซิงก์) เรียก LLM ผ่าน fetch (อะซิงก์) ของ Cloudflare Workers ได้ โดยไม่แก้ตรรกะของ engine

Pyodide เปิดซ็อกเก็ตเองไม่ได้ วิธี: ฉีดตัวส่ง (llm.set_transport) ที่ "เล่นซ้ำ" คำตอบที่ดึงมาแล้ว
รอบแรกเจอคำขอที่ยังไม่มีคำตอบ -> โยน NeedFetch (BaseException เพื่อไม่ให้ except Exception ใน engine กลืน) -> ดึงจริงแบบ await -> เรียกฟังก์ชันซ้ำ
ฟังก์ชันของ engine เป็นฟังก์ชันล้วนจึงเรียกซ้ำได้ผลเดิม (จุดที่มีโซ่รุ่นสำรองอาจดึงหลายครั้ง ได้ไม่เกิน MAX_FETCHES ครั้ง)
"""
import io
import json
import urllib.error

import llm

MAX_FETCHES = 6


class NeedFetch(BaseException):
    def __init__(self, req, budget):
        super().__init__("need fetch")
        self.req, self.budget = req, budget


def _key(req):
    return (req.full_url, bytes(req.data or b""))


def _transport(cache: dict):
    def send(req, budget=None):
        hit = cache.get(_key(req))
        if hit is None:
            raise NeedFetch(req, budget)
        status, body = hit
        if status is None:  # ดึงไม่สำเร็จ (เครือข่าย/หมดเวลา)
            raise llm.LLMUnavailable(body.decode("utf-8", "replace") or "เรียก LLM ไม่สำเร็จ")
        if status >= 400:
            raise urllib.error.HTTPError(req.full_url, status, "", {}, io.BytesIO(body))
        return json.loads(body)
    return send


async def run_with_llm(fn, fetch):
    """fn() เรียก engine ที่อาจใช้ LLM; fetch(url, headers, body_bytes, timeout_s) -> (status, body_bytes) เป็นฟังก์ชัน async"""
    cache: dict = {}
    try:
        for _ in range(MAX_FETCHES + 1):
            llm.set_transport(_transport(cache))
            try:
                return fn()
            except NeedFetch as n:
                req = n.req
                try:
                    cache[_key(req)] = await fetch(req.full_url, dict(req.header_items()), bytes(req.data or b""), n.budget or 45.0)
                except Exception as e:  # noqa: BLE001  เครือข่ายล้ม = ให้ engine ใช้ทางสำรองตามปกติ (LLMUnavailable)
                    cache[_key(req)] = (None, f"เรียก LLM ไม่สำเร็จ ({type(e).__name__})".encode())
        raise llm.LLMUnavailable("เรียก LLM หลายครั้งเกินกำหนด")
    finally:
        llm.set_transport(None)
