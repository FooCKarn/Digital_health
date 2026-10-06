"""ประเมินการค้นของแชตกับ docs/rag_eval.json (ไม่เรียก LLM) พิมพ์ตารางและสรุป: recall@k ของคำถามที่ต้องค้นเจอ, ปฏิเสธถูกต้อง, known_limit
ใช้: python scripts/run_rag_eval.py            exit 1 ถ้ามีกรณีที่ไม่ใช่ known_limit ล้ม
     python scripts/run_rag_eval.py --sweep    ลองค่า rag_min_score หลายค่า แล้วแนะนำค่าต่ำสุดที่ทำให้ N01-N07 ถูกครบ (ไม่มีการตอบเกิน)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))
import rag  # noqa: E402
from check import check  # noqa: E402

load = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = load("data/herbs.json"), load("data/drug_class_map.json"), load("data/config.json")
CONDS, TAGS = load("data/conditions.json")["conditions"], load("data/mechanism_tags.json")["tags"]
CASES = load("docs/rag_eval.json")["cases"]
INDEX = rag.build_index(HERBS, DRUGS, CONDS, CONFIG["rag_synonyms"]["value"])


def run_case(c, config):
    inp = c["check"]
    result = check(inp, HERBS, DRUGS, config, TAGS) if inp and inp["herbs"] else None
    checked = [h["id"] for h in inp["herbs"]] if inp else []
    a = rag.answer(c["question"], result, [], checked, INDEX, config, use_llm=False)
    want = c["expect"]
    ids = [x["item_id"] for x in a["cites"]]
    ok = a["source"] == want["source"] and (not want["item_ids_any"] or any(i in ids for i in want["item_ids_any"]))
    return ok, a


def evaluate(config, verbose=True):
    stats = {"retrieval_total": 0, "retrieval_ok": 0, "refuse_total": 0, "refuse_ok": 0, "fail": [], "known_fail": []}
    for c in CASES:
        ok, a = run_case(c, config)
        if c["expect"]["item_ids_any"]:
            stats["retrieval_total"] += 1
            stats["retrieval_ok"] += ok
        if c["expect"]["source"] in ("refusal", "emergency"):
            stats["refuse_total"] += 1
            stats["refuse_ok"] += ok
        if not ok:
            (stats["known_fail"] if c.get("known_limit") else stats["fail"]).append(c["id"])
        if verbose:
            tag = "OK" if ok else ("LIMIT" if c.get("known_limit") else "FAIL")
            print(f"{tag:5} {c['id']} {c['question'][:34]:36} -> {a['source']:9} {[x['item_id'] for x in a['cites']][:3]}")
    return stats


if __name__ == "__main__":
    if "--sweep" in sys.argv:
        best = None
        for s in [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6]:
            cfg = json.loads(json.dumps(CONFIG))
            cfg["rag_min_score"]["value"] = s
            st = evaluate(cfg, verbose=False)
            print(f"min_score={s:<5} recall={st['retrieval_ok']}/{st['retrieval_total']} refuse_ok={st['refuse_ok']}/{st['refuse_total']} fail={st['fail']} known_fail={st['known_fail']}")
            if best is None and not [f for f in st["fail"] if f.startswith("N")]:   # ค่าต่ำสุดที่ N01-N07 ถูกครบ
                best = s
        print("แนะนำ rag_min_score =", best if best is not None else "ไม่มีค่าที่ทำให้ไม่มีการตอบเกิน (ต้องปรับคำพ้อง/คำเชื่อม)")
        sys.exit(0)
    st = evaluate(CONFIG)
    print(f"\nrecall (ต้องค้นเจอ): {st['retrieval_ok']}/{st['retrieval_total']} | ปฏิเสธ/ฉุกเฉินถูกต้อง: {st['refuse_ok']}/{st['refuse_total']} | known_limit ที่ล้ม: {st['known_fail']} | ล้มจริง: {st['fail']}")
    sys.exit(1 if st["fail"] else 0)
