"""จุด LLM ใหม่ (สรุปประจำวัน + คำสั่งบันทึกการใช้): จำลอง complete() ไม่เรียกเครือข่าย
ทุกจุดต้องมีทั้งเคสที่ผ่านและเคสที่ถูกตัวตรวจปัดทิ้ง (กฎข้อ 8 ของโปรเจกต์ ใช้กับตัวตรวจของฟีเจอร์ใหม่ด้วย)"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import service  # noqa: E402
from llm import LLMUnavailable, brief, brief_template, parse_intent  # noqa: E402

L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = L("data/herbs.json"), L("data/drug_class_map.json"), L("data/config.json")

FACTS = {"item_count": 3, "taken_count": 1, "untaken": ["ขิง", "warfarin"], "warnings": {"total": 2, "avoid": 1}, "no_entry_today": True}
fake = lambda obj: (lambda system, user: obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False))  # noqa: E731


def test_brief_template_has_only_given_facts_and_no_safe_claim():
    t = brief_template(FACTS)
    assert "1 จาก 3" in t and "ขิง" in t and "พบคำเตือน 2 รายการ (ควรหลีกเลี่ยง 1)" in t and "ปลอดภัย" not in t
    none = brief_template({**FACTS, "warnings": {"total": 0, "avoid": 0}})
    assert "ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม" in none and "ปลอดภัย" not in none


def test_brief_llm_valid_summary_is_used():
    ok = {"summary_th": "วันนี้กดว่าใช้แล้ว 1 จาก 3 รายการ ยังเหลือขิงกับ warfarin และพบคำเตือน 2 รายการ ลองดูรายละเอียดในหน้าผลตรวจ"}
    out = brief(FACTS, HERBS, DRUGS, CONFIG, fake(ok))
    assert out["source"] == "llm" and out["summary_th"] == ok["summary_th"]


@pytest.mark.parametrize("summary,reason", [
    ("วันนี้ใช้แล้ว 9 จาก 3 รายการ", "ตัวเลข"),                      # ตัวเลขนอกข้อเท็จจริง
    ("วันนี้ใช้ขิงกับกระเทียมแล้ว", "ชื่อสมุนไพร"),                  # ชื่อสมุนไพรที่ไม่ได้อยู่ในรายการของผู้ใช้
    ("ใช้แล้ว 1 จาก 3 รายการ ทั้งหมดปลอดภัย", "คำต้องห้าม"),         # คำต้องห้าม
    ("ใช้แล้ว 1 จาก 3 รายการ ดู https://example.com", "URL"),
    ("ใช้แล้ว 1 จาก 3 รายการ ลอง aspirin ร่วมด้วย", "อังกฤษ"),
])
def test_brief_llm_rejected_falls_back_to_template(summary, reason):
    out = brief(FACTS, HERBS, DRUGS, CONFIG, fake({"summary_th": summary}))
    assert out["source"] == "template" and reason in out["rejected_reason"] and out["summary_th"] == brief_template(FACTS)


def test_brief_rejects_warning_talk_when_there_are_none_and_llm_failure_uses_template():
    f = {**FACTS, "warnings": {"total": 0, "avoid": 0}}
    out = brief(f, HERBS, DRUGS, CONFIG, fake({"summary_th": "วันนี้พบคำเตือนหลายรายการ"}))
    assert out["source"] == "template" and "คำเตือนทั้งที่" in out["rejected_reason"]

    def boom(system, user):
        raise LLMUnavailable("down")
    assert brief(FACTS, HERBS, DRUGS, CONFIG, boom)["source"] == "template"
    assert brief({**FACTS, "item_count": 0, "taken_count": 0, "untaken": [], "warnings": None}, HERBS, DRUGS, CONFIG, boom)["source"] == "template"


ITEMS = [{"id": "i1", "label": "ขิง"}, {"id": "i2", "label": "warfarin"}]


def test_intent_taken_returns_only_known_items_named_in_text():
    out = parse_intent("กินขิงแล้ววันนี้", ITEMS, fake({"action": "taken", "item_ids": ["i1", "i2", "zzz"]}))
    assert out == {"action": "taken", "item_ids": ["i1"]}  # i2 ไม่ได้อยู่ในข้อความ, zzz ไม่ใช่รายการของผู้ใช้


def test_intent_not_taken_and_none_cases():
    assert parse_intent("วันนี้ข้าม warfarin", ITEMS, fake({"action": "not_taken", "item_ids": ["i2"]})) == {"action": "not_taken", "item_ids": ["i2"]}
    assert parse_intent("ขิงดีไหม", ITEMS, fake({"action": "none", "item_ids": []})) == {"action": "none", "item_ids": []}
    assert parse_intent("กินกระเทียมแล้ว", ITEMS, fake({"action": "taken", "item_ids": ["i1"]})) == {"action": "none", "item_ids": []}
    assert parse_intent("กินขิงแล้ว", ITEMS, fake({"action": "delete_all", "item_ids": ["i1"]})) == {"action": "none", "item_ids": []}


def test_service_validates_payloads():
    ok = service.brief({"item_count": 2, "taken_count": 1, "untaken": ["ขิง"], "warnings": None, "no_entry_today": False})
    assert ok["brief"]["source"] in ("llm", "template")
    for bad in [{"item_count": 1, "taken_count": 2}, {"item_count": 1, "taken_count": 0, "extra": 1}, {"item_count": 1, "taken_count": 0, "untaken": ["<b>"]},
                {"item_count": 1, "taken_count": 0, "warnings": {"total": 1}}]:
        with pytest.raises(ValueError):
            service.brief(bad)
    for bad in [{"text": "", "items": ITEMS}, {"text": "x", "items": []}, {"text": "x", "items": [{"id": "a"}]}, {"text": "x" * 201, "items": ITEMS}]:
        with pytest.raises(ValueError):
            service.intent(bad)
