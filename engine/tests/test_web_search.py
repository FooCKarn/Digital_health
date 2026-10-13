"""ค้นข้อมูลภายนอก (2026-10-13) + กฎตายตัวเลือกเครื่องมือของผู้ช่วย: จำลองตัวค้น ไม่เรียกเครือข่าย
ทุกจุดมีทั้งเคสที่ผ่านและเคสที่ถูกตัวตรวจปัดทิ้ง"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import llm  # noqa: E402
import service  # noqa: E402
from llm import route_rules, web_answer  # noqa: E402

CONFIG = json.loads((ROOT / "data/config.json").read_text(encoding="utf-8"))
SRC = [{"uri": "https://example.org/a", "title": "ตัวอย่าง A"}, {"uri": "http://insecure.example/x", "title": "x"}, {"uri": "https://example.org/a", "title": "ซ้ำ"}]
search = lambda text, sources=SRC: (lambda q: {"text": text, "sources": sources})  # noqa: E731


def test_web_answer_ok_has_sources_https_only_and_disclaimer():
    out = web_answer("ฟ้าทะลายโจรใช้ทำอะไร", CONFIG, search=search("**ฟ้าทะลายโจร** ใช้บรรเทาอาการเจ็บคอ ดู [แหล่ง](https://x.com) https://y.com"))
    assert out["source"] == "web" and out["web_sources"] == [{"title": "ตัวอย่าง A", "url": "https://example.org/a"}]
    assert "ทีมยังไม่ได้ตรวจ" in out["text_th"] and "http" not in out["text_th"] and "*" not in out["text_th"]


def test_web_answer_dose_and_diagnosis_get_a_framing_prefix():
    for intent, word in (("dose", "ไม่กำหนดขนาด"), ("diagnosis", "ไม่ใช่การวินิจฉัย")):
        assert word in web_answer("q", CONFIG, intent, search=search("ข้อมูลทั่วไป"))["text_th"].split("\n")[0]


@pytest.mark.parametrize("text,sources,reason", [
    ("ใช้ได้ ปลอดภัยแน่นอน", SRC, "overclaim"),
    ("ไม่ต้องกังวลเลย", SRC, "overclaim"),
    ("ข้อมูลทั่วไป", [], "no_sources"),                      # ไม่มีแหล่งอ้างอิง = ไม่แสดง
    ("english only answer", SRC, "no_sources"),               # ไม่ใช่ภาษาไทย
])
def test_web_answer_rejects(text, sources, reason):
    assert web_answer("q", CONFIG, search=search(text, sources))["rejected_reason"] == reason


def test_web_answer_allows_negated_safety_words_and_never_searches_personal_data():
    ok = web_answer("q", CONFIG, search=search("ไม่ปลอดภัยสำหรับหญิงตั้งครรภ์"))
    assert ok["source"] == "web"
    called = []
    for q in ("เบอร์ฉัน 081-234-5678 ใช้ขิงได้ไหม", "mail me a@b.co ขิง", "บัตร 1234567890123"):
        out = web_answer(q, CONFIG, search=lambda x: called.append(x))
        assert out["rejected_reason"] == "personal" and "ไม่ส่ง" in out["note_th"]
    assert called == []


def test_web_answer_search_failure_is_not_an_error():
    def boom(q):
        raise llm.LLMUnavailable("down")
    assert web_answer("q", CONFIG, search=boom)["rejected_reason"] == "LLMUnavailable"


def _fake_transport(sent):
    def send(req, budget=None):
        sent.append(json.loads(req.data))
        return {"candidates": [{"content": {"parts": [{"text": "ตอบ"}]}, "groundingMetadata": {"groundingChunks": [{"web": {"uri": "https://e.org", "title": "e"}}, {}]}}]}
    return send


def test_gemini_search_sends_only_the_question_with_google_search_tool(monkeypatch):
    sent = []
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    llm.set_transport(_fake_transport(sent))
    try:
        out = llm.gemini_search("ขิงมีผลอะไร")
    finally:
        llm.set_transport(None)
    assert out == {"text": "ตอบ", "sources": [{"uri": "https://e.org", "title": "e"}]}
    assert sent[0]["tools"] == [{"google_search": {}}] and "ขิงมีผลอะไร" in json.dumps(sent[0], ensure_ascii=False)


def _ask(monkeypatch, q, key="k", **payload):
    monkeypatch.setenv("HERBGUARD_CHAT_LLM", "0")
    monkeypatch.setattr(service.llm, "gemini_search", lambda question: {"text": "ข้อมูลทั่วไป " + question[:0], "sources": SRC[:1]})
    if key:
        monkeypatch.setenv("GEMINI_API_KEY", key)
    else:
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    return service.ask({"question": q, **payload})["answer"]


def test_ask_falls_through_to_web_when_database_has_no_answer(monkeypatch):
    a = _ask(monkeypatch, "วันนี้อากาศเป็นอย่างไร")
    assert a["source"] == "web" and a["web_sources"][0]["url"] == "https://example.org/a"


def test_ask_dose_question_gets_web_info_but_emergency_stays_fixed(monkeypatch):
    assert _ask(monkeypatch, "ขิงกินวันละกี่เม็ด")["source"] == "web"
    assert _ask(monkeypatch, "เจ็บหน้าอกมาก")["source"] == "emergency"


def test_ask_keeps_refusal_without_key_or_when_switched_off(monkeypatch):
    assert _ask(monkeypatch, "วันนี้อากาศเป็นอย่างไร", key=None)["source"] == "refusal"
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("HERBGUARD_WEB_SEARCH", "0")
    assert service.ask({"question": "วันนี้อากาศเป็นอย่างไร"})["answer"]["source"] == "refusal"


def test_ask_database_answers_do_not_go_to_web(monkeypatch):
    called = []
    monkeypatch.setattr(service.llm, "gemini_search", lambda q: called.append(q))
    monkeypatch.setenv("HERBGUARD_CHAT_LLM", "0")
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    assert service.ask({"question": "รางจืดกับยาเบาหวาน"})["answer"]["source"] == "database" and called == []


ITEMS = [{"id": "a", "label": "ขิง"}, {"id": "b", "label": "warfarin"}]


@pytest.mark.parametrize("text,tool,ids", [
    ("สรุปวันนี้", "show_brief", []),
    ("ขอสรุปของวันนี้หน่อย", "show_brief", []),
    ("ตรวจให้หน่อย", "show_check", []),
    ("กินครบแล้ว", "mark_taken", ["a", "b"]),
    ("กินขิงแล้ว", "mark_taken", ["a"]),
    ("วันนี้ไม่ได้กิน warfarin", "mark_not_taken", ["b"]),
    ("ข้ามขิงวันนี้", "mark_not_taken", ["a"]),
])
def test_route_rules_match_clear_commands(text, tool, ids):
    r = route_rules(text, ITEMS)
    assert r and r["tool"] == tool and r["item_ids"] == ids


@pytest.mark.parametrize("text", ["ทำไมถึงขึ้นคำเตือน", "ขิงมีข้อควรระวังอะไร", "กินกระเทียมแล้ว", "ตั้งเตือน 20:00", "ทำไมผลตรวจเป็นแบบนี้"])
def test_route_rules_leave_other_texts_to_llm(text):
    assert route_rules(text, ITEMS) is None


def test_route_llm_single_item_needs_no_name(monkeypatch):
    r = llm.route("กินแล้ว", [ITEMS[0]], lambda s, u: json.dumps({"tool": "mark_taken", "item_ids": ["a"]}))
    assert r["tool"] == "mark_taken" and r["item_ids"] == ["a"]
