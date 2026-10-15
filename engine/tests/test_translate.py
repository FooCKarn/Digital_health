"""คำแปลอังกฤษเป็นฟิลด์เสริม: ครบทุกข้อความที่หน้าเว็บแสดง และไม่เปลี่ยนฟิลด์ภาษาไทยเดิม"""
import json
from pathlib import Path

import service
from translate import en

DATA = Path(__file__).resolve().parent.parent.parent / "data"
_j = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))  # noqa: E731


def test_every_displayed_thai_string_has_english():
    herbs = _j("herbs.json")["herbs"]
    miss = []
    for h in herbs:
        miss += [h["name_th"]] if not en(h["name_th"]) else []
        for sec in ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits"):
            miss += [i["text"] for i in h[sec] if not en(i["text"])]
    for f in _j("formula_guidelines.json")["formulas"]:
        for k in ("name_th", "scope_note_th", "source_doc_th"):
            miss += [f[k]] if f.get(k) and not en(f[k]) else []
        for sec in ("contraindications", "condition_cautions"):
            miss += [i["text"] for i in f[sec] if not en(i["text"])]
    cfg = _j("config.json")
    miss += [v for v in _j("conditions.json")["conditions"].values() if not en(v)]
    miss += [v for v in _j("mechanism_tags.json")["tags"].values() if not en(v)]
    miss += [v for v in cfg["drug_class_labels_th"]["value"].values() if not en(v)]
    miss += [q for q in cfg["pharmacist_questions_th"]["value"] if not en(q)]
    assert not miss and en(cfg["disclaimer_th"])


def test_all_flags_have_english_and_thai_is_unchanged():
    ids = [h["id"] for h in service.HERBS["herbs"]] + [f["id"] for f in service.FORMULAS]
    r = service.run({"herbs": [{"id": i, "days_in_use": 30} for i in ids], "drugs": ["warfarin"],
                     "profile": {"age": 3, "pregnant": True, "breastfeeding": True, "conditions": ["fever"]}})
    flags = r["result"]["flags"]
    assert flags and all(f.get("message_en") for f in flags)
    assert all(f["message_th"].startswith(next(h["name_th"] for h in service.ALL["herbs"] if h["id"] == f["herb_id"])) for f in flags)
    assert all(a.get("message_en") for a in r["result"]["aggregates"])
    s = r["summary"]
    assert s["headline_en"] and s["headline_th"].startswith("พบคำเตือน")
    assert len(s["follow_up_questions_en"]) == len(s["follow_up_questions_th"])


def test_meta_has_english_names_and_conditions():
    m = service.meta()
    assert all(h.get("name_en") for h in m["herbs"]) and all(f.get("name_en") for f in m["formulas"])
    assert set(m["conditions_en"]) == set(m["conditions"]) and m["disclaimer_en"]
    assert "safe" not in json.dumps(m, ensure_ascii=False).lower().replace("safety", "")  # ห้ามสื่อว่าปลอดภัย


def test_table_module_matches_json_copy_and_loads_without_data_dir():
    """ตารางอยู่ใน engine/en_table.py (แพ็กไปกับโค้ด) สำเนา JSON ต้องตรงกัน และ translate ต้องไม่พึ่งโฟลเดอร์ data/"""
    import en_table
    import translate
    assert en_table.EN == _j("en_translations.json")
    assert not hasattr(translate, "Path")  # ไม่อ่านไฟล์เอง
    assert translate.en("กระเทียม")


def test_every_evidence_quote_has_english_and_flags_carry_it():
    quotes = set()
    for h in _j("herbs.json")["herbs"]:
        for sec in ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits"):
            quotes |= {i["evidence_quote"] for i in h[sec] if i.get("evidence_quote")}
    for f in _j("formula_guidelines.json")["formulas"]:
        for sec in ("contraindications", "condition_cautions"):
            quotes |= {i["evidence_quote"] for i in f[sec] if i.get("evidence_quote")}
    assert quotes and not [q for q in quotes if not en(q)]
    ids = [h["id"] for h in service.HERBS["herbs"]] + [f["id"] for f in service.FORMULAS]
    r = service.run({"herbs": [{"id": i, "days_in_use": 30} for i in ids], "drugs": ["warfarin"],
                     "profile": {"age": 3, "pregnant": True, "breastfeeding": True, "conditions": ["fever"]}})
    assert all(f["evidence_quote_en"] for f in r["result"]["flags"] if f.get("evidence_quote"))
