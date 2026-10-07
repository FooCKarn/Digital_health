"""fixture ของหน้าเว็บ (web/src/test/fixtures/*.json) ต้องตรงกับผลของ engine ปัจจุบัน ถ้าแก้ข้อมูล/กฎแล้วลืมรัน gen_fixtures.py เทสต์นี้ล้ม
สร้างใหม่ในหน่วยความจำจากตรรกะของ web/scripts/gen_fixtures.py (ไม่เขียนไฟล์ ไม่ต้องใช้ node หรือ web/dist)"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "web" / "src" / "test" / "fixtures"
_spec = importlib.util.spec_from_file_location("gen_fixtures", ROOT / "web" / "scripts" / "gen_fixtures.py")
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


def expected():
    out = {"meta.json": gen.service.meta()}
    for name, payload in gen.CASES.items():
        out[f"{name}.json"] = {"payload": payload, "response": gen.service.run(payload)}
    return out


def test_web_fixtures_match_current_engine_output():
    want = expected()
    assert sorted(p.name for p in FIX.glob("*.json")) == sorted(want)
    for name, doc in want.items():
        # ผ่าน json รอบหนึ่งเพื่อให้ tuple/ชนิดตัวเลขเทียบแบบเดียวกับไฟล์
        assert json.loads((FIX / name).read_text(encoding="utf-8")) == json.loads(json.dumps(doc, ensure_ascii=False)), name
