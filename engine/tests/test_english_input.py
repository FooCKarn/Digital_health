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
