"""ตรวจไฟล์ข้อมูลอ้างอิง (formula_guidelines.json ใช้ผ่าน engine/formulas.py เท่านั้น, herb_priority.json engine ไม่ใช้)
กติกา CLAUDE.md: ทุกแถวมีเลขหน้า + verified:false จนกว่าคนตรวจ + วลีหลักฐานสั้น (ข้อ 9) + ไม่มีคำว่า ปลอดภัย (ข้อ 5)
และห้ามให้ engine อ่านไฟล์เหล่านี้ (ข้อห้ามของตำรับไม่ใช่ข้อห้ามของสมุนไพรเดี่ยว)"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
FG = L("data/formula_guidelines.json")
HP = L("data/herb_priority.json")
SUB = L("data/herbal_substitution_groups.json")
CTX = L("data/context_stats.json")
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
        assert f["source_label_th"] and f["source_doc_th"] and f["scope_note_th"]
    assert FG["engine_use"] is True and "ห้ามนำไปใช้กับสมุนไพรเดี่ยว" in FG["note"]


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


def test_only_formulas_module_and_service_read_the_formula_file_and_nothing_reads_priority_file():
    readers = {}
    for d in ("engine", "api"):
        for p in (ROOT / d).rglob("*.py"):
            if "tests" in p.parts:
                continue
            t = p.read_text(encoding="utf-8")
            for name in ("herb_priority", "herbal_substitution_groups", "context_stats", "ttm_code24"):
                if name == "ttm_code24" and p.name == "code24.py":
                    continue  # เอ่ยชื่อไฟล์ใน docstring เท่านั้น
                assert name not in t, (name, p)  # ไฟล์สถิติ/ลำดับความสำคัญ/รหัสยา engine ห้ามอ่าน (code24.py รับ doc จากผู้เรียก ไม่โหลดเอง)
            if "formula_guidelines" in t:
                readers[p.name] = True
    # service.py โหลดไฟล์ (ที่เดียว) แล้วส่งให้ formulas.formula_entries แปลง; formulas.py เอ่ยชื่อไฟล์ใน docstring เท่านั้น
    assert "service.py" in readers and set(readers) <= {"service.py", "formulas.py"}


def _herb_of(name):
    base = name.split("/")[0]
    names = {v: k for k, v in HERBS.items()}
    for cand in (base, base[2:] if base.startswith("ยา") else None):
        if cand and cand in names:
            return names[cand]
    return None


def test_substitution_groups_shape_pages_and_matching_rule():
    off = SUB["source"]["page_offset"]
    assert SUB["engine_use"] is False and [g["group_no"] for g in SUB["groups"]] == list(range(1, 11))
    for g in SUB["groups"]:
        assert g["pdf_page"] - g["source_page"] == off and g["verified"] is False and g["verified_by"] is None and g["items"]
        for it in g["items"]:
            assert it["herb_id"] == _herb_of(it["name_th"]), it  # กติกาจับคู่ชื่อเดียวกับที่ระบุในไฟล์
            assert it["controlled_herb"] == ("กัญชา" in it["name_th"])
    assert "ไม่ใช่การแนะนำให้ผู้ใช้ใช้ยา" in SUB["note"] and "R6" in SUB["note"]
    # ชื่อที่ไม่ตรงชื่อสมุนไพรทุกตัวอักษรต้องไม่ถูกผูก (ตำรับ/ผลิตภัณฑ์ผสม)
    by = {i["name_th"]: i["herb_id"] for g in SUB["groups"] for i in g["items"]}
    assert by["ยาประสะมะแว้ง"] is None and by["ยากล้วย"] is None and by["ยาแก้ไอมะขามป้อม"] is None and by["มะขามแขก"] is None


def test_context_stats_are_internally_consistent():
    assert CTX["engine_use"] is False
    for r in CTX["herbal_share_of_prescriptions"]["rows"]:
        assert abs(r["herbal_percent"] + r["other_percent"] - 100) < 0.005, r
        assert r["pdf_page"] - r["source_page"] == CTX["source"]["page_offset"] and r["verified"] is False
    adr = {r["year_be"]: r["reports"] for r in CTX["adr_reports"]["rows"]}
    assert sorted(adr) == [2564, 2565, 2566, 2567, 2568]
    for r in CTX["adr_reports"]["largest_subgroup_per_year"]["rows"]:
        assert 0 < r["reports"] <= adr[r["year_be"]], r
    assert "ไม่ใช่อัตราการเกิดเหตุ" in CTX["note"]


def test_reference_files_never_say_safe_word():
    org = "ศูนย์เฝ้าระวังความปลอดภัยด้านผลิตภัณฑ์สุขภาพ"  # ชื่อหน่วยงานตามต้นฉบับ ไม่ใช่ข้อสรุปของระบบ
    for p in ("data/formula_guidelines.json", "data/herb_priority.json", "data/herbal_substitution_groups.json", "data/context_stats.json"):
        t = (ROOT / p).read_text(encoding="utf-8").replace(org, "")
        # กฎข้อ 5: ไฟล์ข้อมูลใหม่ไม่ใช้คำนี้เลย
        assert "ปลอดภัย" not in t, p
