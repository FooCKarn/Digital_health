"""ส่งข้อมูลอ้างอิงที่ผู้เชี่ยวชาญแก้ใน D1 กลับเป็นไฟล์ data/*.json (เก็บประวัติการแก้ใน git ได้)
ใช้: npx wrangler d1 export herbguard --remote --output d1.sql && sqlite3 d1.db < d1.sql
     python scripts/export_reference_from_sqlite.py d1.db [--out data]
เขียนทับไฟล์ใน data/ ด้วยข้อมูลจากฐานข้อมูล (รูปแบบเดียวกับที่ seed จากไฟล์ จึงเทียบ diff ได้)
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "cloudflare" / "app"))
import dataset  # noqa: E402

FILES = {"herbs": "herbs.json", "drug_class_map": "drug_class_map.json", "config": "config.json", "conditions": "conditions.json",
         "mechanism_tags": "mechanism_tags.json", "formula_guidelines": "formula_guidelines.json"}


def export(db_path: str, out: Path) -> list[Path]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = {t: [dict(r) for r in conn.execute(dataset.SELECTS[t])] for t in dataset.TABLE_ORDER}
    datasets, reference = dataset.decode_datasets(rows)
    written = []
    for key, name in {**FILES, **{n: f"{n}.json" for n in reference}}.items():
        doc = datasets.get(key, reference.get(key))
        p = out / name
        p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(p)
    return written


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    out = Path(args[args.index("--out") + 1]) if "--out" in args else ROOT / "data"
    for p in export(args[0], out):
        print("เขียน", p)
