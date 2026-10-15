"""LLM โหมด EN (explain/brief): ผ่านเฉพาะข้อความที่ไม่แต่งข้อเท็จจริง ไม่สื่อว่าปลอดภัย ไม่ทำคำเตือนหาย; ไม่ผ่าน = template อังกฤษ"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import llm  # noqa: E402
import service  # noqa: E402

PL = {"herbs": [{"id": "khing", "days_in_use": 3}, {"id": "garlic", "days_in_use": 3}], "drugs": ["warfarin"], "profile": {"conditions": [], "age": 60}}
INP = service.validate(PL)
RESULT = service.check(INP, service.ALL, service.DRUGS, service.CONFIG, service.TAGS)
FLAGS = RESULT["flags"]


def run(reply, lang="en"):
    return llm.explain(INP, RESULT, service.ALL, service.DRUGS, service.CONFIG, complete=lambda s, u, max_tokens=800: json.dumps(reply) if isinstance(reply, dict) else reply, lang=lang)


def good(**over):
    d = {"summary_en": f"{len(FLAGS)} warnings found in this database",
         "items": [{"flag_id": f["flag_id"], "text_en": f["message_en"]} for f in FLAGS]}
    d.update(over)
    return d


def test_faithful_english_passes_and_keeps_thai_fields():
    e = run(good())
    assert e["source"] == "llm" and e["rejected_reason"] is None
    assert e["summary_en"].startswith(str(len(FLAGS)))
    assert [i["text_th"] for i in e["items"]] == [f["message_th"] for f in FLAGS]  # ภาษาไทยยังเป็นข้อความตายตัวจากฐานข้อมูล
    assert all(i["text_en"] for i in e["items"]) and e["disclaimer_en"]


@pytest.mark.parametrize("summary", [
    "It is safe to use ginger with these medicines",            # สื่อว่าปลอดภัย
    "Ginger is harmless",                                        # คำต้องห้าม
    "Ginger and turmeric were checked",                          # ชื่อสมุนไพรที่ไม่มีในข้อมูล
    "Ibuprofen may also matter here",                            # ชื่อยาที่ไม่มีในข้อมูล
    "There are 99 warnings found in this database",              # ตัวเลขแต่ง
    "Please see the ขมิ้น note",                                  # อักษรไทยนอกข้อมูล
    "Eating ginger will cure your nausea quickly",               # คำต้องห้าม/เนื้อหาใหม่
])
def test_unfaithful_summary_falls_back_to_template(summary):
    e = run(good(summary_en=summary))
    assert e["source"] == "template" and e["rejected_reason"]
    assert e["summary_en"] == f"{len(FLAGS)} warnings found in this database"


def test_dropping_a_negation_is_rejected():
    inp = service.validate({"herbs": [{"id": "khing", "days_in_use": 3}], "drugs": [], "profile": {"conditions": [], "age": 4}})  # เด็ก 4 ปี: ขิงมีข้อห้าม
    res = service.check(inp, service.ALL, service.DRUGS, service.CONFIG, service.TAGS)
    flags = res["flags"]
    neg = next(i for i, f in enumerate(flags) if llm._EN_NEGATION.search(f["message_en"]))
    items = [{"flag_id": f["flag_id"], "text_en": f["message_en"]} for f in flags]
    reply = {"summary_en": f"{len(flags)} warnings found in this database", "items": items}
    call = lambda r: llm.explain(inp, res, service.ALL, service.DRUGS, service.CONFIG, complete=lambda s, u, max_tokens=800: json.dumps(r), lang="en")  # noqa: E731
    assert call(reply)["source"] == "llm"  # ฉบับซื่อตรงผ่าน
    items[neg] = {"flag_id": flags[neg]["flag_id"], "text_en": "Ginger is recommended for children"}  # กลับความหมาย
    e = call({**reply, "items": items})
    assert e["source"] == "template" and e["rejected_reason"]


def test_missing_flag_id_is_rejected():
    assert run(good(items=good()["items"][:-1]))["source"] == "template"


def test_bad_json_or_schema_falls_back():
    assert run("not json at all")["source"] == "template"
    assert run({"summary_en": 5, "items": []})["source"] == "template"


def test_thai_mode_is_unchanged():
    e = run({"summary_th": "x", "items": []}, lang="th")  # ฉบับไทยยังใช้ตัวตรวจไทยเดิม: schema ไม่ตรง = template
    assert e["source"] == "template"


# ---------- brief ----------
FACTS = {"item_count": 11, "taken_count": 2, "untaken": ["ginger"], "warnings": {"total": 22, "avoid": 5}, "no_entry_today": True}
CFG, HERBS, DRUGS = service.CONFIG, service.ALL, service.DRUGS


def brief(summary, facts=FACTS):
    return llm.brief(facts, HERBS, DRUGS, CFG, complete=lambda s, u, max_tokens=800: json.dumps({"summary_en": summary}), lang="en")


def test_brief_faithful_passes():
    b = brief("You marked 2 of 11 items as used today. There are 22 warnings found, 5 to avoid.")
    assert b["source"] == "llm" and b["summary_en"].startswith("You marked") and b["summary_th"]


@pytest.mark.parametrize("s", [
    "Everything looks safe today",
    "You have taken 3 of 11 items today",                      # ตัวเลขไม่ตรง
    "No warnings found, everything is fine",                   # ปฏิเสธคำเตือนที่มีอยู่จริง + คำต้องห้าม
    "You marked 2 of 11 items. Take turmeric tomorrow",        # คำแนะนำ/ชื่อใหม่
])
def test_brief_unfaithful_falls_back(s):
    b = brief(s)
    assert b["source"] == "template" and b["rejected_reason"] and b["summary_en"]


def test_brief_cannot_invent_warnings_when_facts_have_none():
    f = {**FACTS, "warnings": {"total": 0, "avoid": 0}}
    assert brief("There are 3 warnings found", f)["source"] == "template"
    assert brief("No warnings found in this database so far", f)["source"] == "llm"


def test_english_forbidden_list_is_team_labelled():
    cfg = service.CONFIG["llm_forbidden_phrases_en"]
    assert "ทีมตั้งเอง" in cfg["note"] and "safe" in cfg["value"]
