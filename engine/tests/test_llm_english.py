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


# ---------- แชต: LLM เรียบเรียงเป็นอังกฤษ ----------
import rag  # noqa: E402
from translate import en  # noqa: E402

BYID = {c["item_id"]: c for c in service.RAG["chunks"]}


def chat(reply, q="ginger contraindications", use_llm=True):
    return rag.answer(q, None, [], [], service.RAG, service.CONFIG, use_llm=use_llm, lang="en",
                      complete=lambda s, u, max_tokens=800: json.dumps(reply) if isinstance(reply, dict) else reply)


def faithful_chat():
    base = chat({}, use_llm=False)
    ids = [c["item_id"] for c in base["cites"]]
    return {"answer_en": " ".join(en(BYID[i]["text_th"]) for i in ids)[:450], "cites": ids}, ids


def test_chat_english_llm_passes_when_faithful_and_keeps_thai_extract():
    reply, ids = faithful_chat()
    a = chat(reply)
    assert a["source"] == "llm" and a["text_en"] == reply["answer_en"]
    assert a["text_th"] == rag._extractive([BYID[i] for i in ids])  # ภาษาไทยยังเป็นข้อความสกัดตายตัวจากฐานข้อมูล
    assert {c["item_id"] for c in a["cites"]} == set(ids)


@pytest.mark.parametrize("answer", [
    "Ginger is safe for everyone",                       # สื่อว่าปลอดภัย
    "Ginger and turmeric are both fine",                 # ชื่อ/เนื้อหานอกข้อมูล
    "Ginger is recommended for children",                # กลับความหมาย
    "Take 500 mg of ginger daily",                       # ตัวเลข/ขนาดยาที่แต่ง
])
def test_chat_english_llm_unfaithful_falls_back_to_database_text(answer):
    reply, ids = faithful_chat()
    a = chat({**reply, "answer_en": answer})
    assert a["source"] == "database" and a["rejected_reason"]
    assert a["text_en"].startswith("From this database:")  # ข้อความอังกฤษตายตัว ไม่ใช่ไทย


def test_chat_english_llm_must_cite_every_item():
    reply, ids = faithful_chat()
    a = chat({**reply, "cites": []})
    assert a["source"] == "database" and "cites" in (a["rejected_reason"] or "")


def test_chat_thai_mode_still_uses_thai_llm_path():
    called = []
    rag.answer("ขิงห้ามใช้กับใคร", None, [], [], service.RAG, service.CONFIG, use_llm=True, lang="th",
               complete=lambda s, u, max_tokens=800: called.append(s) or "{}")
    assert called and called[0] == llm.ASK_SYSTEM


# ---------- แชต: ค้นเว็บภาษาอังกฤษ ----------
SRC = [{"title": "Example", "url": "https://example.org/a"}]


def web(text, sources=SRC, q="how much ginger per day", intent="dose", lang="en"):
    calls = []

    def search(question, system=None):
        calls.append(system)
        return {"text": text, "sources": sources}
    r = llm.web_answer(q, service.CONFIG, intent, search=search, lang=lang)
    return r, calls


def test_web_english_answer_has_english_prefix_and_disclaimer_and_uses_english_prompt():
    r, calls = web("Turmeric may interact with blood thinners. Ask your doctor before combining them.")
    assert r["source"] == "web" and calls == [llm.SEARCH_SYSTEM_EN]
    assert r["text_en"].startswith(en(service.CONFIG["chat_web_messages_th"]["value"]["dose_prefix"]))
    assert r["text_en"].endswith(en(service.CONFIG["chat_web_messages_th"]["value"]["disclaimer"]))
    assert "EN" in r["text_th"] and r["web_sources"] == SRC


@pytest.mark.parametrize("text", ["It is perfectly safe for everyone.", "There is no risk at all.", "This herb cures diabetes.", "Don't worry, it is harmless."])
def test_web_english_overclaims_are_rejected(text):
    r, _ = web(text)
    assert r["rejected_reason"] == "overclaim" and "source" not in r


def test_web_english_negated_safety_is_allowed():
    assert web("It is not safe to use during pregnancy.")[0]["source"] == "web"


def test_web_english_needs_sources_and_english_text():
    r, _ = web("Some english text here.", sources=[])
    assert r["rejected_reason"] == "no_sources" and r["note_en"]
    r, _ = web("ข้อความภาษาไทยล้วน ไม่มีอังกฤษเลย")
    assert r["rejected_reason"] == "no_sources"


def test_web_personal_details_are_not_sent_and_note_is_bilingual():
    r, calls = web("x", q="my email is a.b@example.com what dose")
    assert r["rejected_reason"] == "personal" and r["note_th"] and r["note_en"] and calls == []


def test_web_thai_mode_unchanged():
    r, calls = web("ข้อมูลทั่วไปเกี่ยวกับขมิ้น ปรึกษาแพทย์ก่อนใช้", lang="th")
    assert r["source"] == "web" and calls == [None] and "text_en" not in r
