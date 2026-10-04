"""ทดสอบจุดใช้ LLM ด้วย complete() จำลอง (ไม่เรียกเครือข่าย ไม่ใช้ API key)"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
from check import check  # noqa: E402
from llm import LLMUnavailable, explain, parse_text  # noqa: E402

L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG, TAGS = L("data/herbs.json"), L("data/drug_class_map.json"), L("data/config.json"), L("data/mechanism_tags.json")["tags"]

INP = {"herbs": [{"id": "khing"}, {"id": "garlic"}], "drugs": ["warfarin"], "profile": {"age": 60}}
RESULT = check(INP, HERBS, DRUGS, CONFIG, TAGS)


def fake(obj):
    return lambda system, user: obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)


def items_from(result, mutate=lambda t: t):
    return {"summary_th": f"พบธงเตือน {len(result['flags'])} รายการ",
            "items": [{"flag_id": f["flag_id"], "text_th": mutate(f["message_th"])} for f in result["flags"]]}


# --- parse ---
TEXT = "ฉันกินขิงมา 3 วัน แล้วก็ยา warfarin กับยาลับ"


def test_parse_keeps_known_herbs_drops_unknown_and_invented_drugs():
    out = parse_text(TEXT, HERBS, fake({"herbs": [{"id": "khing", "days_in_use": 3}, {"id": "ginseng"}],
                                        "drugs": ["warfarin", "ยาที่ไม่ได้พิมพ์"], "unmatched": ["ยาลับ"]}))
    assert out["herbs"] == [{"id": "khing", "days_in_use": 3}]
    assert out["drugs"] == ["warfarin"] and set(out["unmatched"]) == {"ยาลับ", "ginseng"}


def test_parse_rejects_bad_days_and_non_json():
    out = parse_text(TEXT, HERBS, fake({"herbs": [{"id": "khing", "days_in_use": 9999}], "drugs": []}))
    assert out["herbs"] == [{"id": "khing"}]
    with pytest.raises(ValueError):
        parse_text(TEXT, HERBS, fake("ขอโทษ ตอบไม่ได้"))


# --- explain: ผ่าน ---
def test_explain_accepts_faithful_text_and_always_has_disclaimer():
    out = explain(INP, RESULT, HERBS, DRUGS, fake(items_from(RESULT)))
    assert out["source"] == "llm" and out["disclaimer_th"] == CONFIG["disclaimer_th"]
    assert [i["flag_id"] for i in out["items"]] == [f["flag_id"] for f in RESULT["flags"]]


def test_explain_accepts_alias_of_same_drug():
    mutate = lambda t: t + " (วาร์ฟาริน)"  # noqa: E731  ชื่อพ้องของ warfarin ที่ผู้ใช้กรอก
    assert explain(INP, RESULT, HERBS, DRUGS, fake(items_from(RESULT, mutate)))["source"] == "llm"


# --- explain: ไม่ผ่าน -> template ---
@pytest.mark.parametrize("name,mutate,reason", [
    ("invented number", lambda t: t + " ควรหยุดก่อนผ่าตัด 14 วัน", "ตัวเลข"),
    ("herb not in result", lambda t: t + " และมะขามก็ควรระวัง", "สมุนไพร"),
    ("drug not in result", lambda t: t + " รวมถึงไอบูโพรเฟน", "ยา"),
    ("says safe", lambda t: t + " แต่โดยรวมปลอดภัย", "ปลอดภัย"),
])
def test_explain_falls_back_to_template_on_violations(name, mutate, reason):
    out = explain(INP, RESULT, HERBS, DRUGS, fake(items_from(RESULT, mutate)))
    assert out["source"] == "template" and reason in out["rejected_reason"]
    assert [i["text_th"] for i in out["items"]] == [f["message_th"] for f in RESULT["flags"]]  # ใช้ข้อความจากธงตรง ๆ


def test_explain_detects_flipped_meaning():
    out = explain(INP, RESULT, HERBS, DRUGS, fake(items_from(RESULT, lambda t: "สามารถรับประทานได้ตามปกติ")))
    assert out["source"] == "template" and "กลับ" in out["rejected_reason"]


def test_explain_missing_flag_id_or_bad_schema_falls_back():
    bad = items_from(RESULT); bad["items"].pop()
    assert explain(INP, RESULT, HERBS, DRUGS, fake(bad))["source"] == "template"
    assert explain(INP, RESULT, HERBS, DRUGS, fake({"nope": 1}))["source"] == "template"
    assert explain(INP, RESULT, HERBS, DRUGS, fake("ไม่ใช่ JSON"))["source"] == "template"


def test_explain_llm_unavailable_falls_back_not_error():
    def down(system, user):
        raise LLMUnavailable("no key")
    assert explain(INP, RESULT, HERBS, DRUGS, down)["source"] == "template"


# --- ผู้ให้บริการ Gemini (ไม่เรียกเครือข่ายจริง) ---
class _Resp:
    def __init__(self, obj): self.data = json.dumps(obj).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self, *a): return self.data


def test_gemini_request_shape_and_thought_filtering(monkeypatch):
    import llm
    seen = {}

    def fake_urlopen(req, timeout=0):
        seen.update(url=req.full_url, headers={k.lower(): v for k, v in req.header_items()}, body=json.loads(req.data))
        return _Resp({"candidates": [{"content": {"parts": [{"text": "คิดอยู่", "thought": True}, {"text": '{"ok": 1}'}]}}]})
    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-key-123")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    assert llm.gemini_complete("SYS", "USER") == '{"ok": 1}'
    assert seen["url"].endswith("models/gemma-4-31b-it:generateContent") and "secret-key-123" not in seen["url"]  # key ไม่อยู่ใน URL
    assert seen["headers"]["x-goog-api-key"] == "secret-key-123"
    text = seen["body"]["contents"][0]["parts"][0]["text"]
    assert "SYS" in text and "USER" in text and "system_instruction" not in seen["body"]  # รวม system ไว้ในข้อความผู้ใช้


def test_gemini_failure_never_leaks_key(monkeypatch):
    import llm

    def boom(req, timeout=0):
        raise RuntimeError("401 for https://x/?key=secret-key-123")
    monkeypatch.setattr(llm.urllib.request, "urlopen", boom)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-key-123")
    with pytest.raises(LLMUnavailable) as e:
        llm.gemini_complete("s", "u")
    assert "secret-key-123" not in str(e.value)


def test_timeout_reports_slow_model_and_respects_env(monkeypatch):
    import llm
    seen = {}

    def slow(req, timeout=0):
        seen["timeout"] = timeout
        raise TimeoutError("read timed out")
    monkeypatch.setattr(llm.urllib.request, "urlopen", slow)
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("LLM_TIMEOUT_SEC", "50")
    with pytest.raises(LLMUnavailable) as e:
        llm.gemini_complete("s", "u")
    assert "ตอบช้า" in str(e.value) and "50" in str(e.value) and seen["timeout"] == 50
    monkeypatch.setenv("LLM_TIMEOUT_SEC", "9999")
    assert llm._timeout() == 55.0  # ไม่เกินเพดาน


def test_malformed_gemini_reply_is_unavailable_not_crash(monkeypatch):
    import llm
    monkeypatch.setattr(llm.urllib.request, "urlopen", lambda req, timeout=0: _Resp({"promptFeedback": {"blockReason": "SAFETY"}}))
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    with pytest.raises(LLMUnavailable):
        llm.gemini_complete("s", "u")


def test_default_provider_selection(monkeypatch):
    import llm
    calls = []
    monkeypatch.setattr(llm, "gemini_complete", lambda s, u, m=800: calls.append("gemini") or "{}")
    monkeypatch.setattr(llm, "anthropic_complete", lambda s, u, m=800: calls.append("anthropic") or "{}")
    for k in ("LLM_PROVIDER", "GEMINI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    llm.default_complete("s", "u")                      # ไม่ตั้งอะไร -> anthropic
    monkeypatch.setenv("GEMINI_API_KEY", "k"); llm.default_complete("s", "u")   # มี key gemini -> gemini
    monkeypatch.setenv("LLM_PROVIDER", "anthropic"); llm.default_complete("s", "u")  # ระบุชัด -> ตามที่ระบุ
    assert calls == ["anthropic", "gemini", "anthropic"]


def test_explain_no_flags_never_calls_llm_and_never_says_safe():
    inp = {"herbs": [{"id": "krachai"}], "drugs": [], "profile": {"age": 30}}
    res = check(inp, HERBS, DRUGS, CONFIG, TAGS)
    def must_not_call(system, user):
        raise AssertionError("ไม่ควรเรียก LLM เมื่อไม่มีธง")
    out = explain(inp, res, HERBS, DRUGS, must_not_call)
    assert out["source"] == "template" and out["summary_th"] == "ไม่พบธงเตือนในฐานข้อมูลนี้" and "ปลอดภัย" not in out["summary_th"]
