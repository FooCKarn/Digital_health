"""คำแปลอังกฤษแบบเสริม: ตารางข้อความไทย -> อังกฤษ จาก data/en_translations.json

ไม่แตะข้อมูลเดิมและไม่เปลี่ยนผลตัดสิน: ผลตรวจยังมีฟิลด์ *_th ครบเหมือนเดิม ส่วนฟิลด์ *_en ใส่เพิ่มเมื่อมีคำแปลครบเท่านั้น
ถ้าไม่มีไฟล์ (เช่น Cloudflare Worker ที่ไม่มีโฟลเดอร์ data/) ทุกฟิลด์ *_en จะไม่ถูกใส่ และหน้าเว็บแสดงภาษาไทยแทน
คำแปลเป็นร่างที่ผู้เชี่ยวชาญยังไม่ได้ตรวจ เหมือนข้อมูลคำเตือนเอง
"""
import json
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "data" / "en_translations.json"


def _load() -> dict:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


EN: dict = _load()


def configure(table: dict) -> None:
    """ตั้งตารางคำแปลเอง (สำหรับที่ที่ไม่มีไฟล์ใน data/)"""
    global EN
    EN = dict(table)


def en(text):
    """คำแปลของข้อความไทย หรือ None ถ้ายังไม่มี"""
    return EN.get(text) if isinstance(text, str) else None
