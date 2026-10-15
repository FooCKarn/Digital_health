"""โหมด EN: ผู้ใช้พิมพ์อังกฤษ ตัวจำแนกคำถามและกฎคำสั่งต้องเข้าใจ (โดยเฉพาะฉุกเฉิน) และไม่แก้ข้อมูลจากประโยคคำถาม"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import llm  # noqa: E402
import rag  # noqa: E402

CONFIG = json.loads((ROOT / "data" / "config.json").read_text(encoding="utf-8"))
ITEMS = [{"id": "a", "label": "ginger"}, {"id": "b", "label": "warfarin"}]


@pytest.mark.parametrize("q,intent", [
    ("chest pain and can't breathe", "emergency"), ("I can\u2019t breathe", "emergency"), ("my face is swollen", "emergency"),
    ("He is vomiting blood", "emergency"), ("took an overdose", "emergency"),
    ("How many pills a day?", "dose"), ("What dose should I take", "dose"),
    ("Can you diagnose me", "diagnosis"), ("What's wrong with me", "diagnosis"),
    ("Is ginger safe", "safety_yesno"), ("Can I take ginger with warfarin", "safety_yesno"),
    ("What should I ask a pharmacist", "pharmacist_q"),
    ("Why is there a warning", "explain_flags"), ("Explain the result", "explain_flags"),
])
def test_english_questions_are_classified(q, intent):
    assert rag.classify(q, CONFIG) == intent


def test_emergency_wins_over_everything_in_english():
    assert rag.classify("is it safe? I have chest pain, what dose should I take", CONFIG) == "emergency"


@pytest.mark.parametrize("q,tool,ids", [
    ("Summarize today", "show_brief", []), ("Check my items", "show_check", []),
    ("I took everything", "mark_taken", ["a", "b"]), ("I took ginger", "mark_taken", ["a"]),
    ("I didn't take warfarin", "mark_not_taken", ["b"]), ("I skipped ginger today", "mark_not_taken", ["a"]),
])
def test_english_commands_route_without_llm(q, tool, ids):
    r = llm.route_rules(q, ITEMS)
    assert r and r["tool"] == tool and r["item_ids"] == ids


@pytest.mark.parametrize("q", ["Is ginger used for nausea?", "Can I take ginger with warfarin?", "Did I take ginger?", "I took", "What are all the warnings", "Add ginger"])
def test_questions_and_unclear_text_never_change_data(q):
    assert llm.route_rules(q, ITEMS) is None


def test_thai_commands_unchanged():
    assert llm.route_rules("สรุปวันนี้", ITEMS)["tool"] == "show_brief"
    assert llm.route_rules("กินครบแล้ว", ITEMS)["tool"] == "mark_taken"


# ---------- ค้นด้วยชื่อสมุนไพรอังกฤษ ----------
import service  # noqa: E402

PL = {"herbs": [{"id": "khing", "days_in_use": 3}], "drugs": ["warfarin"], "profile": {"conditions": [], "age": 40}}


def ask_en(q):
    return service.ask({**PL, "question": q, "context_herbs": []})["answer"]


@pytest.mark.parametrize("q,herb", [
    ("ginger contraindications", "khing"), ("Is ginger okay for children", "khing"), ("ginger and blood thinners", "khing"),
    ("garlic and warfarin interaction", "garlic"), ("andrographis in pregnancy", "fa_thalai_jone"),
    ("tamarind and ibuprofen", "makham"), ("bitter melon and diabetes medicine", "mara_khi_nok"),
])
def test_english_herb_names_find_the_right_entries(q, herb):
    a = ask_en(q)
    assert a["source"] == "database" and herb in {c["herb_id"] for c in a["cites"]}
    assert a.get("text_en"), "ต้องมีข้อความอังกฤษครบ (ไม่ใช่ไทยครึ่งเดียว)"


def test_no_data_topic_is_still_refused_not_invented():
    a = ask_en("ginger side effects")  # ขิงไม่มีหัวข้อผลข้างเคียงในฐานข้อมูล = ต้องบอกว่าไม่มีข้อมูล
    assert a["source"] == "refusal" and not a["cites"] and a.get("text_en")


@pytest.mark.parametrize("q", ["what's the weather", "explain the weather today", "tell me about plai"])
def test_out_of_scope_english_is_refused(q):
    assert ask_en(q)["source"] == "refusal"


def test_short_english_herb_name_needs_whole_word():
    idx = rag.build_index(*[json.loads((ROOT / "data" / f).read_text(encoding="utf-8")) for f in ("herbs.json", "drug_class_map.json")],
                          json.loads((ROOT / "data" / "conditions.json").read_text(encoding="utf-8"))["conditions"],
                          CONFIG["rag_synonyms"]["value"], CONFIG["rag_kind_keywords"]["value"])
    assert rag.en_to_th("please explain this", idx) == "please explain this"  # 'plai' ใน 'explain' ต้องไม่ถูกแทน
    assert "ไพล" in rag.en_to_th("is plai ok", idx)
