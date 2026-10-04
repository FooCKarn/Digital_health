"""ขั้น 4 ของ docs/extraction-pipeline.md: เทียบรอบ B กับต้นฉบับ แล้วสร้าง data/herbs.json

ใช้: python scripts/verify_extraction.py
- evidence_quote ที่ไม่พบในข้อความต้นฉบับ => ปัดตก (exit 1) ไม่เขียน herbs.json
- เลขหน้า (source_page = หน้าพิมพ์, pdf_page = หน้าไฟล์) คำนวณจากตำแหน่งที่พบวลี ไม่ใช่ให้โมเดลกรอก
- ทุกแถวออกเป็น verified:false เสมอ (ตั้ง true ได้เมื่อคนตรวจกับต้นฉบับแล้วเท่านั้น)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
OFFSET = 8
FOOTER = re.compile(r"\d{1,2}\s*\.\s*[^\n]+\nแนวทางการใช้ยาสมุนไพร\s*\nในการดูแลอาการเจ็บป่วยเบื้องต้น\s*\n\d+")
ITEM_KEYS = ["contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits", "notes"]
NS = lambda s: re.sub(r"\s+", "", s)  # noqa: E731  ข้อความไทยมีช่องว่างแทรกกลางคำ จึงเทียบแบบไม่สนช่องว่าง
# หัวข้อที่ควรพบวลี -> ระดับที่ "ข้อห้ามใช้" ควรเป็น avoid (ตรวจมือถ้าไม่ตรง ไม่ปรับให้เอง)
SECTION_HEADS = ["ข้อห้ามใช้", "คำเตือน", "ข้อควรระวัง", "4.ลักษณะพืช"]


def main() -> int:
    pages = json.loads((WORK / "pages.json").read_text(encoding="utf-8"))
    index = {h["no"]: h for h in json.loads((WORK / "herbs_index.json").read_text(encoding="utf-8"))}
    herbs_b = [h for f in sorted(WORK.glob("round_b*.json")) for h in json.loads(f.read_text(encoding="utf-8"))["herbs"]]
    ids = [h["id"] for h in herbs_b]
    assert len(ids) == len(set(ids)), "herb id ซ้ำข้ามไฟล์ round_b*.json"
    errors, review, out = [], [], []
    for h in herbs_b:
        ix = index[h["no"]]

        def ctx(no):
            text, offs = "", []  # offs: (เริ่มที่ตำแหน่ง, หน้า PDF) ในข้อความที่ลบช่องว่างแล้ว
            for pn in range(index[no]["pdf_start"], index[no]["pdf_end"] + 1):
                offs.append((len(text), pn))
                text += NS(FOOTER.sub("", pages[pn - 1]["clean"]))
            return text, offs, sorted((text.find(k), k) for k in SECTION_HEADS if text.find(k) >= 0)

        def locate(quote: str, no: int):
            # no = เลขรายการที่วลีอยู่จริง (ปกติคือสมุนไพรเอง; evidence_herb_no ใช้เมื่อเล่มอ้างข้อจำกัดข้ามรายการ เช่น Senna)
            text, offs, heads = ctx(no)
            pos = text.find(NS(quote))
            if pos < 0:
                return None
            pdf_page = [p for s, p in offs if s <= pos][-1]
            section = [k for s, k in heads if s <= pos]
            return pdf_page, (section[-1] if section else "?")

        for key in ITEM_KEYS:
            for item in h.get(key, []):
                hit = locate(item["evidence_quote"], item.get("evidence_herb_no", h["no"]))
                if not hit:
                    errors.append(f"{h['id']}.{key}: ไม่พบวลีในต้นฉบับ: {item['evidence_quote'][:50]}")
                    continue
                item["pdf_page"], item["source_page"] = hit[0], hit[0] - OFFSET
                item["verified"] = False
                # สัญญาณให้คนตรวจ: ข้อห้ามใช้ควรเป็น avoid; ระดับต่างจากหัวข้อ = ตรวจมือ
                if hit[1] == "ข้อห้ามใช้" and item.get("level") not in (None, "avoid"):
                    review.append(f"{h['id']}.{key}: อยู่ใต้ 'ข้อห้ามใช้' แต่ level={item['level']}")
                if hit[1] != "ข้อห้ามใช้" and item.get("level") == "avoid":
                    review.append(f"{h['id']}.{key}: level=avoid อยู่ใต้ '{hit[1]}' (ตรวจว่าถ้อยคำ 'ไม่ควร/ห้าม' จริง): {item['text'][:40]}")
        out.append({**h, "source": {"doc": "TTM first 2568", "pdf_pages": [ix["pdf_start"], ix["pdf_end"]],
                                    "printed_pages": [ix["pdf_start"] - OFFSET, ix["pdf_end"] - OFFSET]},
                    "verified": False, "verified_by": None})
    for e in errors:
        print("ERROR", e)
    for r in review:
        print("REVIEW", r)
    if errors:
        return 1
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "herbs.json").write_text(json.dumps({"herbs": out}, ensure_ascii=False, indent=2), encoding="utf-8")
    n = sum(len(h.get(k, [])) for h in out for k in ITEM_KEYS)
    print(f"OK herbs={len(out)} items={n} -> data/herbs.json (ทั้งหมด verified:false)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
