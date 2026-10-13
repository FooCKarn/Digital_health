"""สกัด data/primary_care_guidelines.json จากข้อความของ "แนวทางการรักษาอาการเจ็บป่วยด้วยยาสมุนไพรในระบบบริการปฐมภูมิ ฉบับ พ.ศ. 2568"
ใช้: python scripts/extract_primary_care.py <ไฟล์ .txt ที่ดึงจาก PDF>      (ไม่แก้ข้อความ ไม่เติมข้อมูล: ช่องที่เอกสารเป็น "-" = รายการว่าง)
เลขหน้า = เลขหน้าพิมพ์ที่ขึ้นต้นหน้า (บรรทัดเลขใต้หัวกระดาษ) ไฟล์ txt ไม่มีเลขหน้า PDF จึงไม่ใส่ pdf_page
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADER = "แนวทางการรักษาอาการเจ็บป่วยด้วยยาสมุนไพร ในระบบ"
LABELS = ("เงื่อนไขการใช้ยา", "รูปแบบ", "ข้อบ่งใช้", "วิธีใช้", "ข้อห้ามใช้", "ข้อควรระวัง", "อันตรกิริยา", "อาการไม่พึงประสงค์")
# กลุ่มอาการตามสารบัญ (หน้าพิมพ์ที่เริ่ม)
TOC = [(5, "nasal", "คัดจมูก/มีน้ำมูก"), (12, "cough", "ไอ"), (18, "fever", "ไข้ตัวร้อน"), (31, "dizziness", "ลมวิงเวียน"),
       (40, "dyspepsia", "ท้องอืด ท้องเฟ้อ"), (54, "diarrhea", "ท้องเสีย"), (61, "constipation", "ท้องผูก"),
       (68, "hemorrhoid", "ริดสีดวงทวารหนัก"), (74, "aches", "ปวดเมื่อย"), (90, "skin", "ทางผิวหนัง")]
LATE_HEADINGS = (("ระยะกลาง", "intermediate", "ผู้ป่วยระยะกลาง และโรคหลอดเลือดสมอง"), ("ชาจากอัมพฤกษ์", "paralysis_numbness", "ชาจากอัมพฤกษ์ อัมพาต"),
                 )
APPENDIX_FROM = 110  # หน้าพิมพ์แรกของภาคผนวกยากัญชา
# บรรทัดที่บอกว่าจบรายการยา (หัวข้อหน้าแผนภาพ/คำอธิบาย/ภาคผนวก) กันเนื้อหาหน้าถัดไปไหลเข้าช่องสุดท้าย
END_PREFIXES = ("แนวทางการรักษา", "รายการยาสมุนไพร", "ภาคผนวก", "เอกสารอ้างอิง", "บรรณานุกรม", "กลุ่มผู้ป่วย", "คำอธิบาย", "เกณฑ์การ", "ข้อสังเกต", "ข้อแนะนำ", "“")
PRODUCT = re.compile(r"^(\d{1,2})\. (ยา\S.*)$")


def clean(t: str) -> str:
    return t.replace("�", "").replace("ํา", "ำ")  # �: อักขระเสียที่ตัวดึง PDF แทรก, นิคหิต+สระอา -> สระอำ


def preprocess(text: str):
    """คืนรายการ (หน้า, บรรทัด) ที่ตัดหัวกระดาษ/เลขหน้า/บรรทัดว่างคั่นหน้าออกแล้ว"""
    raw = [clean(x).rstrip() for x in text.split("\n")]
    out, page, i = [], None, 0
    while i < len(raw):
        if raw[i].startswith(HEADER) and i + 1 < len(raw) and re.fullmatch(r"\d{1,3}", raw[i + 1].strip()):
            page = int(raw[i + 1].strip())
            if out and out[-1][1] == "":
                out.pop()  # บรรทัดว่างก่อนหัวกระดาษ
            i += 2
            continue
        out.append((page, raw[i].strip()))
        i += 1
    return out


def group_for(page):
    cur = None
    for start, gid, name in TOC:
        if page is not None and page >= start:
            cur = (gid, name)
    return cur or (None, None)


def split_bullets(s: str):
    s = s.strip()
    if s in ("", "-"):
        return []
    parts = re.split(r"(?:^|\s)- (?=\S)", s)
    items = [re.sub(r"\s+", " ", p).strip() for p in parts if p.strip()]
    return items


def parse(text: str, herb_names: dict):
    lines = preprocess(text)
    # หาจุดเริ่มรายการยา: "N. ยา..." ที่ภายใน 6 บรรทัดถัดไปมี ข้อบ่งใช้/เงื่อนไขการใช้ยา
    starts = []
    for i, (pg, l) in enumerate(lines):
        m = PRODUCT.match(l)
        # บรรทัดถัดไปต้องขึ้นต้นด้วยช่องแรกของรายการ (กันรายการย่อยในช่องข้อบ่งใช้ที่ขึ้นต้น "5. ยา...")
        # ภาคผนวกยากัญชา (หน้า >= APPENDIX_FROM) ไม่นำเข้า: โครงสร้างต่างจากส่วนอื่น (มีหัวข้อย่อย "คำเตือน"/หลายความแรง) ต้องให้คนจัดโครงสร้างเอง
        if m and pg is not None and pg < APPENDIX_FROM and i + 1 < len(lines) and lines[i + 1][1].startswith(("ข้อบ่งใช้", "เงื่อนไขการใช้ยา", "รูปแบบ")):
            starts.append(i)
    rows, override = [], None
    heading_at = {}
    for i, (pg, l) in enumerate(lines):
        if l.startswith("รายการยาสมุนไพร") or l.startswith("“กลุ่มผู้ป่วย"):
            ctx = l + " " + (lines[i + 1][1] if i + 1 < len(lines) else "")
            for key, gid, name in LATE_HEADINGS:
                if key in ctx and pg is not None and pg >= 96:
                    heading_at[i] = (gid, name)
        if l.startswith("ภาคผนวก") and pg is not None and pg >= 100:
            heading_at[i] = None
    for n, s in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        # หัวข้อกลุ่มล่าสุดก่อนจุดเริ่ม (เฉพาะหน้าท้ายเล่ม)
        for k in sorted(heading_at):
            if k <= s:
                override = heading_at[k]
        block = lines[s:end]
        name = re.sub(r"\s+", " ", PRODUCT.match(block[0][1]).group(2)).strip()
        fields, cur, stop, last_pg = {}, None, False, block[0][0]  # ชื่อช่อง -> รายการข้อความ (ช่องเดียวกันซ้ำหลายครั้งในรายการที่มีหลายรูปแบบ เก็บทุกครั้ง)
        for pg, l in block[1:]:
            if stop:
                break
            if l.startswith(END_PREFIXES):
                break
            if l and pg is not None:
                last_pg = pg
            hit = next((lb for lb in LABELS if l.startswith(lb)), None)
            if hit:
                cur = hit
                fields.setdefault(cur, []).append(l[len(hit):].strip())
                continue
            if l == "":
                if cur == "อาการไม่พึงประสงค์":
                    stop = True  # จบรายการ
                continue
            if cur:
                fields[cur][-1] = (fields[cur][-1] + " " + l).strip()

        def text(k):
            v = [re.sub(r"\s+", " ", x).strip() for x in fields.get(k, []) if x.strip() not in ("", "-")]
            return " | ".join(v) or None

        def items(k):  # None = เอกสารไม่มีช่องนี้ในรายการ, [] = เอกสารเขียน "-"
            if k not in fields:
                return None
            return [i for x in fields[k] for i in split_bullets(x)]

        gid, gname = override if override else group_for(block[0][0])
        end_page = last_pg
        base = name[2:].strip() if name.startswith("ยา") else name
        base = re.sub(r"\s*\(.*\)$", "", base)
        rows.append({
            "id": f"pcg_{len(rows) + 1:03d}",
            "name_th": name,
            "group_id": gid,
            "group_th": gname,
            "herb_id": herb_names.get(base),
            "source_page": block[0][0],
            "source_page_end": end_page,
            "forms_th": text("รูปแบบ"),
            "prescriber_condition_th": text("เงื่อนไขการใช้ยา"),
            "indications_th": text("ข้อบ่งใช้"),
            "dosage_th": text("วิธีใช้"),
            "contraindications_th": items("ข้อห้ามใช้"),
            "cautions_th": items("ข้อควรระวัง"),
            "interactions_th": items("อันตรกิริยา"),
            "adverse_effects_th": items("อาการไม่พึงประสงค์"),
            "evidence_tier": "A",
            "verified": False,
            "verified_by": None,
        })
    return rows


def build(txt: Path):
    herbs = json.loads((ROOT / "data" / "herbs.json").read_text(encoding="utf-8"))["herbs"]
    names = {h["name_th"]: h["id"] for h in herbs}
    rows = parse(txt.read_text(encoding="utf-8"), names)
    return {
        "note": "รายการยาสมุนไพรในส่วนแนวทาง (หน้าพิมพ์ 9-107; ไม่รวมภาคผนวกยาที่มีส่วนประกอบของกัญชา หน้า 110 เป็นต้นไป ซึ่งโครงสร้างต่างจากส่วนอื่นและต้องให้คนจัดโครงสร้างเอง)ในแนวทางการรักษาอาการเจ็บป่วยด้วยยาสมุนไพรในระบบบริการปฐมภูมิ ฉบับ พ.ศ. 2568 ข้อความข้อห้าม/ข้อควรระวัง/อาการไม่พึงประสงค์คัดตามต้นฉบับ (รายการว่าง [] = เอกสารเขียน \"-\" ส่วน null = รายการนั้นไม่มีช่องนี้ในเอกสาร ทั้งสองอย่างไม่ได้แปลว่าไม่มีข้อห้าม) ยังไม่มีมนุษย์ตรวจกับต้นฉบับ (verified:false) engine ไม่อ่านไฟล์นี้ เป็นข้อมูลของ \"ผลิตภัณฑ์/ตำรับยา\" ไม่ใช่ของสมุนไพรเดี่ยว ห้ามขยายเป็นข้อห้ามของสมุนไพรเดี่ยวโดยไม่ผ่านผู้เชี่ยวชาญ herb_id จับคู่เฉพาะเมื่อชื่อหลังคำว่า \"ยา\" ตรงกับ name_th ใน data/herbs.json ทุกตัว",
        "engine_use": False,
        "source": {
            "doc": "แนวทางการรักษาอาการเจ็บป่วยด้วยยาสมุนไพรในระบบบริการปฐมภูมิ ฉบับ พ.ศ. 2568",
            "publisher": "สถาบันการแพทย์แผนไทย กรมการแพทย์แผนไทยและการแพทย์ทางเลือก กระทรวงสาธารณสุข",
            "year_be": 2568,
            "page_basis": "เลขหน้าพิมพ์ (บรรทัดเลขใต้หัวกระดาษ) ไฟล์ที่ได้รับเป็นข้อความ ไม่มีเลขหน้า PDF จึงไม่ใส่ pdf_page",
        },
        "products": rows,
    }


if __name__ == "__main__":
    out = build(Path(sys.argv[1]))
    dest = ROOT / "data" / "primary_care_guidelines.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"เขียน {dest} ({len(out['products'])} รายการ)")
