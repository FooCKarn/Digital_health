"""สกัดข้อความเตือนความเป็นพิษ/ข้อห้ามใช้ที่ "ตำราอ้างอิงด้านการแพทย์แผนไทย" (ชุดความรู้ที่ 3 เภสัชกรรมไทย) ระบุไว้ข้างสมุนไพร -> data/textbook_safety_notes.json
ใช้: python scripts/extract_textbook_safety.py <ไฟล์ .txt ที่ดึงจาก PDF>
ไม่ดึงตารางสรรพคุณ/รสของสมุนไพรทั้งเล่ม: ข้อความในไฟล์มีอักขระเพี้ยนมาก (ตัวดึง PDF แทรกสระ/วรรณยุกต์ซ้ำ) และตารางรสอยู่นอกขอบเขต MVP (CLAUDE.md)
เก็บเฉพาะบรรทัดที่เอกสารเตือนเอง (ห้ามใช้/ไม่ควรใช้/อันตราย/เป็นพิษต่อ/ตายได้) พร้อมชื่อหัวข้อสมุนไพรและเลขหน้าพิมพ์ ไม่เติมข้อมูลนอกเอกสาร
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKS = "ัิีึืุู็่้๊๋์ำ"
PAGE_FROM, PAGE_TO = 222, 363  # ชุดความรู้ที่ 3 เภสัชกรรมไทย (หน้าพิมพ์ตามสารบัญของเล่ม)
WARN = re.compile(r"ห้ามใช้|ห้ามรับประทาน|ไม่ควรใช้|ไม่ควรรับประทาน|อันตราย|เป็นพิษต่อ|ตายได้|ถึงตาย|ถึงชีวิต|เป็นพิษอาจ|ใช้มากเป็นพิษ|ใช้ทำยาไม่ได้|รับประทานไม่ได้|ถ้ารับประทานมากเป็นพิษ")
# สำนวนที่เป็นสรรพคุณ/คำอธิบายทั่วไป ไม่ใช่คำเตือน
NOT_WARN = re.compile(r"แก้พิษ(?:ของ)?ยาอันตราย|แก้พิษ|ถอนพิษ|ฆ่าฤทธิ์|ทำให้ความเป็นพิษ")
HEADING = re.compile(r"ไม้|ล้มลุก|เถา|เห็ด|หญ้า|\(")  # หัวข้อสมุนไพรมีคำบอกลักษณะพืช/ชื่อเรียกอื่นในวงเล็บ
MATERIA_MEDICA = (233, 313)  # เภสัชวัตถุ (หัวข้อสมุนไพรเรียงตามอักษร); หน้าอื่นไม่มีหัวข้อสมุนไพรแบบนี้
PAGE_A = re.compile(r"^(\d{1,3}) กรมการแพทย์แผนไทยและการแพทย์ทางเลือก\s*$")
PAGE_B = re.compile(r"^ตำราอ้างอิงด้านการแพทย์แผนไทย ชุดความรู้ที่ \d.*?(\d{1,3})\s*$")


def clean(t: str) -> str:
    t = t.replace("�", "").replace("ํา", "ำ")
    t = re.sub("([" + MARKS + "])\\1+", r"\1", t)
    return t


def tidy(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip()
    line = re.sub(r"(?:(?<=\s)|^)[" + MARKS + r"]+(?=\s|$)", "", line)  # สระ/วรรณยุกต์ลอย ๆ ที่เป็นสัญญาณรบกวน
    return re.sub(r"\s+", " ", line).strip()


def build(txt: Path):
    herbs = json.loads((ROOT / "data" / "herbs.json").read_text(encoding="utf-8"))["herbs"]
    names = {h["name_th"]: h["id"] for h in herbs}
    lines = clean(txt.read_text(encoding="utf-8")).split("\n")
    page, heading, rows, prev = None, None, [], ""
    for raw in lines:
        m = PAGE_A.match(raw) or PAGE_B.match(raw)
        if m:
            page = int(m.group(1))
            continue
        if not page or not (PAGE_FROM <= page <= PAGE_TO):
            continue
        if raw and not raw[0].isspace() and MATERIA_MEDICA[0] <= page <= MATERIA_MEDICA[1] and HEADING.search(raw):
            heading = tidy(raw)  # บรรทัดไม่เยื้องที่มีคำบอกลักษณะพืช = หัวข้อสมุนไพร
        if re.match(r"^\d{1,3}\. ?ยา\S+", raw) and page > MATERIA_MEDICA[1]:
            heading = tidy(raw)  # ตำรับยาที่มีเลขลำดับ (หน้าตำรับ)
        s = tidy(raw)
        if s and WARN.search(s) and not NOT_WARN.search(s):
            in_mm = MATERIA_MEDICA[0] <= page <= MATERIA_MEDICA[1]
            first = (heading or "").split(" ")[0] if in_mm else ""
            if s.count(")") > s.count("(") and prev:
                s = prev + " " + s  # วงเล็บปิดที่ไม่มีวงเล็บเปิด = ส่วนต่อของบรรทัดก่อนหน้า
            rows.append({
                "id": f"tbs_{len(rows) + 1:03d}",
                "heading_th": (heading or "")[:90] or None,
                "context_before_th": (prev[:250] or None) if prev != s[:len(prev)] else None,
                "herb_id": names.get(first),
                "statement_th": s[:250],
                "source_page": page,
                "evidence_tier": "A",
                "text_quality_note": "ข้อความจากไฟล์ที่ดึงจาก PDF มีอักขระเพี้ยน ต้องตรวจกับ PDF ต้นฉบับก่อนใช้",
                "verified": False,
                "verified_by": None,
            })
        if s:
            prev = s
    return {
        "note": "ข้อความเตือนความเป็นพิษ/ข้อห้ามใช้ที่ตำราอ้างอิงด้านการแพทย์แผนไทย ชุดความรู้ที่ 3 (เภสัชกรรมไทย) ระบุข้างสมุนไพร ไม่ใช่ตารางสรรพคุณทั้งเล่ม ยังไม่มีมนุษย์ตรวจ (verified:false) engine ไม่อ่านไฟล์นี้ heading_th คือบรรทัดหัวข้อที่อยู่ก่อนข้อความ (ชื่อสมุนไพรตามต้นฉบับ ตรวจกับ PDF) herb_id จับคู่เฉพาะเมื่อคำแรกของหัวข้อตรงกับ name_th ใน data/herbs.json ทุกตัว ข้อความเตือนไม่ได้ครอบคลุมทุกสมุนไพรที่มีพิษ ห้ามตีความว่าสมุนไพรที่ไม่อยู่ในไฟล์นี้ไม่มีข้อห้าม",
        "engine_use": False,
        "source": {
            "doc": "ตำราอ้างอิงด้านการแพทย์แผนไทย ชุดความรู้ที่ 3 องค์ความรู้เกี่ยวกับยา (เภสัชกรรมไทย)",
            "publisher": "สถาบันการแพทย์แผนไทย กรมการแพทย์แผนไทยและการแพทย์ทางเลือก กระทรวงสาธารณสุข",
            "year_be": 2568,
            "page_basis": "เลขหน้าพิมพ์ตามหัวกระดาษของเล่ม (เลขต่อเนื่องทั้งชุด) ไฟล์ที่ได้รับเป็นข้อความ ไม่มีเลขหน้า PDF",
        },
        "notes": rows,
    }


if __name__ == "__main__":
    out = build(Path(sys.argv[1]))
    dest = ROOT / "data" / "textbook_safety_notes.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"เขียน {dest} ({len(out['notes'])} รายการ)")
