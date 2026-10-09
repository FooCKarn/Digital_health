# docs/data-schema.md: โครงสร้างข้อมูล

หลักการ: ทุกแถวที่เกี่ยวกับความปลอดภัยต้องมี `source_page`, `verified`, `verified_by` ข้อมูลที่ทีมตีความเองต้องติดป้ายและระบุเหตุผล

## 1. herbs.json (สมุนไพร 1 รายการ)

```json
{
  "id": "khing",
  "names": ["ขิง", "ขิงแกลง", "ขิงแดง", "ขิงเผือก", "สะเอ"],
  "scientific": "Zingiber officinale Roscoe",
  "parts": [
    {
      "part": "เหง้า",
      "taste_raw": "หวานเผ็ดร้อน",
      "uses": [
        {"symptom_id": "nausea_motion", "text": "แก้คลื่นไส้อาเจียนจากการเมารถ เมาเรือ",
         "dose": {"amount": "1-2", "unit": "g", "form": "ผงขิงแห้ง", "timing": "ก่อนเดินทาง 30-60 นาที"},
         "source_page": 79},
        {"symptom_id": "dyspepsia", "text": "แก้ท้องอืดท้องเฟ้อ แน่นจุกเสียด", "source_page": 79}
      ]
    }
  ],
  "contraindications": [
    {"condition": "pregnancy", "context": "บรรเทาคลื่นไส้อาเจียน", "level": "avoid",
     "text": "ไม่แนะนำให้ใช้", "source_page": 80, "verified": false}
  ],
  "age_limits": [
    {"min_age_years": 6, "level": "avoid", "text": "ไม่ควรใช้ในเด็กอายุต่ำกว่า 6 ขวบ",
     "source_page": 80, "verified": false}
  ],
  "drug_cautions": [
    {"drug_class": "anticoagulant", "level": "avoid", "mechanism_tag": "bleeding_risk",
     "evidence_tier": "A", "text": "ผู้ป่วยที่ได้รับยาต้านการแข็งตัวของเลือดไม่ควรรับประทาน",
     "source_page": 80, "verified": false}
  ],
  "condition_cautions": [
    {"condition": "gallstones", "level": "caution", "text": "ควรปรึกษาแพทย์ก่อนใช้",
     "source_page": 80, "verified": false}
  ],
  "duration_limits": [],
  "mechanism_tags": ["bleeding_risk"],
  "source": {"doc": "TTM first 2568", "pages": [79, 80]},
  "verified": false,
  "verified_by": null
}
```

**หมายเหตุ**
- `level`: `avoid` (ห้าม/ไม่ควร) | `caution` (ระวัง/ปรึกษาแพทย์) | `info`
- ต้องเก็บ `text` เป็นการสรุปความที่ใกล้ต้นฉบับ เพื่อให้ตรวจเทียบได้ ห้ามเปลี่ยนความหมายเป็นเงื่อนไขที่แรงกว่าหรืออ่อนกว่าต้นฉบับ
- `mechanism_tags` ของสมุนไพรได้จากคำเตือนที่ระบุในเล่มเท่านั้น (ชั้น A) การอนุมานเพิ่มเติม (ชั้น C) เก็บแยกใน `effect_groups.json`
- ส่วนที่ใช้ (`part`) ต้องแยก เพราะรสและคำเตือนอาจต่างกันตามส่วนของพืช
- `symptom_id` สำหรับ Safe-swap ใช้ชุดรหัสกลางใน `data/symptoms.json` (สร้างจากหัวข้อ "วิธีใช้" ของเล่ม; ยังไม่ได้ตรวจครบ)

## 2. drug_class_map.json (ชื่อยา → กลุ่มยา) **[ต้องให้เภสัชกรตรวจ]**

