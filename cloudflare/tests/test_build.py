"""ชุดที่จะขึ้น Cloudflare: build ได้ seed.sql ที่รันกับ D1/SQLite ได้และได้ข้อมูลเดิม, ไม่มีโมดูลที่ Worker ใช้ไม่ได้, เวอร์ชันนโยบายตรงกับหน้าเว็บ"""
import ast
import re
import sys

import dataset as ds
import service
from conftest import CF, ROOT, migrate, run
from db import SqliteDb
from policy import POLICY_VERSION

sys.path.insert(0, str(ROOT / "scripts"))
import build_worker  # noqa: E402


def test_build_produces_bundle_and_seed_that_loads_back_identically(tmp_path):
    out = build_worker.build(tmp_path / "b")
    names = {p.name for p in out.iterdir()}
    assert {"worker.py", "router.py", "service.py", "check.py", "llm.py", "auth.py", "state.py", "dataset.py", "seed.sql", "VERSION"} <= names
    assert "db.py" not in names                                         # sqlite3 ใช้ใน Worker ไม่ได้
    db = SqliteDb()
    migrate(db)
    db.executescript((out / "seed.sql").read_text(encoding="utf-8"))
    rows = {t: run(db.all(ds.SELECTS[t])) for t in ds.TABLE_ORDER}
    back, ref = ds.decode_datasets(rows)
    assert back == service.load_files()
    assert set(ref) == set(build_worker.REFERENCE_DOCS)
    assert run(db.first("SELECT value FROM ref_meta WHERE key='data_version'"))["value"] == (out / "VERSION").read_text().strip()


def test_worker_modules_do_not_import_unavailable_stdlib(tmp_path):
    out = build_worker.build(tmp_path / "b")
    for f in out.glob("*.py"):
        if f.name == "worker.py":
            continue
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module] if isinstance(node, ast.ImportFrom) else []
            assert "sqlite3" not in mods and "js" not in mods and "pyodide" not in mods, f.name


def test_policy_version_matches_web():
    tsx = (ROOT / "web/src/components/Policy.tsx").read_text(encoding="utf-8")
    assert re.search(r'POLICY_VERSION = "([^"]+)"', tsx).group(1) == POLICY_VERSION


def test_wrangler_config_is_sane_and_has_no_secrets():
    text = (CF / "wrangler.jsonc").read_text(encoding="utf-8")
    assert '"python_workers"' in text and '"run_worker_first": ["/api/*"]' in text and '"binding": "DB"' in text
    assert not re.search(r"(AIza|sk-ant|api[_-]?key\"\s*:\s*\"[A-Za-z0-9])", text)


def test_export_script_writes_files_equal_to_originals(tmp_path):
    import export_reference_from_sqlite as ex
    import json
    from conftest import seed
    path = tmp_path / "d1.db"
    db = SqliteDb(str(path))
    migrate(db)
    seed(db)
    # ใส่เอกสารอ้างอิงด้วย เหมือน seed จริง
    extra = {n: json.loads((ROOT / f"data/{n}.json").read_text(encoding="utf-8")) for n in build_worker.REFERENCE_DOCS}
    run(db.run("DELETE FROM ref_docs WHERE name NOT LIKE '%.top'"))
    for n, doc in extra.items():
        run(db.run("INSERT INTO ref_docs(name, doc) VALUES (?, ?)", (n, json.dumps(doc, ensure_ascii=False))))
    out = tmp_path / "out"
    out.mkdir()
    written = ex.export(str(path), out)
    assert {p.name for p in written} >= {"herbs.json", "config.json", "formula_guidelines.json", "ttm_code24.json"}
    for p in written:
        assert json.loads(p.read_text(encoding="utf-8")) == json.loads((ROOT / "data" / p.name).read_text(encoding="utf-8")), p.name
