"""สถานะของผู้ใช้ที่เลือกซิงก์: รายการที่ใช้+โปรไฟล์, บันทึกสุขภาพ, เวลาเตือน เก็บเป็นเอกสาร JSON รูปแบบเดียวกับไฟล์ส่งออกของหน้าเว็บ
เซิร์ฟเวอร์ไม่แปลผลค่าสุขภาพ (ไม่มีคำว่าสูง/ต่ำ/ปกติ) ตรวจแค่โครงสร้าง ขนาด และชนิดข้อมูล กันขยะ/การยัดข้อมูลเกินกำหนด
เขียนทับกันจากหลายเครื่องกันด้วยเลขเวอร์ชัน (optimistic lock): ส่ง base_version ที่อ่านมา ถ้าไม่ตรง = 409 พร้อมสถานะล่าสุดให้ผู้ใช้เลือก
"""
import json
import re
from datetime import datetime, timezone

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_DOC_BYTES = {"tracker": 128 * 1024, "diary": 256 * 1024, "reminder": 1024}
MAX_ENTRIES, MAX_ITEMS = 400, 200
VITAL_RANGES = {"sys": (50, 260), "dia": (30, 160), "glucose": (20, 600), "weight": (2, 300)}  # ตัวกันพิมพ์ผิด ไม่ใช่เกณฑ์ทางการแพทย์


class StateError(Exception):
    def __init__(self, message: str, status: int = 400, extra: dict | None = None):
        super().__init__(message)
        self.status, self.extra = status, extra or {}


def _str(v, n):
    return isinstance(v, str) and 0 < len(v) <= n


def _date(v):
    return isinstance(v, str) and bool(DATE_RE.match(v))


def validate_tracker(d) -> None:
    if not isinstance(d, dict) or d.get("v") != 1 or not isinstance(d.get("items"), list) or not isinstance(d.get("profile"), dict):
        raise StateError("ข้อมูลรายการที่ใช้ไม่ถูกต้อง")
    if len(d["items"]) > MAX_ITEMS:
        raise StateError("จำนวนรายการเกินกำหนด")
    ids = set()
    for i in d["items"]:
        ok = (isinstance(i, dict) and _str(i.get("id"), 64) and i["id"] not in ids and i.get("kind") in ("herb", "drug", "formula")
              and _str(i.get("ref"), 100) and _str(i.get("label"), 100) and _date(i.get("start_date")) and (i.get("end_date") is None or _date(i.get("end_date"))))
        if not ok:
            raise StateError("รายการที่ใช้มีรูปแบบไม่ถูกต้อง")
        ids.add(i["id"])
    p = d["profile"]
    if not (p.get("age") is None or (isinstance(p.get("age"), int) and not isinstance(p.get("age"), bool) and 0 <= p["age"] <= 120)):
        raise StateError("อายุไม่ถูกต้อง")
    for k in ("pregnant", "breastfeeding"):  # หน้าเว็บเก็บเป็น "yes" / "no" / null
        if p.get(k) not in (None, "yes", "no"):
            raise StateError("โปรไฟล์ไม่ถูกต้อง")
    if not isinstance(p.get("conditions", []), list) or len(p.get("conditions", [])) > 40 or not all(_str(c, 64) for c in p.get("conditions", [])):
        raise StateError("เงื่อนไขสุขภาพไม่ถูกต้อง")


