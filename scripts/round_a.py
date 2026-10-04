"""รอบ A (regex) ของ docs/extraction-pipeline.md ขั้น 3: ตัดข้อความต่อหัวข้อ ยังไม่ตีความ

ใช้: python scripts/round_a.py [no ...]   (ค่าเริ่มต้น = 5 ชนิดนำร่อง: กระเทียม ขิง ขี้เหล็ก มะขาม รางจืด)
ผลลัพธ์: work/round_a.json {herb_no: {name, pdf_pages, printed_pages, sections: {หัวข้อ: {text, pdf_page}}}}
"""
import json
import re
import sys
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"
PILOT = [3, 14, 15, 38, 48]
OFFSET = 8  # ตรวจแล้วจาก herbs_index: หน้า PDF - หน้าพิมพ์ = 8 ทุกรายการ (ส่วนรายการสมุนไพร)
# หัวข้อที่ต้องสกัด (ฟิลด์ความปลอดภัย) ตามลำดับในแม่แบบ; จุดสิ้นสุดของแต่ละหัวข้อคือหัวข้อถัดไปหรือ "4. ลักษณะพืช"
HEADERS = ["ส่วนที่ใช้", "รสและสรรพคุณ", "3. วิธีใช้", "ข้อห้ามใช้", "คำเตือน", "ข้อควรระวัง", "4. ลักษณะพืช"]
FOOTER = re.compile(r"\d{1,2}\s*\.\s*[^\n]+\nแนวทางการใช้ยาสมุนไพร\s*\nในการดูแลอาการเจ็บป่วยเบื้องต้น\s*\n\d+")


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def main(nos: list[int]) -> None:
    pages = json.loads((WORK / "pages.json").read_text(encoding="utf-8"))
    index = {h["no"]: h for h in json.loads((WORK / "herbs_index.json").read_text(encoding="utf-8"))}
    out = {}
    for no in nos:
        h = index[no]
        # ต่อข้อความทุกหน้าของรายการ พร้อมจำตำแหน่งเริ่มของแต่ละหน้า (กรอง footer ก่อน)
        text, bounds = "", []
        for pn in range(h["pdf_start"], h["pdf_end"] + 1):
            t = FOOTER.sub("", pages[pn - 1]["clean"])
            bounds.append((len(text), pn))
            text += t + "\n"

        def page_at(pos: int) -> int:
            return [pn for start, pn in bounds if start <= pos][-1]

        # ตำแหน่งหัวข้อ: ใช้ที่พบครั้งแรกหลังหัวข้อก่อนหน้า
        found, cursor = [], 0
        for key in HEADERS:
            m = re.search(re.escape(key).replace(r"\ ", r"\s*"), text[cursor:])
            if m:
                found.append((key, cursor + m.start(), cursor + m.end()))
                cursor += m.end()
        sections = {}
        for i, (key, s, e) in enumerate(found[:-1] if found[-1][0] == "4. ลักษณะพืช" else found):
            end = found[i + 1][1] if i + 1 < len(found) else len(text)
            sections[key.replace("3. ", "")] = {"text": squash(text[e:end]), "pdf_page": page_at(s)}
        out[str(no)] = {"name": h["name"], "pdf_pages": [h["pdf_start"], h["pdf_end"]],
                        "printed_pages": [h["pdf_start"] - OFFSET, h["pdf_end"] - OFFSET], "sections": sections}
    (WORK / "round_a.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("herbs:", {k: list(v["sections"]) for k, v in out.items()})


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or PILOT)
