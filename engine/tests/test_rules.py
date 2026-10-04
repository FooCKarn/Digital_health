"""unit test ของ engine/check.py ใช้สมุนไพร "สมมติ" (fixture) เท่านั้น ไม่ใช่ข้อมูลความปลอดภัยจริง"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
from check import check  # noqa: E402

CONFIG = json.loads((ROOT / "data" / "config.json").read_text(encoding="utf-8"))
DRUGS = json.loads((ROOT / "data" / "drug_class_map.json").read_text(encoding="utf-8"))


def _item(**kw):
    return {"level": "avoid", "text": "ข้อความทดสอบ", "source_page": 1, "verified": False, "evidence_quote": "x", **kw}


def _herb(hid, **kw):
    base = {"id": hid, "name_th": hid, "contraindications": [], "age_limits": [], "drug_cautions": [],
            "condition_cautions": [], "duration_limits": []}
    return {**base, **kw}


HERBS = {"herbs": [
    _herb("h_preg", contraindications=[_item(condition="pregnancy")],
          age_limits=[_item(min_age_years=6), _item(min_age_years=None, applies_to="เด็ก")]),
    _herb("h_drug", drug_cautions=[_item(drug_class="anticoagulant", evidence_tier="A", mechanism_tag="bleeding_risk"),
                                   _item(drug_class=None, drug_names=["somedrug"])],
          condition_cautions=[_item(condition="diabetes", level="caution")]),
    _herb("h_days", duration_limits=[_item(max_days=None, range_days=[3, 5], group=None, level="caution")]),
    _herb("h_senna1", duration_limits=[_item(max_days=7, group="g", level="caution")]),
    _herb("h_senna2", duration_limits=[_item(max_days=7, group="g", level="caution")]),
]}


def run(**inp):
    return check(inp, HERBS, DRUGS, CONFIG)


def ids(r, rule=None):
    return [(f["rule_id"], f["herb_id"]) for f in r["flags"] if rule in (None, f["rule_id"])]


# --- R1 ---
def test_r1_pregnant_warns():
    assert ("R1", "h_preg") in ids(run(herbs=[{"id": "h_preg"}], profile={"pregnant": True, "age": 30}))


def test_r1_not_pregnant_no_warn():
    assert ids(run(herbs=[{"id": "h_preg"}], profile={"pregnant": False, "age": 30}), "R1") == []


def test_r1_age_below_limit_warns():
    r = run(herbs=[{"id": "h_preg"}], profile={"pregnant": False, "age": 4})
    assert [f["condition"] for f in r["flags"]] == ["age", "age"]  # ต่ำกว่า 6 (เล่ม) และต่ำกว่าเกณฑ์เด็กของทีม
    assert any("ที่ทีมตั้ง" in f["message_th"] for f in r["flags"])  # เกณฑ์ทีมต้องบอกว่าไม่ใช่ตัวเลขจากเล่ม


def test_r1_age_above_limits_no_warn():
    assert run(herbs=[{"id": "h_preg"}], profile={"pregnant": False, "age": 30})["flags"] == []


def test_r1_missing_profile_is_not_checked_not_pass():
    r = run(herbs=[{"id": "h_preg"}], profile={})
    assert r["flags"] == [] and {"pregnancy", "age"} <= set(r["coverage"]["not_checked"])


def test_r1_condition_caution():
    assert ids(run(herbs=[{"id": "h_drug"}], profile={"conditions": ["diabetes"]}), "R1") == [("R1", "h_drug")]
    assert ids(run(herbs=[{"id": "h_drug"}], profile={"conditions": []}), "R1") == []


# --- R2 (ชั้น A) ---
def test_r2_class_match_warns_and_requires_pharmacist():
    r = run(herbs=[{"id": "h_drug"}], drugs=["warfarin"])
    assert ("R2", "h_drug") in ids(r) and r["pharmacist_review_required"] is True


def test_r2_other_class_no_warn():
    r = run(herbs=[{"id": "h_drug"}], drugs=["metformin"])
    assert ids(r, "R2") == [] and r["pharmacist_review_required"] is False


def test_r2_named_drug_in_book_matches_even_if_not_in_table():
    r = run(herbs=[{"id": "h_drug"}], drugs=["SomeDrug"])
    assert ids(r, "R2") == [("R2", "h_drug")] and r["coverage"]["unknown_inputs"] == ["SomeDrug"]


def test_unknown_drug_and_herb_listed_never_guessed():
    r = run(herbs=[{"id": "nope"}], drugs=["ยาไม่มีในตาราง"])
    assert r["flags"] == [] and r["coverage"]["unknown_inputs"] == ["ยาไม่มีในตาราง", "nope"]


# --- R4 ---
def test_r4_range_uses_upper_bound():
    assert ids(run(herbs=[{"id": "h_days", "days_in_use": 6}]), "R4") == [("R4", "h_days")]
    assert ids(run(herbs=[{"id": "h_days", "days_in_use": 4}]), "R4") == []


def test_r4_group_limit_shared():
    r = run(herbs=[{"id": "h_senna1", "days_in_use": 10}, {"id": "h_senna2", "days_in_use": 2}])
    assert [f.get("group") for f in r["flags"]] == ["g"]
    assert run(herbs=[{"id": "h_senna1", "days_in_use": 7}]) ["flags"] == []


# --- ทั่วไป ---
def test_flags_have_required_fields_and_deterministic():
    inp = dict(herbs=[{"id": "h_drug"}, {"id": "h_drug"}, {"id": "h_preg"}], drugs=["warfarin"],
               profile={"pregnant": True, "age": 3})
    r1, r2 = run(**inp), run(**inp)
    assert r1 == r2
    for f in r1["flags"]:
        assert {"evidence_tier", "source_page", "verified", "rule_id", "severity", "flag_id"} <= set(f)
    assert len([f for f in r1["flags"] if f["herb_id"] == "h_drug"]) == len({f["flag_id"] for f in r1["flags"] if f["herb_id"] == "h_drug"})
    assert [f["severity"] for f in r1["flags"]] == sorted((f["severity"] for f in r1["flags"]), key=CONFIG["severity_order"].index)