```json
{
  "entries": [
    {"names": ["warfarin", "วาร์ฟาริน", "คูมาดิน"], "class": "anticoagulant", "verified": false},
    {"names": ["aspirin", "แอสไพริน"], "class": ["antiplatelet", "nsaid"], "verified": false},
    {"names": ["ibuprofen", "ไอบูโพรเฟน"], "class": "nsaid", "verified": false},
    {"names": ["metformin", "เมทฟอร์มิน"], "class": "antidiabetic", "verified": false}
  ],
  "unknown_policy": "ถ้าไม่พบชื่อ ให้ตอบ 'ไม่มีข้อมูลยานี้' ห้ามเดา และแนะนำปรึกษาเภสัชกร"
}
```

กลุ่มยาตั้งต้น (จำกัดตามที่เล่มกล่าวถึง): `anticoagulant`, `antiplatelet`, `nsaid`, `antidiabetic`, `liver_affecting` (ยาที่มีผลต่อตับ) กลุ่มอื่นเพิ่มได้เมื่อมีแหล่งรองรับ

## 3. mechanism_tags.json (แนวคิดความเสี่ยงกลาง; ทีมกำหนด **[ต้องตรวจ]**)

ชุดตั้งต้นที่เสนอ (ปรับตามที่พบจริงในเล่ม):
`bleeding_risk`, `hypoglycemia`, `hepatotoxicity`, `laxative_effect`, `pregnancy_risk`, `gi_irritation`, `allergy`

```json
{
  "tag": "bleeding_risk",
  "label_th": "เสี่ยงเลือดออก",
  "aggregation": "count_sources",
  "note": "ทีมตั้งเอง ไม่ใช่มาตรฐาน: รวมจำนวนแหล่งที่ทำให้เกิดแนวคิดนี้ (สมุนไพร + ยา)"
}
```

## 4. effect_groups.json (ชั้น C: การอนุมานของทีม)

```json
{
  "group": "hypoglycemic_herbs",
  "members": ["rangchuet", "mawaeng_khruea"],
  "interacts_with_drug_class": ["antidiabetic"],
  "mechanism_tag": "hypoglycemia",
  "evidence_tier": "C",
  "basis": "เล่มระบุว่ามีฤทธิ์ลดระดับน้ำตาลในเลือด (หน้า 172, 183)",
  "note": "การจัดกลุ่มเป็นการตีความของทีม ต้องให้ผู้เชี่ยวชาญตรวจ",
  "verified": false
}
```

กฎ: สมาชิกกลุ่มต้องมีข้อความในเล่มรองรับ (`basis`) ห้ามเพิ่มสมาชิกจากความรู้ภายนอกในชั้น C

## 5. config.json (พารามิเตอร์ที่ทีมตั้งเอง)

```json
{
  "severity_order": ["avoid", "caution", "info"],
  "aggregate_threshold": {"value": 2, "note": "ทีมตั้งเอง: จำนวนแหล่งขั้นต่ำที่รวมเป็นธงภาระความเสี่ยงรวม"},
  "disclaimer_th": "เครื่องมือนี้ช่วยสนับสนุนการตัดสินใจ ไม่ใช่การวินิจฉัยหรือสั่งยา ไม่พบธงเตือนไม่ได้หมายความว่าปลอดภัย"
}
```

## 6. ผลตรวจ (output ของ /check)

```json
{
  "input_echo": {"herbs": [{"id": "khing", "part": "เหง้า"}], "drugs": ["warfarin"], "profile": {"age": 60, "pregnant": false, "conditions": []}},
  "flags": [
    {
      "flag_id": "f1",
      "rule_id": "R2",
      "severity": "avoid",
      "evidence_tier": "A",
      "mechanism_tag": "bleeding_risk",
      "herb_id": "khing",
      "drug_class": "anticoagulant",
      "message_th": "เล่มแนวทางฯ ระบุว่าผู้ที่ได้รับยาต้านการแข็งตัวของเลือดไม่ควรรับประทานขิง",
      "source_page": 80,
      "pdf_page": 88,
      "evidence_quote": "ผู้ป่วยที่ได้รับยาต้านการแข็งตัวของเลือด ไม่ควรรับประทาน",
      "verified": false
    }
  ],
  "aggregates": [],
  "swaps": [],
  "coverage": {"herbs_in_db": 50, "drug_classes_in_db": 5, "unknown_inputs": []},
  "pharmacist_questions": ["ขนาดและความถี่ที่ใช้", "ระยะเวลาที่ใช้", "มีการตรวจติดตามผลเลือดหรือไม่"],
  "disclaimer_th": "..."
}
```

