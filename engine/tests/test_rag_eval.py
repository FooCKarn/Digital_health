import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
spec = importlib.util.spec_from_file_location("run_rag_eval", ROOT / "scripts" / "run_rag_eval.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)


def test_no_non_limit_case_fails_and_all_refusals_are_correct():
    st = ev.evaluate(ev.CONFIG, verbose=False)
    assert st["fail"] == [], st
    assert st["refuse_ok"] >= st["refuse_total"] - len(st["known_fail"])   # คำถามที่ต้องปฏิเสธต้องปฏิเสธถูกทุกข้อ (ยกเว้น known_limit)
    assert st["retrieval_ok"] == st["retrieval_total"], st


def test_eval_set_references_only_existing_items():
    ids = {c["item_id"] for c in ev.INDEX["chunks"]}
    for c in ev.CASES:
        for i in c["expect"]["item_ids_any"]:
            assert i in ids, f"{c['id']}: ไม่มีรหัส {i} ในข้อมูล"
