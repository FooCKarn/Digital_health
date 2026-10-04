import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
from check import check  # noqa: E402
from summary import pharmacist_summary  # noqa: E402

L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = L("data/herbs.json"), L("data/drug_class_map.json"), L("data/config.json")


def summarize(inp):
    return pharmacist_summary(inp, check(inp, HERBS, DRUGS, CONFIG), HERBS, CONFIG)


def test_summary_with_flags_lists_them_and_marks_draft():
    s = summarize({"herbs": [{"id": "khing", "part": "เหง้า"}], "drugs": ["warfarin"], "profile": {"age": 60}})
    assert s["flags"] and s["pharmacist_review_required"] and s["draft_notice_th"]
    assert s["herbs"][0]["name_th"] == "ขิง" and s["drugs_as_entered"] == ["warfarin"]
    assert s["follow_up_questions_th"] and s["coverage"]["herbs_in_db"] >= 5


def test_summary_without_flags_never_says_safe_outside_disclaimer():
    s = summarize({"herbs": [{"id": "krachai"}], "drugs": [], "profile": {"age": 30}})
    assert s["flags"] == [] and s["draft_notice_th"] is None
    assert "ปลอดภัย" not in s["headline_th"] and "ไม่พบธงเตือนในฐานข้อมูลนี้" in s["headline_th"]
    assert s["disclaimer_th"]
