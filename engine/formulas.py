"""แปลงข้อมูลตำรับ (data/formula_guidelines.json) เป็นรูปแบบเดียวกับแถวสมุนไพร เพื่อให้ R1 เดิมใน check.py ตัดสิน

ฟังก์ชันล้วน ไม่มีกฎใหม่ ไม่เรียก LLM: ข้อห้ามของตำรับยาบำรุงโลหิตเป็นของ "ตำรับ" เท่านั้น
ผู้ใช้ต้องเลือกตำรับเองในรายการ (ระบบไม่อนุมานว่าสมุนไพรเดี่ยวคือตำรับ และไม่นำข้อห้ามไปใช้กับสมุนไพรเดี่ยว)
"""

_ITEM_KEYS = ("condition", "level", "text", "evidence_quote", "source_page", "pdf_page", "verified")


def _item(src: dict) -> dict:
    out = {k: src[k] for k in _ITEM_KEYS}
    out["evidence_tier"] = src["evidence_tier"]
    return out


def formula_entries(doc: dict) -> list[dict]:
    """คืนรายการที่ check()/summary/rag ใช้แทนแถวสมุนไพรได้ (มี kind='formula' ไว้แยกชนิด)"""
    entries = []
    for f in doc["formulas"]:
        entries.append({
            "id": f["id"],
            "name_th": f["name_th"],
            "kind": "formula",
            "parts": [],
            "scope_note_th": f.get("scope_note_th"),
            "source_label_th": f["source_label_th"],
            "source_doc_th": f["source_doc_th"],
            "contraindications": [_item(i) for i in f["contraindications"]],
            "age_limits": [],
            "drug_cautions": [],
            "condition_cautions": [_item(i) for i in f["condition_cautions"]],
            "duration_limits": [],
            "mechanism_tags": [],
            "notes": [],
            "verified": f["verified"],
        })
    return entries
