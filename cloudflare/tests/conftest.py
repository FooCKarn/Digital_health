import asyncio
import sys
from pathlib import Path

import pytest

CF = Path(__file__).resolve().parents[1]
ROOT = CF.parent
for p in (CF / "app", ROOT / "engine"):
    sys.path.insert(0, str(p))

from db import SqliteDb  # noqa: E402
import dataset as ds  # noqa: E402
import service  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def migrate(db: SqliteDb, upto: int = 2) -> None:
    for f in sorted((CF / "migrations").glob("*.sql")):
        if int(f.name[:4]) <= upto:
            db.executescript(f.read_text(encoding="utf-8"))


def seed(db: SqliteDb, datasets: dict | None = None) -> dict:
    datasets = datasets or service.load_files()
    tables = ds.encode_datasets(datasets)
    db.executescript(ds.render_seed_sql(tables, ds.data_version(datasets)))
    return datasets


@pytest.fixture
def db():
    d = SqliteDb()
    migrate(d)
    return d


@pytest.fixture
def seeded(db):
    seed(db)
    return db


@pytest.fixture(autouse=True)
def restore_service():
    yield
    service.configure(service.load_files())
