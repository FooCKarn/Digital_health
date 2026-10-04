"""ขั้น 1-2 ของ docs/extraction-pipeline.md: ดึงข้อความ ล้าง และแยกรายการสมุนไพร

ใช้: python scripts/extract_pdf.py <path-to-pdf>
ผลลัพธ์ (work/ เป็นข้อความต้นฉบับเพื่อตรวจภายในทีมเท่านั้น ห้ามเผยแพร่ ดู extraction-pipeline ข้อ 4):
  work/pages.json   [{pdf_page, raw, clean}]  (pdf_page เริ่มที่ 1)
  work/herbs_index.json  [{no, name, pdf_start, pdf_end}]
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

OUT = Path(__file__).resolve().parent.parent / "work"
# สระบน/ล่าง วรรณยุกต์ ที่ซ้ำติดกัน (extraction-pipeline ขั้น 1)
COMBINING = "ัิ-ฺ็-๎"
DUP = re.compile(f"([{COMBINING}])\\1+")
SARA_AM_DUP = re.compile("ำ{2,}")  # ำำ -> ำ
ODD = re.compile("[^฀-๿ -~\n]")  # ไม่ใช่ไทย/ASCII (รวม U+FFFD)


def clean(text: str) -> str:
    text = SARA_AM_DUP.sub("ำ", text)
    text = DUP.sub(r"\1", text)
    return ODD.sub("", text)


def main(pdf_path: str) -> None:
    OUT.mkdir(exist_ok=True)
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc, start=1):
        raw = page.get_text()
        pages.append({"pdf_page": i, "raw": raw, "clean": clean(raw)})
    (OUT / "pages.json").write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")

    # ขั้น 2: หน้าที่ขึ้นต้น "<เลข>. <ชื่อ>" และ 600 ตัวอักษรแรก (ลบช่องว่าง) มี "วิทยาศาสตร์" และ "ชื่อวงศ์"
    starts = []
    for p in pages[30:]:
        head = p["clean"].strip()
        squashed = re.sub(r"\s+", "", head)[:600]
        # เลขลำดับ/ชื่อสมุนไพรและเลขหน้าพิมพ์อยู่ท้ายหน้า: "<no>. <ชื่อ>\nแนวทางการใช้ยาสมุนไพร\n...\n<printed>"
        foot = re.search(r"(\d{1,2})\s*\.\s*([^\n]+)\nแนวทางการใช้ยาสมุนไพร\s*\nในการดูแลอาการเจ็บป่วยเบื้องต้น\s*\n(\d+)", head)
        if foot and "วิทยาศาสตร์" in squashed and "ชื่อวงศ์" in squashed:
            starts.append({"no": int(foot.group(1)), "name": foot.group(2).strip(),
                           "pdf_start": p["pdf_page"], "printed_start": int(foot.group(3))})
    for a, b in zip(starts, starts[1:] + [{"pdf_start": len(pages) + 1}]):
        a["pdf_end"] = b["pdf_start"] - 1
    (OUT / "herbs_index.json").write_text(json.dumps(starts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"pages={len(pages)} herbs_found={len(starts)}")


if __name__ == "__main__":
    main(sys.argv[1])
