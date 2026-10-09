"""ตัวถอดรหัสยาแผนไทย 24 หลัก: ถอดตัวอย่างในคู่มือได้ถูก และปฏิเสธรหัสผิดโดยไม่เดา (ทุกกฎมีเคสที่ผ่านและเคสที่ไม่ผ่าน)"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from code24 import decode  # noqa: E402

DOC = json.loads((ROOT / "data/ttm_code24.json").read_text(encoding="utf-8"))
EX = DOC["worked_example"]["code"]  # ตัวอย่างจริงในคู่มือ หน้าพิมพ์ 27 (PDF 34)


def mk(**kw):
    p = dict(t="4", f="1", ing="000000023", mark="9", g="1", v="400", form="201", mfr="11460")
    p.update(kw)
    return p["t"] + p["f"] + p["ing"] + p["mark"] + p["g"] + p["v"] + p["form"] + p["mfr"]


def test_data_file_shape_and_pages():
    off = DOC["source"]["page_offset"]
    assert DOC["length"] == 24 and DOC["engine_use"] is False and DOC["verified"] is False
    codes = [d["code"] for d in DOC["dosage_forms"]]
    assert len(codes) == 35 == len(set(codes))
    for r in DOC["dosage_forms"] + DOC["fields"] + [DOC["worked_example"]]:
        assert r["pdf_page"] - r["source_page"] == off
    for d in DOC["dosage_forms"]:
        assert d["verified"] is False and d["verified_by"] is None and len(d["code"]) == 3
    spans = sorted((f["positions"] for f in DOC["fields"] if f["id"] not in ("strength_special",)))
    assert [p for s in spans for p in range(s[0], s[1] + 1)] == list(range(1, 25))  # ครอบ 24 หลักพอดี ไม่ซ้อน
    assert "ปลอดภัย" not in json.dumps(DOC, ensure_ascii=False)


def test_decodes_the_manual_example_exactly():
    r = decode(EX, DOC)
    assert r["valid"] and r["errors"] == []
    e = DOC["worked_example"]["expect"]
    f = r["fields"]
    assert f["formula_type"]["code"] == e["formula_type"] == "1" and f["formula_type"]["name_th"] == "ยาเดี่ยว"
    assert f["strength"]["value"] == e["strength_value"] == 400 and f["strength"]["unit"] == "mg/unit" and f["strength"]["group"] == e["strength_group"]
    assert f["dosage_form"] == {"code": "201", "name_th": "ยาแคปซูล"} and f["manufacturer_code"] == e["manufacturer"]
    assert f["main_ingredient_code"] == "000000023" and "ชื่อ" not in json.dumps(f["main_ingredient_code"])  # ไม่แปลเป็นชื่อสมุนไพร


def test_percent_groups_and_decimal_marker_below_one_percent():
    assert decode(mk(g="3", v="025", form="401"), DOC)["fields"]["strength"] == {"kind": "value", "value": 25, "unit": "% w/w", "group": "3", "text_th": "25 % w/w", "raw": "93025"}
    assert decode(mk(g="3", v="100", form="401"), DOC)["valid"]
    half = decode(mk(g="4", v="905", form="404"), DOC)["fields"]["strength"]  # 9 = จุดทศนิยม แล้วตามด้วย 05 => 0.05%
    assert half["value"] == 0.05 and half["unit"] == "% v/v"
    assert not decode(mk(g="3", v="101", form="401"), DOC)["valid"]  # เกิน 100% และไม่ใช่รูปทศนิยม... 101 ต้องปฏิเสธ
    assert not decode(mk(g="3", v="900", form="401"), DOC)["valid"]  # ทศนิยมต้องมีเลข 01 ขึ้นไป


def test_special_strength_codes_are_reported_not_guessed():
    unk = decode("4" + "1" + "000000023" + "00000" + "201" + "11460", DOC)
    assert unk["valid"] and unk["fields"]["strength"] == {"kind": "special", "text_th": "ยาแผนไทยที่ไม่ทราบความแรง", "raw": "00000"}
    na = decode("4" + "2" + "000000023" + "99999" + "945" + "11460", DOC)
    assert na["valid"] and na["fields"]["strength"]["text_th"] == "ยาแผนไทยที่ไม่สามารถระบุความแรงได้" and na["fields"]["formula_type"]["name_th"] == "ยาตำรับ"


def test_rejects_malformed_codes_with_reasons_and_no_fields_guessed():
    for bad in ("", "123", EX[:-1], EX + "0", EX.replace("4", "x", 1), "๔" * 24, None, 4100000002391400201114601):
        r = decode(bad, DOC)  # type: ignore[arg-type]
        assert r["valid"] is False and r["fields"] == {} and r["errors"]
    assert "หลักที่ 1" in " ".join(decode(mk(t="3"), DOC)["errors"])
    assert "หลักที่ 2" in " ".join(decode(mk(f="3"), DOC)["errors"])
    assert "หลักที่ 12" in " ".join(decode(mk(mark="8"), DOC)["errors"])
    assert "หลักที่ 13" in " ".join(decode(mk(g="7"), DOC)["errors"])
    r = decode(mk(form="123"), DOC)
    assert not r["valid"] and "dosage_form" not in r["fields"] and "123" in " ".join(r["errors"])


def test_all_35_forms_decode_and_result_is_deterministic():
    for d in DOC["dosage_forms"]:
        r = decode(mk(form=d["code"]), DOC)
        assert r["valid"] and r["fields"]["dosage_form"]["name_th"] == d["name_th"]
    assert decode(EX, DOC) == decode(EX, DOC)
