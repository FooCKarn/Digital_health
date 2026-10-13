"""ข้อมูลอ้างอิงใน D1: ย้ายแล้วต้องเหมือนไฟล์ทุกฟิลด์, กติกาของฐานข้อมูลต้องบังคับได้, ผลตรวจต้องเท่าเดิมทุกเคส"""
import json
import sqlite3

import pytest

import dataset as ds
import service
from conftest import ROOT, run, seed


def load_from_db(db):
    rows = {t: run(db.all(ds.SELECTS[t])) for t in ds.TABLE_ORDER}
    return ds.decode_datasets(rows)


def test_round_trip_in_memory_is_lossless():
    d = service.load_files()
    back, ref = ds.decode_datasets(ds.encode_datasets(d))
    assert back == d
    assert ref == {}


def test_reference_docs_are_kept_too():
    extra = {n: json.loads((ROOT / f"data/{n}.json").read_text(encoding="utf-8")) for n in ("context_stats", "herb_priority", "ttm_code24", "herbal_substitution_groups", "primary_care_guidelines", "textbook_safety_notes")}
    _, ref = ds.decode_datasets(ds.encode_datasets(service.load_files(), extra))
    assert ref == extra


def test_seed_into_sqlite_then_load_matches_files_exactly(db):
    d = seed(db)
    back, _ = load_from_db(db)
    assert back == d
    assert run(db.first("SELECT value FROM ref_meta WHERE key='data_version'"))["value"] == ds.data_version(d)


def test_seed_is_repeatable_and_keeps_user_tables(db):
    seed(db)
    run(db.run("INSERT INTO users(id,handle,pw_hash,pw_salt,pw_iter,created_at,consent_policy,consent_at) VALUES ('u1','a','h','s',1,'t','v','t')"))
    seed(db)
    assert run(db.first("SELECT COUNT(*) AS n FROM users"))["n"] == 1
    assert run(db.first("SELECT COUNT(*) AS n FROM herbs"))["n"] == 21


def test_engine_results_identical_with_data_from_d1(seeded):
    cases = json.loads((ROOT / "docs/golden_cases.json").read_text(encoding="utf-8"))["cases"]
    payloads = []
    for c in cases:
        inp = c.get("input")
        if inp:
            payloads.append(inp)
    assert len(payloads) >= 15
    expected, compared = [], 0
    for p in payloads:
        try:
            expected.append(service.run(p))
        except ValueError:
            expected.append(None)
    back, _ = load_from_db(seeded)
    service.configure(back)
    for p, want in zip(payloads, expected):
        try:
            got = service.run(p)
        except ValueError:
            got = None
        assert got == want
        compared += got is not None
    assert compared >= 15
    assert service.meta()["coverage"]["herbs_in_db"] == 21


def test_editing_a_row_changes_the_loaded_data_and_bumps_version(seeded):
    before = run(seeded.first("SELECT value FROM ref_meta WHERE key='data_version'"))["value"]
    run(seeded.run("UPDATE config SET value='3' WHERE key='child_age_cutoff_years'"))
    after = run(seeded.first("SELECT value FROM ref_meta WHERE key='data_version'"))["value"]
    assert after != before
    back, _ = load_from_db(seeded)
    assert back["config"]["child_age_cutoff_years"]["value"] == 3


def test_database_refuses_verified_without_verifier(seeded):
    with pytest.raises(sqlite3.IntegrityError):
        run(seeded.run("UPDATE herbs SET verified=1 WHERE id='garlic'"))
    with pytest.raises(sqlite3.IntegrityError):
        run(seeded.run("UPDATE herb_rules SET verified=1 WHERE id=1"))
    run(seeded.run("UPDATE herbs SET verified=1, verified_by='ภก. ทดสอบ' WHERE id='garlic'"))  # มีผู้ตรวจ = ผ่าน
    with pytest.raises(sqlite3.IntegrityError):
        run(seeded.run("UPDATE herb_rules SET level='safe' WHERE id=1"))                       # ระดับต้องเป็น avoid/caution/info


def test_rule_with_null_and_absent_keys_survives(db):
    d = service.load_files()
    d["herbs"]["herbs"][0]["age_limits"] = [{"min_age_years": None, "level": "avoid", "text": "x", "source_page": 1, "pdf_page": 2, "verified": False, "extra_thing": [1, None]}]
    d["herbs"]["herbs"][0]["notes"] = []
    seed(db, d)
    back, _ = load_from_db(db)
    assert back == d


def test_encoder_rejects_herb_without_required_field():
    d = service.load_files()
    del d["herbs"]["herbs"][0]["source"]
    with pytest.raises(ValueError):
        ds.encode_datasets(d)


def test_sql_literal_escapes_quotes():
    assert ds.sql_literal("it's") == "'it''s'"
    assert ds.sql_literal(None) == "NULL" and ds.sql_literal(3) == "3" and ds.sql_literal(True) == "1"
