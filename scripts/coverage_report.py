"""รายงานความครอบคลุมของข้อความความปลอดภัยทั้ง 50 ชนิด จากผลรอบ A (work/round_a.json)
ใช้: python scripts/round_a.py 1 2 ... 50 && python scripts/coverage_report.py
นับด้วยตัวกรองหยาบ (คำว่า 'ยา'/'ร่วมกับ') เพื่อเลือกลำดับการสกัด ไม่ใช่ข้อสรุปทางการแพทย์ ผู้ตรวจต้องอ่านจริง
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADS = ("ข้อห้ามใช้", "คำเตือน", "ข้อควรระวัง")
done = {h["no"] for h in json.loads((ROOT / "data" / "herbs.json").read_text(encoding="utf-8"))["herbs"]}
rounda = json.loads((ROOT / "work" / "round_a.json").read_text(encoding="utf-8"))

rows = []
for no, h in rounda.items():
    txt = {k: (h["sections"].get(k, {}).get("text") or "").strip() for k in HEADS}
    present = {k: v not in ("", "-") for k, v in txt.items()}
    rows.append({"no": int(no), "name": h["name"], "any": any(present.values()),
                 "drug": any(re.search(r"ยา|ร่วมกับ", v) for k, v in txt.items() if present[k]),
                 "missing": [k for k in HEADS if k not in h["sections"]]})

print(f"สมุนไพรที่วิเคราะห์: {len(rows)}")
print(f"มีข้อความเตือนอย่างน้อย 1 หัวข้อ: {sum(r['any'] for r in rows)} | ทั้ง 3 หัวข้อเป็น '-': {sum(not r['any'] for r in rows)}")
print(f"ข้อความเตือนที่เอ่ยถึง 'ยา' หรือ 'ร่วมกับ' (ตัวกรองหยาบ): {sum(r['drug'] for r in rows)}")
print("หัวข้อที่หาไม่พบ (ต้องดูมือ):", [(r["no"], r["missing"]) for r in rows if r["missing"]] or "ไม่มี")
print("ดึงเข้า data/herbs.json แล้ว:", sorted(done))
print("ยังไม่ได้ดึงแต่น่าจะมีคำเตือนเรื่องยา:", [(r["no"], r["name"]) for r in rows if r["drug"] and r["no"] not in done])
print("ไม่มีข้อความเตือนเลย ('-' ทั้ง 3 หัวข้อ):", [(r["no"], r["name"]) for r in rows if not r["any"]])
