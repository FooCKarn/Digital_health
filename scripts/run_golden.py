"""รัน docs/golden_cases.json กับ engine + data จริง รายงาน PASS/FAIL/SKIP พร้อมเหตุผล

ใช้: python scripts/run_golden.py   (exit 1 ถ้ามีเคส FAIL)
SKIP = เคสต้องใช้สิ่งที่ยังไม่มี (R3/R6, สมุนไพรที่ยังไม่ได้ดึง) ไม่นับเป็นผ่าน
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))
from check import check  # noqa: E402
from formulas import formula_entries  # noqa: E402

load = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = load("data/herbs.json"), load("data/drug_class_map.json"), load("data/config.json")
HERBS = {**HERBS, "herbs": HERBS["herbs"] + formula_entries(load("data/formula_guidelines.json"))}  # ตำรับเข้ามาทางแถวที่แปลงแล้ว
TAGS = load("data/mechanism_tags.json")["tags"]
CASES = {c["id"]: c for c in load("docs/golden_cases.json")["cases"]}
ORDER = CONFIG["severity_order"]


def matches(flag, want):
    for k in ("rule_id", "herb_id", "drug_class", "evidence_tier", "condition", "group", "source_page"):
        if k in want and flag.get(k) != want[k]:
            return False
    lvl = want.get("expected_min_level")
    return lvl is None or ORDER.index(flag["severity"]) <= ORDER.index(lvl)


def evaluate(case):
    """คืน (สถานะ, เหตุผล)"""
    exp, inp = case["expected"], case.get("input") or CASES[case["input_ref"]]["input"]
    if "swaps_must_not_include" in exp:
        return "SKIP", "ต้องใช้ R6 (ยังไม่ทำ)"
    known = {h["id"] for h in HERBS["herbs"]}
    missing = [h["id"] for h in inp["herbs"] if h["id"] not in known]
    if missing and "must_have_unknown_inputs" not in exp:
        return "SKIP", f"สมุนไพรยังไม่ได้ดึง: {missing}"
    r = check(inp, HERBS, DRUGS, CONFIG, TAGS)
    errs = []
    for w in exp.get("must_have_aggregates", []):
        if not any(a["mechanism_tag"] == w["mechanism_tag"] and a["count"] >= w.get("min_count", 0) for a in r["aggregates"]):
            errs.append(f"ไม่พบ aggregate {w}")
    for w in exp.get("must_have_flags", []):
        hit = [f for f in r["flags"] if matches(f, w)]
        if not hit:
            errs.append(f"ไม่พบคำเตือน {w}")
        elif "message_must_mention" in w and not any(w["message_must_mention"] in f["message_th"] for f in hit):
            errs.append(f"ข้อความไม่กล่าวถึง '{w['message_must_mention']}'")
    for w in exp.get("must_not_have_flags", []):
        if any(matches(f, w) for f in r["flags"]):
            errs.append(f"พบคำเตือนที่ไม่ควรมี {w}")
    for u in exp.get("must_have_unknown_inputs", []):
        if u not in r["coverage"]["unknown_inputs"]:
            errs.append(f"ไม่อยู่ใน unknown_inputs: {u}")
    if "pharmacist_review_required" in exp and r["pharmacist_review_required"] != exp["pharmacist_review_required"]:
        errs.append("pharmacist_review_required ไม่ตรง")
    if exp.get("must_not_state_safe") and any("ปลอดภัย" in f["message_th"] for f in r["flags"]):
        errs.append("ข้อความคำเตือนใช้คำว่า 'ปลอดภัย'")
    if exp.get("must_show_coverage") and not r["coverage"]["herbs_in_db"]:
        errs.append("ไม่มี coverage")
    if (exp.get("must_show_disclaimer") or exp.get("must_not_state_safe")) and not r["disclaimer_th"]:
        errs.append("ไม่มี disclaimer")
    if exp.get("deterministic") and check(inp, HERBS, DRUGS, CONFIG, TAGS) != r:
        errs.append("ผลไม่เหมือนกันเมื่อเรียกซ้ำ")
    return ("FAIL", "; ".join(errs)) if errs else ("PASS", "")


if __name__ == "__main__":
    tally = {"PASS": 0, "FAIL": 0, "SKIP": 0}
    for c in CASES.values():
        s, why = evaluate(c)
        tally[s] += 1
        print(f"{s:4} {c['id']} {c['title'][:50]}" + (f"  <- {why}" if why else ""))
    print(tally)
    sys.exit(1 if tally["FAIL"] else 0)
