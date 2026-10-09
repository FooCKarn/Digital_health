"""ตรวจไฟล์ข้อมูลอ้างอิงที่ engine ไม่ใช้ (formula_guidelines.json, herb_priority.json)
กติกา CLAUDE.md: ทุกแถวมีเลขหน้า + verified:false จนกว่าคนตรวจ + วลีหลักฐานสั้น (ข้อ 9) + ไม่มีคำว่า ปลอดภัย (ข้อ 5)
และห้ามให้ engine อ่านไฟล์เหล่านี้ (ข้อห้ามของตำรับไม่ใช่ข้อห้ามของสมุนไพรเดี่ยว)"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
FG = L("data/formula_guidelines.json")
HP = L("data/herb_priority.json")
HERBS = {h["id"]: h["name_th"] for h in L("data/herbs.json")["herbs"]}
MAX_QUOTE = 250


def _rows(f):
    for k in ("essential_groups", "supplementary_groups", "ratio_limits", "contraindications", "condition_cautions", "notes", "worked_examples"):
        for r in f[k]:
            yield k, r
    yield "forms", {**f["forms_ref"], "verified": False, "verified_by": None}


def test_formula_rows_have_page_unverified_and_offset_one():
    off = FG["source"]["page_offset"]
    for f in FG["formulas"]:
        assert f["verified"] is False and f["verified_by"] is None
        for k, r in _rows(f):
            assert isinstance(r["source_page"], int) and r["pdf_page"] - r["source_page"] == off, (k, r.get("id"))
            if k in ("contraindications", "condition_cautions", "notes", "worked_examples"):
                assert r["verified"] is False and r["verified_by"] is None, (k, r.get("id"))


def test_formula_evidence_quotes_short_and_levels_valid():
    for f in FG["formulas"]:
        for k in ("contraindications", "condition_cautions", "notes"):
            for r in f[k]:
                assert 0 < len(r["evidence_quote"]) <= MAX_QUOTE
                assert r["evidence_tier"] == "A"
        assert {r["level"] for r in f["contraindications"]} == {"avoid"}
        assert {r["level"] for r in f["condition_cautions"]} == {"caution"}


def test_formula_contraindications_are_scoped_to_formulas_not_single_herbs():
    for f in FG["formulas"]:
        for r in f["contraindications"] + f["condition_cautions"]:
            assert "ไม่ใช่สมุนไพรเดี่ยว" in r["applies_to"]
    assert FG["engine_use"] is False and "ห้ามนำข้อห้ามของตำรับไปใช้กับสมุนไพรเดี่ยว" in FG["note"]


def test_formula_ratio_limits_and_examples_are_consistent():
    f = FG["formulas"][0]
    assert {r["case_id"] for r in f["ratio_limits"]} == {"general", "postpartum", "fatigue"}
    for r in f["ratio_limits"]:
        assert set(r["max_percent_by_weight"]) == {"blood_tonic_drugs", "mild_taste", "hot_taste"}
        assert all(isinstance(v, int) and 0 < v <= 100 for v in r["max_percent_by_weight"].values())
    caps = {r["case_id"]: r["max_percent_by_weight"] for r in f["ratio_limits"]}
    tol = f["source_discrepancies"][0]["max_excess_percentage_points"]  # ต้นฉบับเองเกินเพดานเล็กน้อย (บันทึกไว้ ไม่แก้ตัวเลข)
    worst = 0.0
    for e in f["worked_examples"]:
        for g, pct in e["percent_by_weight"].items():
            assert 0 < pct <= caps[e["case_id"]][g] + tol, (e["id"], g)
            worst = max(worst, pct - caps[e["case_id"]][g])
        assert sum(e["percent_by_weight"].values()) <= 100, e["id"]  # สามกลุ่มหลัก ส่วนที่เหลือเป็นตัวยาเสริม
    assert abs(worst - tol) < 0.005  # ค่าที่บันทึกไว้ต้องตรงกับส่วนต่างจริงสูงสุด
    ids = [i["id"] for g in f["essential_groups"] + f["supplementary_groups"] for i in [g]]
    assert len(ids) == len(set(ids)) and all(g["ingredients"] for g in f["essential_groups"] + f["supplementary_groups"])


def test_priority_rows_page_offset_and_ranks():
    off = HP["source"]["page_offset"]
    rows = HP["dispensing_top5_opd"]["rows"]
    for r in rows + HP["herbal_champions"]["rows"]:
        assert r["pdf_page"] - r["source_page"] == off and r["verified"] is False and r["verified_by"] is None
    for y in (2564, 2565, 2566, 2567):
        yr = [r for r in rows if r["year_be"] == y]
        assert [r["rank"] for r in yr] == [1, 2, 3, 4, 5]
        assert all(a["count"] > b["count"] for a, b in zip(yr, yr[1:])), y


def test_priority_herb_ids_exist_and_names_match_exactly():
    rows = HP["dispensing_top5_opd"]["rows"] + HP["herbal_champions"]["rows"]
    matched = [r for r in rows if r["herb_id"]]
    assert matched, "ควรมีอย่างน้อยหนึ่งชื่อที่ตรงกับฐานข้อมูล"
    for r in matched:
        assert HERBS[r["herb_id"]] == r["name_th"]  # จับคู่ด้วยชื่อไทยตรงตัวเท่านั้น
    # ชื่อที่เป็นตำรับ/ยาสำเร็จรูปห้ามผูกกับสมุนไพรเดี่ยว
    assert all(r["herb_id"] is None for r in HP["dispensing_top5_opd"]["rows"] if r["kind"] == "formula_product")
    assert HP["engine_use"] is False


def test_engine_and_api_never_read_the_reference_files():
    for d in ("engine", "api"):
        for p in (ROOT / d).rglob("*.py"):
            if "tests" in p.parts:
                continue
            t = p.read_text(encoding="utf-8")
            assert "formula_guidelines" not in t and "herb_priority" not in t, p


def test_reference_files_never_say_safe_word():
    for p in ("data/formula_guidelines.json", "data/herb_priority.json"):
        t = (ROOT / p).read_text(encoding="utf-8")
        # กฎข้อ 5: ไฟล์ข้อมูลใหม่ไม่ใช้คำนี้เลย
        assert "ปลอดภัย" not in t, p
