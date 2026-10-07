"""สร้าง fixture JSON ของเทสต์หน้าเว็บจาก engine จริง (ห้ามเขียนผลตรวจด้วยมือ)

รัน (จาก root ของ repo):  PYTHONUTF8=1 python web/scripts/gen_fixtures.py
ผล: web/src/test/fixtures/*.json  แต่ละไฟล์ = {"payload": ..., "response": engine.service.run(payload)}
payload ตรงกับที่ buildPayload ของหน้าเว็บส่ง (รายการเริ่มวันนี้ = days_in_use 1) เทสต์จึงตรวจได้ว่าหน้าเว็บส่งค่าเดียวกัน
ข้อมูลผู้ใช้เป็นข้อมูลสมมติทั้งหมด
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import service  # noqa: E402

OUT = ROOT / "web" / "src" / "test" / "fixtures"


def herbs(*ids):
    return [{"id": i, "days_in_use": 1} for i in ids]


CASES = {
    # สถานการณ์เดิม 3/4/11/13: ขิง + กระเทียม + warfarin อายุ 60 (ไม่ได้ตอบตั้งครรภ์)
    "khing_garlic_warfarin_60": {"herbs": herbs("khing", "garlic"), "drugs": ["warfarin"], "profile": {"conditions": [], "age": 60}},
    # สถานการณ์เดิม 5/13: หยุดใช้ warfarin หลังได้ผล
    "khing_garlic_60": {"herbs": herbs("khing", "garlic"), "drugs": [], "profile": {"conditions": [], "age": 60}},
    # สถานการณ์เดิม 2/14: ขิงอย่างเดียว ไม่กรอกโปรไฟล์
    "khing_only": {"herbs": herbs("khing"), "drugs": [], "profile": {"conditions": []}},
    # ประกาศการเพิ่มจากข้อเสนอ AI (เพิ่ม warfarin ต่อจากขิง)
    "khing_warfarin": {"herbs": herbs("khing"), "drugs": ["warfarin"], "profile": {"conditions": []}},
    # สถานการณ์เดิม 6: กระชาย อายุ 30 ไม่พบธง
    "krachai_30": {"herbs": herbs("krachai"), "drugs": [], "profile": {"conditions": [], "age": 30}},
    # สถานการณ์เดิม 9: R3 ภาระความเสี่ยงรวม + โรค
    "r3_diabetes_58": {"herbs": herbs("rangchuet", "maweang_khruea"), "drugs": ["metformin"], "profile": {"conditions": ["diabetes"], "age": 58}},
    # สถานการณ์เดิม 10: ตั้งครรภ์ ใช่ / ไม่ใช่ / ไม่ระบุ
    "khing_30_preg_yes": {"herbs": herbs("khing"), "drugs": [], "profile": {"conditions": [], "age": 30, "pregnant": True}},
    "khing_30_preg_no": {"herbs": herbs("khing"), "drugs": [], "profile": {"conditions": [], "age": 30, "pregnant": False}},
    "khing_30_preg_unspecified": {"herbs": herbs("khing"), "drugs": [], "profile": {"conditions": [], "age": 30}},
    # ยาที่ระบบไม่รู้จัก (+ HTML ฝังในชื่อยา สถานการณ์เดิม 7)
    "khing_unknown_drug": {"herbs": herbs("khing"), "drugs": ['<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'], "profile": {"conditions": []}},
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "meta.json").write_text(json.dumps(service.meta(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for name, payload in CASES.items():
        doc = {"payload": payload, "response": service.run(payload)}
        (OUT / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(CASES) + 1} files to {OUT}")


if __name__ == "__main__":
    main()