def validate_diary(d) -> None:
    if not isinstance(d, dict) or d.get("v") != 1 or not isinstance(d.get("entries"), list) or not isinstance(d.get("taken"), dict):
        raise StateError("ข้อมูลบันทึกสุขภาพไม่ถูกต้อง")
    if len(d["entries"]) > MAX_ENTRIES or len(d["taken"]) > 300 or len(d.get("dose") or {}) > 300:
        raise StateError("จำนวนบันทึกเกินกำหนด")
    dates = set()
    for e in d["entries"]:
        if not (isinstance(e, dict) and _str(e.get("id"), 64) and _date(e.get("date")) and e["date"] not in dates):
            raise StateError("บันทึกรายวันไม่ถูกต้อง")
        dates.add(e["date"])
        if not (e.get("mood") is None or (isinstance(e["mood"], int) and not isinstance(e["mood"], bool) and 1 <= e["mood"] <= 5)):
            raise StateError("ระดับความรู้สึกไม่ถูกต้อง")
        if not (e.get("symptom") is None or (isinstance(e["symptom"], str) and len(e["symptom"]) <= 200)):
            raise StateError("อาการยาวเกินกำหนด")
        for k, (lo, hi) in VITAL_RANGES.items():
            v = e.get(k)
            if not (v is None or (isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi)):
                raise StateError("ค่าที่บันทึกอยู่นอกช่วงที่รับได้")
    for k, days in d["taken"].items():
        if not (_str(k, 64) and isinstance(days, list) and len(days) <= MAX_ENTRIES and all(_date(x) for x in days)):
            raise StateError("ข้อมูลการกดว่าใช้ไม่ถูกต้อง")
    for k, v in (d.get("dose") or {}).items():
        if not (_str(k, 64) and isinstance(v, str) and len(v) <= 60):
            raise StateError("ขนาดที่จดไม่ถูกต้อง")


def validate_reminder(d) -> None:
    if not isinstance(d, dict) or not (d.get("time") is None or (isinstance(d["time"], str) and TIME_RE.match(d["time"]))) \
            or not (d.get("last") is None or _date(d["last"])):
        raise StateError("เวลาเตือนไม่ถูกต้อง")


VALIDATORS = {"tracker": validate_tracker, "diary": validate_diary, "reminder": validate_reminder}


def _now_iso(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def get_state(db, user_id: str) -> dict:
    r = await db.first("SELECT tracker, diary, reminder, version, updated_at FROM user_state WHERE user_id = ?", (user_id,))
    if not r:
        return {"version": 0, "updated_at": None, "tracker": None, "diary": None, "reminder": None}
    return {"version": r["version"], "updated_at": r["updated_at"], **{k: json.loads(r[k]) if r[k] else None for k in VALIDATORS}}


async def put_state(db, user_id: str, payload, now: datetime) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("base_version"), int) or isinstance(payload.get("base_version"), bool):
        raise StateError("ต้องระบุ base_version")
    if set(payload) - {"base_version", *VALIDATORS}:
        raise StateError("มีฟิลด์ที่ไม่รู้จัก")
    docs = {}
    for name, fn in VALIDATORS.items():
        if name in payload and payload[name] is not None:
            fn(payload[name])
            text = json.dumps(payload[name], ensure_ascii=False, separators=(",", ":"))
            if len(text.encode("utf-8")) > MAX_DOC_BYTES[name]:
                raise StateError("ข้อมูลใหญ่เกินกำหนด")
            docs[name] = text
    if not docs:
        raise StateError("ไม่มีข้อมูลที่จะบันทึก")
    base, ts = payload["base_version"], _now_iso(now)
    if base == 0:
        # สร้างครั้งแรก: ชนกันถ้ามีแถวแล้ว (อีกเครื่องสร้างไปก่อน)
        n = await db.run("INSERT INTO user_state(user_id, tracker, diary, reminder, version, updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(user_id) DO NOTHING",
                         (user_id, docs.get("tracker"), docs.get("diary"), docs.get("reminder"), ts))
    else:
        sets = ", ".join(f"{k} = ?" for k in docs)
        n = await db.run(f"UPDATE user_state SET {sets}, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?",
                         (*docs.values(), ts, user_id, base))
    if n == 0:
        raise StateError("ข้อมูลในคลาวด์ถูกแก้จากเครื่องอื่นแล้ว", 409, {"state": await get_state(db, user_id)})
    return await get_state(db, user_id)