`unknown_inputs` ต้องแสดงใน UI เสมอ ห้ามละเว้น

`evidence_quote` คือวลีสั้นจากหนังสือไว้ให้ผู้ใช้/ผู้ตรวจเทียบ (UI แสดงใต้ปุ่ม "ดูหลักฐานในหนังสือ") ต้องไม่ยาวเกิน 250 ตัวอักษร (กฎข้อ 9; มีเทสต์ล็อก) `pdf_page` = `source_page` + 8 (หน้าพิมพ์กับหน้าไฟล์ PDF ต่างกัน 8 ตลอดส่วนรายการสมุนไพร)

## 7. ข้อมูลทดลอง/feedback (log)

ฟิลด์ขั้นต่ำ: `session_id` (สุ่ม ไม่ผูกตัวตน), `case_id`, `flag_id`, `reviewer_role`, `agree` (true/false/unsure), `comment`, `time_spent_sec` ใช้เคสสมมติเท่านั้น

## 8. formula_guidelines.json (ตำรับยาบำรุงโลหิต engine ใช้เฉพาะข้อห้าม/ข้อควรระวัง)

มาจาก "แนวทางการตั้งตำรับยาตามองค์ความรู้การแพทย์แผนไทย: ยาบำรุงโลหิต" (สถาบันการแพทย์แผนไทย; หน้า PDF = หน้าพิมพ์ + 1) `engine/formulas.py` แปลง `contraindications` และ `condition_cautions` เป็นรูปแบบเดียวกับแถวสมุนไพร แล้ว R1 เดิมตัดสิน (ดู rules-spec "R1 ของตำรับ") ส่วนอื่นเป็นข้อมูลอ้างอิงที่ engine ไม่ใช้ เทสต์ `test_reference_data.py` ตรวจว่ามีเพียง `service.py` ที่โหลดไฟล์นี้

- `source_label_th` / `source_doc_th`: ชื่อสั้นและชื่อเต็มของเอกสาร ใช้ในข้อความธงและการ์ดหลักฐาน
- `scope_note_th`: คำอธิบายขอบเขตที่แสดงในแผงเพิ่มรายการ
- `essential_groups` / `supplementary_groups`: กลุ่มตัวยาและรายชื่อตัวยาตามที่เอกสารจัดไว้ (ชื่อเขียนตามต้นฉบับ)
- `ratio_limits`: ขีดจำกัดร้อยละโดยน้ำหนักต่อกลุ่ม แยก 3 กรณี (ทั่วไป/หลังคลอด/อ่อนเพลีย) เป็นเพดานสูงสุดต่อกลุ่ม
- `contraindications` / `condition_cautions`: ข้อห้ามและข้อควรระวัง **ของตำรับ** (`applies_to` ระบุว่าไม่ใช่สมุนไพรเดี่ยว) มี `evidence_quote`, `source_page`, `pdf_page`, `evidence_tier`, `verified:false`
- `worked_examples`: เก็บเฉพาะชื่อตัวอย่างและร้อยละที่เอกสารคำนวณไว้ ไม่ลอกสูตรเต็ม
- `source_discrepancies`: ความไม่สอดคล้องในต้นฉบับเอง (ตัวอย่างเกินเพดานเล็กน้อย) บันทึกไว้ ไม่แก้ตัวเลข
- รหัส `condition` ที่ใช้: `pregnancy` (ช่องติ๊กใน profile), `fever`, `allergy_to_ingredient`, `pollen_allergy` (สามตัวหลังเพิ่มใน `data/conditions.json` 2026-10-09)

