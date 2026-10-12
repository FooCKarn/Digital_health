"""เตรียมของสำหรับ Cloudflare: สร้าง cloudflare/build/ (worker.py + engine/*.py + app/*.py แบบแบน) และ seed.sql จาก data/*.json
ใช้: python scripts/build_worker.py        แล้ว cd cloudflare && npx wrangler d1 execute herbguard --remote --file build/seed.sql
seed.sql ลบข้อมูลอ้างอิงเดิมแล้วใส่ชุดใหม่ (รันซ้ำได้ ไม่แตะตารางผู้ใช้) และตั้ง data_version = แฮชของข้อมูล
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CF = ROOT / "cloudflare"
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(CF / "app"))
import dataset  # noqa: E402
import service  # noqa: E402

REFERENCE_DOCS = ("context_stats", "herb_priority", "ttm_code24", "herbal_substitution_groups")


def build(out: Path | None = None) -> Path:
    out = out or CF / "build"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for f in (ROOT / "engine").glob("*.py"):
        shutil.copy(f, out / f.name)
    for f in (CF / "app").glob("*.py"):
        if f.name != "db.py":  # db.py ใช้ sqlite3 สำหรับทดสอบ/เครื่องท้องถิ่นเท่านั้น (Worker ใช้ D1)
            shutil.copy(f, out / f.name)
    shutil.copy(CF / "src" / "worker.py", out / "worker.py")
    datasets = service.load_files()
    reference = {n: json.loads((ROOT / "data" / f"{n}.json").read_text(encoding="utf-8")) for n in REFERENCE_DOCS}
    version = dataset.data_version(datasets, reference)
    (out / "seed.sql").write_text(dataset.render_seed_sql(dataset.encode_datasets(datasets, reference), version), encoding="utf-8")
    (out / "VERSION").write_text(version + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    o = build()
    print(f"สร้างแล้วที่ {o} (data_version {(o / 'VERSION').read_text().strip()})")
