"""ตำรับยาบำรุงโลหิตในระบบตรวจ: ข้อห้ามของตำรับผ่าน R1 เดิม (ไม่มีกฎใหม่) ทุกกฎมีเคสที่ควรเตือนและไม่ควรเตือน (CLAUDE.md ข้อ 8)"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

import service  # noqa: E402
from formulas import formula_entries  # noqa: E402

FID = "blood_tonic_women"


def run(profile=None, herbs=None, drugs=None):
    return service.run({"herbs": herbs if herbs is not None else [{"id": FID}], "drugs": drugs or [], "profile": {"conditions": [], **(profile or {})}})


def flags(r, **kw):
    return [f for f in r["result"]["flags"] if all(f.get(k) == v for k, v in kw.items())]


def test_entries_are_herb_shaped_and_marked_formula():
    e = formula_entries(json.loads((ROOT / "data/formula_guidelines.json").read_text(encoding="utf-8")))
    assert len(e) == 1 and e[0]["id"] == FID and e[0]["kind"] == "formula"
    for k in ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits"):
        assert isinstance(e[0][k], list)
    assert {c["condition"] for c in e[0]["contraindications"]} == {"pregnancy", "fever", "allergy_to_ingredient"}


def test_every_formula_condition_code_has_a_ui_label():
    labels = service.CONDS
    codes = {i["condition"] for f in service.FORMULAS for k in ("contraindications", "condition_cautions") for i in f[k]}
    assert codes - set(labels) <= {"pregnancy", "breastfeeding"}


def test_pregnant_with_formula_flags_avoid_with_formula_source_not_ttm_book():
    f = flags(run({"pregnant": True}), rule_id="R1", herb_id=FID, condition="pregnancy")
    assert len(f) == 1
    f = f[0]
    assert f["severity"] == "avoid" and f["evidence_tier"] == "A" and f["verified"] is False
    assert (f["source_page"], f["pdf_page"]) == (4, 5)
    assert f["message_th"].startswith("ตำรับยาบำรุงโลหิต:")
    assert "ยาบำรุงโลหิต" in f["source_doc_th"] and "TTM first" not in f["source_doc_th"]
    assert 0 < len(f["evidence_quote"]) <= 250


def test_not_pregnant_with_formula_gives_no_pregnancy_flag_and_nothing_to_check():
    r = run({"pregnant": False, "age": 30})
    assert flags(r, herb_id=FID, condition="pregnancy") == []
    assert "pregnancy" not in r["result"]["coverage"]["not_checked"]


def test_pregnancy_unspecified_is_reported_as_not_checked_not_assumed_no():
    r = run({"age": 30})
    assert flags(r, condition="pregnancy") == []
    assert "pregnancy" in r["result"]["coverage"]["not_checked"]


def test_fever_flags_only_when_user_selects_it():
    assert [f["severity"] for f in flags(run({"pregnant": False, "conditions": ["fever"]}), herb_id=FID, condition="fever")] == ["avoid"]
    assert flags(run({"pregnant": False}), condition="fever") == []


def test_ingredient_allergy_avoid_and_pollen_allergy_caution():
    r = run({"pregnant": False, "conditions": ["allergy_to_ingredient", "pollen_allergy"]})
    assert [f["severity"] for f in flags(r, condition="allergy_to_ingredient")] == ["avoid"]
    assert [f["severity"] for f in flags(r, condition="pollen_allergy")] == ["caution"]
    assert flags(run({"pregnant": False}), condition="pollen_allergy") == []


def test_formula_rules_never_apply_to_single_herbs():
    # ขิง/กระชาย/ไพล เป็นรสร้อนในเอกสารตำรับ แต่ข้อห้ามเป็นของตำรับ จึงต้องไม่มีคำเตือนข้อห้ามของตำรับกับสมุนไพรเดี่ยว
    for hid in ("khing", "krachai", "phlai"):
        r = run({"pregnant": True, "conditions": ["fever", "allergy_to_ingredient", "pollen_allergy"]}, herbs=[{"id": hid}])
        assert flags(r, rule_id="R1", condition="fever") == [] and flags(r, condition="pollen_allergy") == []
        assert all("แนวทางการตั้งตำรับ" not in f["message_th"] for f in r["result"]["flags"])


def test_herb_flags_keep_original_source_label_and_coverage_excludes_formulas():
    r = run({"pregnant": True}, herbs=[{"id": "khing"}, {"id": FID}])
    herb_flag = next(f for f in r["result"]["flags"] if f["herb_id"] == "khing")
    assert herb_flag["message_th"].startswith("ขิง:") and "source_doc_th" not in herb_flag  # ผลของสมุนไพรเดิมไม่เปลี่ยนรูป
    assert r["result"]["coverage"]["herbs_in_db"] == 21  # ตำรับไม่นับเป็นสมุนไพรในขอบเขต


def test_summary_names_the_formula_and_run_is_deterministic():
    a, b = run({"pregnant": True}), run({"pregnant": True})
    assert a == b
    assert a["summary"]["herbs"][0]["name_th"] == "ตำรับยาบำรุงโลหิต"


def test_meta_lists_formulas_separately_from_herbs():
    m = service.meta()
    assert [f["id"] for f in m["formulas"]] == [FID] and m["formulas"][0]["note_th"]
    assert FID not in {h["id"] for h in m["herbs"]} and m["coverage"]["herbs_in_db"] == 21


def test_chat_answers_from_formula_flag_with_formula_citation_and_never_says_safe():
    a = service.ask({"question": "ตั้งครรภ์อยู่ ใช้ตำรับนี้ได้ไหม", "herbs": [{"id": FID}], "drugs": [], "profile": {"pregnant": True, "conditions": []}})["answer"]
    assert "ปลอดภัย" not in a["text_th"] and a["text_th"]
    cites = [c for c in a.get("cites", []) if c.get("herb_id") == FID]
    assert cites and all(c.get("source_doc_th") and "TTM first" not in c["source_doc_th"] for c in cites)