## 9. herb_priority.json (ข้อมูลจัดลำดับการขยายฐานข้อมูล engine ไม่อ่าน)

มาจาก "รายงานการสาธารณสุขไทย ด้านการแพทย์แผนไทยฯ พ.ศ. 2564-2567" (หน้า PDF = หน้าพิมพ์ + 8) เป็นสถิติการจ่ายยาและรายชื่อสมุนไพรเศรษฐกิจ ไม่ใช่ข้อมูลข้อห้ามหรือคำเตือน

- `dispensing_top5_opd.rows`: 5 อันดับยาสมุนไพรที่จ่ายมากสุดต่อปี (ผู้ป่วยนอก สถานพยาบาลรัฐ) `kind` แยก `single_herb_product` กับ `formula_product`
- `herbal_champions.rows`: ชื่อสมุนไพรเศรษฐกิจ 15 รายการ (`controlled_herb` = สมุนไพรควบคุม)
- `herb_id`: จับคู่เฉพาะเมื่อชื่อไทยตรงกับ `name_th` ใน herbs.json ทุกตัวอักษร ไม่เทียบเคียงชนิดใกล้เคียง; ตำรับ/ยาสำเร็จรูปเป็น `null` เสมอ

## 10. ttm_code24.json (โครงสร้างรหัสยาแผนไทย 24 หลัก; ใช้กับ engine/code24.py)

มาจาก "คู่มือรหัสยาแผนไทย 24 หลัก" (ฉบับปรับปรุง มีนาคม 2568; หน้า PDF = หน้าพิมพ์ + 7) `fields` ระบุตำแหน่งหลักและความหมาย, `dosage_forms` รหัสรูปแบบยา 35 รูปแบบ, `worked_example` ตัวอย่างจริงในคู่มือ (ใช้เป็นเทสต์) ตัวถอดรหัส `decode(code, doc)` เป็นฟังก์ชันล้วน รหัสผิดรูปแบบคืน `valid:false` พร้อมเหตุผล ไม่เดา ไม่มีตารางรหัสตัวยาสำคัญ (คู่มือเก็บไว้ในไฟล์ภายนอก) จึงไม่แปลรหัสตัวยาเป็นชื่อ ยังไม่ต่อกับหน้าเว็บ (ฟีเจอร์ฉลาก/เลข อย. อยู่ในหมวด "ทำถ้ามีเวลา")

## 11. herbal_substitution_groups.json และ context_stats.json (ข้อมูลบริบท engine ไม่อ่าน)

มาจาก "Health at a Glance 2026: Thai Traditional Medicine" (กรมการแพทย์แผนไทยฯ มิถุนายน 2569; หน้า PDF = หน้าพิมพ์ + 3)
- `herbal_substitution_groups.json`: 10 กลุ่มอาการที่มีการสั่งยาสมุนไพรทดแทนยาแผนปัจจุบัน (ตัวชี้วัดกระทรวงสาธารณสุข ปีงบประมาณ 2568) รายการเป็นระดับผลิตภัณฑ์ `herb_id` จับคู่เมื่อตัดคำนำหน้า "ยา" และส่วนหลัง "/" แล้วตรงกับ `name_th` ทุกตัวอักษรเท่านั้น ห้ามนำไปเสนอให้ผู้ใช้โดยตรง (R6 ต้องใช้ข้อมูลอาการต่อสมุนไพรที่ตรวจแล้ว) ชื่อกลุ่มอ่านจากภาพ
- `context_stats.json`: จำนวนรายงานอาการไม่พึงประสงค์จากยาสมุนไพร 2564-2568 และร้อยละการสั่งจ่ายยาสมุนไพร 2565-2568 เป็นบริบทเท่านั้น (จำนวนรายงานไม่ใช่อัตราการเกิดเหตุ)
