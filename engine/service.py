"""ชั้นบริการสำหรับเว็บ (Vercel): ตรวจ input ที่ขอบระบบ แล้วเรียก engine เดิม ไม่มีตรรกะกฎอยู่ที่นี่

meta() -> ข้อมูลให้หน้าเว็บสร้างฟอร์ม; run(payload) -> {"result", "summary"}; ข้อมูลไม่ถูกต้อง -> ValueError
"""
import json
from pathlib import Path

import llm
from check import check
from summary import pharmacist_summary

ROOT = Path(__file__).resolve().parent.parent
_load = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = _load("data/herbs.json"), _load("data/drug_class_map.json"), _load("data/config.json")
CONDS = _load("data/conditions.json")["conditions"]
TAGS = _load("data/mechanism_tags.json")["tags"]
HERB_IDS = {h["id"] for h in HERBS["herbs"]}


def meta() -> dict:
    return {
        "herbs": [{"id": h["id"], "name_th": h["name_th"], "parts": h["parts"]} for h in HERBS["herbs"]],
        "drugs": [e["names"][0] for e in DRUGS["entries"]],
        "conditions": CONDS,
        "coverage": {"herbs_in_db": len(HERB_IDS), "herbs_in_book": 50,
                     "drug_classes_in_db": len({c for e in DRUGS["entries"] for c in e["class"]})},
        "disclaimer_th": CONFIG["disclaimer_th"],
    }


def _int(v, lo, hi, name):
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise ValueError(f"{name} ต้องเป็นจำนวนเต็ม {lo}-{hi}")
    return v


def validate(payload) -> dict:
    """คืน input ที่สะอาดสำหรับ engine หรือโยน ValueError (ห้ามส่ง input ดิบเข้า engine)"""
    if not isinstance(payload, dict):
        raise ValueError("ข้อมูลต้องเป็น JSON object")
    herbs, drugs, prof = payload.get("herbs"), payload.get("drugs", []), payload.get("profile", {})
    if not isinstance(herbs, list) or not 1 <= len(herbs) <= 50:
        raise ValueError("herbs ต้องมี 1-50 รายการ")
    if not isinstance(drugs, list) or len(drugs) > 30 or not all(isinstance(d, str) and 0 < len(d.strip()) <= 100 for d in drugs):
        raise ValueError("drugs ต้องเป็นรายการข้อความ (ไม่เกิน 30 รายการ รายการละไม่เกิน 100 ตัวอักษร)")
    if not isinstance(prof, dict):
        raise ValueError("profile ต้องเป็น object")

    clean_herbs = []
    for h in herbs:
        if not isinstance(h, dict) or not isinstance(h.get("id"), str) or len(h["id"]) > 50:
            raise ValueError("herbs[].id ไม่ถูกต้อง")
        item = {"id": h["id"]}
        if h.get("part") is not None:
            if not isinstance(h["part"], str) or len(h["part"]) > 100:
                raise ValueError("herbs[].part ไม่ถูกต้อง")
            item["part"] = h["part"]
        if h.get("days_in_use") is not None:
            item["days_in_use"] = _int(h["days_in_use"], 0, 365, "days_in_use")
        clean_herbs.append(item)

    profile = {}
    if prof.get("age") is not None:  # ไม่ระบุอายุ = ไม่ใส่คีย์ เพื่อให้ engine แสดง "ยังไม่ได้ตรวจ"
        profile["age"] = _int(prof["age"], 0, 120, "age")
    for k in ("pregnant", "breastfeeding"):
        if k in prof:
            if not isinstance(prof[k], bool):
                raise ValueError(f"{k} ต้องเป็น true/false")
            profile[k] = prof[k]
    conds = prof.get("conditions", [])
    if not isinstance(conds, list) or not all(isinstance(c, str) and c in CONDS for c in conds):
        raise ValueError("conditions มีรหัสที่ไม่รู้จัก")
    profile["conditions"] = conds
    return {"herbs": clean_herbs, "drugs": [d.strip() for d in drugs], "profile": profile}


def run(payload) -> dict:
    inp = validate(payload)
    result = check(inp, HERBS, DRUGS, CONFIG, TAGS)
    return {"result": result, "summary": pharmacist_summary(inp, result, HERBS, CONFIG)}


class ServiceUnavailable(Exception):
    """ฟีเจอร์ LLM ใช้ไม่ได้ (ไม่มี API key / เรียกไม่สำเร็จ) -> HTTP 503"""


def parse(payload) -> dict:
    """LLM จุดที่ 1: ข้อความอิสระ -> รายการเสนอให้ผู้ใช้ยืนยัน (ยังไม่ใช่ผลตรวจ)"""
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1000:
        raise ValueError("text ต้องยาว 1-1000 ตัวอักษร")
    try:
        return llm.parse_text(text.strip(), HERBS)
    except llm.LLMUnavailable as e:
        raise ServiceUnavailable(str(e)) from e
    except (ValueError, KeyError, TypeError) as e:  # LLM ตอบรูปแบบไม่ถูก = ขอให้ผู้ใช้กรอกเอง ไม่ใช่ความผิดของผู้ใช้
        raise ServiceUnavailable("AI แปลงข้อความไม่สำเร็จ กรุณากรอกเอง") from e


def explain(payload) -> dict:
    """LLM จุดที่ 2: คำนวณผลตรวจใหม่ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อผลจากไคลเอนต์) แล้วเรียบเรียง; ไม่ผ่านตัวตรวจ = template"""
    inp = validate(payload)
    result = check(inp, HERBS, DRUGS, CONFIG, TAGS)
    return {"explanation": llm.explain(inp, result, HERBS, DRUGS)}
