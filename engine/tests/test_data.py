"""ตรวจความสอดคล้องของข้อมูลจริงใน data/ (ไม่ใช่ตรรกะกฎ)"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS = L("data/herbs.json")["herbs"]


def test_every_item_has_source_page_and_stays_unverified_until_human_checks():
    for h in HERBS:
        for k in ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits", "notes"):
            for i in h.get(k, []):
                assert isinstance(i["source_page"], int) and i["verified"] is False


def test_every_condition_code_has_ui_label():
    labels = L("data/conditions.json")["conditions"]
    codes = {i["condition"] for h in HERBS for k in ("contraindications", "condition_cautions") for i in h[k]}
    assert codes - set(labels) <= {"pregnancy", "breastfeeding"}  # สองรหัสนี้ใช้ช่องติ๊กใน profile


def test_every_drug_class_in_herbs_is_in_drug_map():
    classes = {c for e in L("data/drug_class_map.json")["entries"] for c in e["class"]}
    needed = {i["drug_class"] for h in HERBS for i in h["drug_cautions"] if i.get("drug_class")}
    assert needed - classes == {"liver_affecting"}  # กลุ่มนี้ยังไม่มีรายชื่อยา (ต้องให้เภสัชกรเพิ่ม)
