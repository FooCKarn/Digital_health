# ตาราง mapping: สถานการณ์เดิม (scripts/ui_dom_test.js) → เทสต์ใหม่

หนึ่งแถว = หนึ่ง `ok(...)` ในสถานการณ์ 0-23 ของ `scripts/ui_dom_test.js` (หน้าเก่า `public/index.html`) เรียงตามลำดับในสคริปต์
`parity.test.ts` อ่านไฟล์นี้: จำนวนแถวต่อสถานการณ์ต้องเท่ากับจำนวน `ok(` ในสคริปต์เดิม และทุกการอ้างอิง `` `ไฟล์::ชื่อ` `` ต้องมีอยู่จริง
(ชื่อ = ส่วนต้นของชื่อเทสต์ vitest หรือชื่อฟังก์ชัน pytest; path นับจาก root ของ repo)

สถานะ: **mapped** = มีเทสต์อยู่แล้ว · **GAP** = เขียนเทสต์ใหม่ในงาน 11 · **GAP+FIX** = เทสต์ใหม่ + แก้หน้าเว็บ (พฤติกรรมเดิมหายไปจริง) · **N/A** = ไม่ใช้กับหน้าใหม่ (เหตุผลในแถว)

ผลจริงจาก engine: เทสต์ใน `web/src/parity/legacy.test.tsx` ใช้ fixture ที่สร้างด้วย `web/scripts/gen_fixtures.py` (ดู `web/src/test/fixtures/README.md`)

| # | สถานการณ์เดิม | สถานะ | ครอบคลุมโดย |
|---|---|---|---|
| 0.1 | title มี HerbGuard TTM + lang=th | GAP | `web/src/seo.test.ts::lang=th, title, meta description` |
| 0.2 | meta description > 60 ตัวอักษร + robots noindex, nofollow | GAP | `web/src/seo.test.ts::lang=th, title, meta description` `web/src/seo.test.ts::meta description/theme-color/og/twitter` |
| 0.3 | h1 เดียว + header/main/footer | GAP+FIX | `web/src/parity/legacy.test.tsx::0.3 h1 เดียว` `web/src/App.test.tsx::แสดงหัวข้อ HerbGuard` (เดิมไม่มี header/footer: คืนข้อความหัว "ต้นแบบ ใช้ข้อมูลสมมติ" และ "เกี่ยวกับเครื่องมือนี้" จากหน้าเดิม) |
| 0.4 | JSON-LD อ่านได้ เป็น WebApplication | GAP+FIX | `web/src/seo.test.ts::JSON-LD อ่านได้` (คืน JSON-LD จากหน้าเดิมใน web/index.html) |
| 0.5 | ไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ | GAP | `web/src/parity/legacy.test.tsx::0.5 ผลจริงจาก engine` `web/src/source-scan.test.ts::ไม่มีคำว่า ปลอดภัย` `web/src/components/ThisPeriod.test.tsx::(ฌ) ไม่มีคำว่า ปลอดภัย` |
| 1.1 | dropdown ครบ (สมุนไพร ≥21 ยา ≥5 โรค ≥20) | GAP | `web/src/parity/legacy.test.tsx::1.1 รายการให้เลือกครบ` |
| 1.2 | ไม่มีช่องติ๊กรกหน้า | mapped | `web/src/components/MyData.test.tsx::ตั้งครรภ์เป็น select 3 ค่า ไม่มี checkbox` (ตั้งครรภ์/ให้นมเป็น select 3 ค่า; โรคในโปรไฟล์และข้อเสนอจาก AI ใช้ checkbox ตามดีไซน์ใหม่) |
| 1.3 | คีย์บอร์ด: กดลูกศรบน dropdown ยังไม่เพิ่ม | N/A | หน้าใหม่ไม่มี select ที่เพิ่มเมื่อเปลี่ยนค่า: แผ่นเพิ่มใช้ช่องค้นหา + ปุ่มเลือก (aria-pressed) และเพิ่มเมื่อกด เพิ่ม เท่านั้น |
| 1.4 | คีย์บอร์ด: ออกจากช่องโดยไม่ยืนยัน = ยกเลิก | N/A | เหตุผลเดียวกับ 1.3 (ไม่มีค่า dropdown ค้าง; ปิดแผ่นเพิ่มแล้วไม่มีอะไรถูกเพิ่ม) |
| 1.5 | คีย์บอร์ด: Enter = เพิ่ม | N/A | ฟอร์มแผ่นเพิ่มเป็น form ปกติ Enter = submit ของเบราว์เซอร์ ไม่มีตัวจัดการคีย์เอง |
| 1.6 | คีย์บอร์ด: กดปุ่ม เพิ่ม = เพิ่ม | mapped | `web/src/components/AddSheet.test.tsx::เพิ่มขิง เริ่ม 3 วันก่อน` |
| 1.7 | กดเพิ่มโดยไม่เลือก → ข้อความให้เลือกก่อน | GAP | `web/src/parity/legacy.test.tsx::1.7 กดเพิ่มโดยยังไม่เลือก` |
| 1.8 | คำอธิบายวิธีใช้คีย์บอร์ดผูกกับ dropdown ทั้ง 3 | N/A | ไม่มี dropdown ที่มีพฤติกรรมพิเศษ (ช่องค้นหา + ปุ่มมาตรฐาน) จึงไม่ต้องมีคำอธิบายวิธีใช้คีย์บอร์ด |
| 1.9 | เลือกแล้วขึ้นแถว: ชื่อ + ส่วนที่ใช้ + วัน + ลบ | mapped | `web/src/components/ThisPeriod.test.tsx::แถวแสดงชนิดและวันที่ N` `web/src/components/ThisPeriod.test.tsx::หยุดใช้: แถวหายจากรายการทันที` (ส่วนที่ใช้: ตัวติดตามไม่เก็บ part ตามสเปก §6) |
| 1.10 | ประกาศการเพิ่มในพื้นที่ประกาศ | GAP+FIX | `web/src/parity/legacy.test.tsx::1.10 เพิ่มแล้วประกาศ` (เดิมไม่ประกาศ: เพิ่มพื้นที่ประกาศ "เพิ่ม X แล้ว" แยกจากพื้นที่ประกาศผลตรวจ ทั้งเพิ่มเองและเพิ่มจากข้อเสนอ AI) |
| 1.11 | ตัวเลือกที่เลือกแล้วถูกปิด | mapped | `web/src/components/AddSheet.test.tsx::ซ้ำ -> ข้อความผิดพลาดจาก store` `web/src/model/tracker.test.ts::duplicate active kind+ref rejected` |
| 1.12 | ลบแล้วตัวเลือกกลับมา + ประกาศ + โฟกัสกลับ | GAP+FIX | `web/src/parity/legacy.test.tsx::1.12 หยุดใช้/ลบแถวแล้วโฟกัส` `web/src/model/tracker.test.ts::duplicate active kind+ref rejected; other kind ok; re-add right after stop ok` (เดิมโฟกัสหลุดไป body หลังกดหยุดใช้/ลบ) |
| 2.1 | ตรวจโดยไม่เลือกอะไร → ข้อความไทย ไม่ส่งคำขอ | GAP | `web/src/parity/legacy.test.tsx::2) ไม่มีรายการเลย` `web/src/components/ThisPeriod.test.tsx::มีแต่ยา: ยังไม่มีสมุนไพรให้ตรวจ` `web/src/hooks/useAnalysis.test.tsx::(ข) ไม่มีสมุนไพร` |
| 2.2 | โฟกัสที่ dropdown + aria-invalid | N/A | ไม่มีปุ่ม ตรวจ (ตรวจอัตโนมัติ) รายการว่างเป็นสถานะปกติ ไม่ใช่ข้อผิดพลาดของช่องกรอก จึงไม่มี aria-invalid |
| 2.3 | เลือกแล้วล้างข้อความ | GAP | `web/src/parity/legacy.test.tsx::2) ไม่มีรายการเลย` |
| 3.1 | เลือกสมุนไพร 2 ชนิด + ชิปยา + สรุปจำนวน | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` |
| 3.2 | หัวข้อผล พบคำเตือน + โฟกัสย้ายไปหัวข้อ | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` (หัวข้อ + ประกาศในพื้นที่ประกาศ; ไม่ย้ายโฟกัสเพราะตรวจอัตโนมัติทุกครั้งที่แก้ การย้ายโฟกัสจะดึงผู้ใช้ออกจากที่ที่กำลังทำ) |
| 3.3 | กล่องขอบเขต + ไม่ใช่การวินิจฉัย อยู่ก่อนรายการคำเตือน | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` `web/src/components/ThisPeriod.test.tsx::(ช) กลุ่ม avoid เปิด` |
| 3.4 | คำเตือนเป็น ul/li ≥3 ข้อ ทุกข้อมีไอคอน + คำ | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` `web/src/components/primitives.test.tsx::${kind}: ไอคอน svg aria-hidden` |
| 3.5 | แถวหลักฐาน: ชั้นหลักฐาน หน้า ร่าง กฎ | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` `web/src/components/ThisPeriod.test.tsx::(ญ) คำเตือน verified:false` |
| 3.6 | ปุ่ม ดูหลักฐานในหนังสือ (พับไว้) | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` (ข้อความปุ่มใหม่: ดูหลักฐาน) |
| 3.7 | วลีสั้น ≤250 + หน้าพิมพ์/หน้า PDF + ฉบับเต็มอยู่ในเล่ม | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` |
| 3.8 | ส่วน เพิ่มเติม พับไว้และใช้ h3 | GAP | `web/src/parity/legacy.test.tsx::4.5-4.6 + 3.8 ใบสรุปเภสัชกร` `web/src/components/MyData.test.tsx::อภิธานศัพท์ อธิบายชั้นหลักฐาน` |
| 3.9 | ไม่ได้ตอบตั้งครรภ์ → แจ้ง ไม่ได้ตรวจ | GAP | `web/src/parity/legacy.test.tsx::3.1-3.9 รายการ หัวข้อผล` `web/src/components/ThisPeriod.test.tsx::(จ) ไม่มีคำเตือน + ไม่ได้กรอกอายุ` |
| 4.1 | ชื่อ tablist/region ไม่ซ้ำ + แผงแท็บรับโฟกัส | mapped | `web/src/App.test.tsx::roving tabindex + ลูกศร/Home/End` `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 4.2 | ลูกศรขวา → แท็บถัดไป | mapped | `web/src/App.test.tsx::roving tabindex + ลูกศร/Home/End` |
| 4.3 | Home → แท็บแรก | mapped | `web/src/App.test.tsx::roving tabindex + ลูกศร/Home/End` |
| 4.4 | End → แท็บสุดท้าย | mapped | `web/src/App.test.tsx::roving tabindex + ลูกศร/Home/End` |
| 4.5 | ตารางใบสรุปมีคอลัมน์บังคับ + caption + h3 | GAP | `web/src/parity/legacy.test.tsx::4.5-4.6 + 3.8 ใบสรุปเภสัชกร` `web/src/components/MyData.test.tsx::ผลปัจจุบัน: ขอบเขต disclaimer ตารางคำเตือน` |
| 4.6 | ใบสรุปเป็นภาษาไทย + โปรไฟล์ (อายุ: 60 ปี) | GAP | `web/src/parity/legacy.test.tsx::4.5-4.6 + 3.8 ใบสรุปเภสัชกร` |
| 5.1 | ลบชิปยา → ซ่อนผลเก่า | GAP | `web/src/parity/legacy.test.tsx::5) หยุดใช้ยาหลังได้ผล` `web/src/components/ThisPeriod.test.tsx::เพิ่มยาระหว่างรอผลใหม่` (หน้าใหม่: ผลเก่าติดป้าย ผลก่อนแก้ไข แล้วตรวจใหม่อัตโนมัติ) |
| 5.2 | ประกาศว่าผลเดิมถูกซ่อน (ไม่เงียบ) | GAP | `web/src/parity/legacy.test.tsx::5) หยุดใช้ยาหลังได้ผล` (ผลใหม่ถูกประกาศ; ผลเก่าไม่ถูกประกาศเป็นผลปัจจุบัน) |
| 6.1 | ไม่พบคำเตือน: หัวข้อ ไม่พบคำเตือนในฐานข้อมูลนี้ ไม่มีรายการคำเตือน | GAP | `web/src/parity/legacy.test.tsx::6) กระชาย อายุ 30` |
| 6.2 | บรรทัด ไม่ได้แปลว่าใช้ได้ + ขอบเขต | GAP | `web/src/parity/legacy.test.tsx::6) กระชาย อายุ 30` `web/src/components/ThisPeriod.test.tsx::(จ) ไม่มีคำเตือน + ไม่ได้กรอกอายุ` |
| 6.3 | ไม่มีสไตล์ ผ่าน/เขียว และไม่เตือนเงื่อนไขที่ไม่มีกฎ | GAP | `web/src/parity/legacy.test.tsx::6) กระชาย อายุ 30` `web/src/styles/contrast.test.ts::โทเคน no_flag ไม่ใช่สีเขียว` |
| 7.1 | ข้อความฝัง HTML/สคริปต์แสดงเป็นข้อความธรรมดา | GAP | `web/src/parity/legacy.test.tsx::7) ชื่อยาที่พิมพ์เองฝัง HTML` `web/src/components/ThisPeriod.test.tsx::(ซ) ข้อความจากเซิร์ฟเวอร์ที่ฝัง HTML` `web/src/source-scan.test.ts::ไม่มี API ที่แปลงข้อความเป็น HTML` |
| 8.1 | ปุ่ม AI ระหว่างทำงานใช้ aria-disabled | mapped | `web/src/components/AddSheet.test.tsx::ปุ่มที่กำลังทำงานเป็น aria-disabled` |
| 8.2 | ไม่มี key → ใช้ AI ไม่ได้ กรอกเองได้ | mapped | `web/src/components/AddSheet.test.tsx::/api/parse 503 -> ข้อความไทยตายตัว` |
| 8.3 | ไม่ได้พิมพ์ → ข้อความ + โฟกัสกลับช่องข้อความ | GAP+FIX | `web/src/parity/legacy.test.tsx::8.3 แยกรายการด้วย AI โดยไม่พิมพ์` (เดิมไม่ย้ายโฟกัสกลับช่องข้อความ) |
| 8.4 | ปุ่มเรียบเรียงเป็น ตัวเลือก (รอง) | mapped | `web/src/components/AddSheet.test.tsx::ซ่อนเมื่อผลที่แสดงยังไม่ใช่ผลปัจจุบัน` `web/src/components/AddSheet.test.tsx::ข้อความจากเซิร์ฟเวอร์แสดงเป็นข้อความ + ป้ายที่มา` |
| 8.5 | ไม่มี key → ใช้ข้อความจากคำเตือน ติดป้ายที่มา | mapped | `web/src/components/AddSheet.test.tsx::ข้อความจากเซิร์ฟเวอร์แสดงเป็นข้อความ + ป้ายที่มา` `web/src/components/AddSheet.test.tsx::คำตอบ explain รูปผิด/source แปลก` `engine/tests/test_llm.py::test_explain_llm_unavailable_falls_back_not_error` (ข้อความ template ฝั่งเซิร์ฟเวอร์) |
| 9.1 | แสดง ภาระความเสี่ยงรวม | GAP | `web/src/parity/legacy.test.tsx::9) รางจืด + มะแว้งเครือ` `web/src/components/ThisPeriod.test.tsx::ต้องปรึกษาเภสัชกร + aggregate แสดง` |
| 9.2 | โรคที่เลือกถูกส่งและแสดงในใบสรุป | GAP | `web/src/parity/legacy.test.tsx::9) รางจืด + มะแว้งเครือ` |
| 10.1 | ตั้งครรภ์ ใช่/ไม่ใช่/ไม่ระบุ → คำเตือน / ไม่มีคำเตือน / ไม่ได้ตรวจ | GAP | `web/src/parity/legacy.test.tsx::10 ตั้งครรภ์=%s` `web/src/components/MyData.test.tsx::ตั้งครรภ์เป็น select 3 ค่า` |
| 11.1 | ทุกปุ่ม/ช่องกรอกมีชื่อ | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 11.2 | ชื่อที่โปรแกรมอ่านเสียงมีคำที่เห็นอยู่ด้วย | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` `web/src/chat/chat.test.tsx::19.2 ทุกปุ่ม/ช่องในแชตมีชื่อ` |
| 11.3 | ปุ่มลบทุกตัวชื่อไม่ซ้ำ ขึ้นต้นด้วย ลบ | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 11.4 | ไม่มี div ที่มี aria-label โดยไม่มี role | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 11.5 | ไม่มี id ซ้ำ | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 11.6 | aria-controls/labelledby/describedby ชี้ id ที่มีจริง | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 11.7 | ฟอร์มมีชื่อ | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` (ฟอร์มโปรไฟล์ aria-labelledby) |
| 11.8 | ช่องความเห็นใช้ลำดับ + ชื่อสมุนไพร ไม่ใช่รหัสภายใน | GAP | `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 12.1 | ระหว่างรอ ปุ่มตรวจเป็น aria-disabled | N/A | ไม่มีปุ่ม ตรวจ (ตรวจอัตโนมัติ) สถานะระหว่างรอแสดงเป็น กำลังตรวจ… : `web/src/components/ThisPeriod.test.tsx::แถวแสดงชนิดและวันที่ N; ระหว่างตรวจ` |
| 12.2 | กดซ้ำระหว่างรอ ไม่ส่งคำขอซ้อน | GAP | `web/src/parity/legacy.test.tsx::12) แก้รายการหลายครั้งภายในช่วงหน่วง` `web/src/hooks/useAnalysis.test.tsx::หน่วงเวลา 300 ms ก่อนเรียก` |
| 12.3 | ผลของข้อมูลเก่าที่มาถึงทีหลังถูกทิ้ง | mapped | `web/src/hooks/useAnalysis.test.tsx::(ก) เปลี่ยนรายการสองครั้ง` `web/src/hooks/useAnalysis.test.tsx::current: true เฉพาะเมื่อผลตรงกับข้อมูล` `web/src/components/ThisPeriod.test.tsx::เพิ่มยาระหว่างรอผลใหม่` |
| 13.1 | มีผลและใบสรุปจากการตรวจครั้งแรก | GAP | `web/src/parity/legacy.test.tsx::13) ตรวจล้มเหลวหลังแก้ข้อมูล` `web/src/components/MyData.test.tsx::ผลปัจจุบัน: ขอบเขต disclaimer ตารางคำเตือน` |
| 13.2 | ตรวจล้มเหลว → ล้างใบสรุปเก่า | GAP | `web/src/parity/legacy.test.tsx::13) ตรวจล้มเหลวหลังแก้ข้อมูล` `web/src/components/MyData.test.tsx::ผลไม่ใช่ปัจจุบัน` `web/src/components/ThisPeriod.test.tsx::แก้โปรไฟล์แล้วตรวจล้มเหลว` |
| 13.3 | ข้อผิดพลาดเป็น role=alert และโฟกัสที่ข้อความ | GAP | `web/src/parity/legacy.test.tsx::13) ตรวจล้มเหลวหลังแก้ข้อมูล` `web/src/components/ThisPeriod.test.tsx::ตรวจล้มเหลวหลังมีผล` (role=alert ถูกอ่านทันที; ไม่ย้ายโฟกัสเพราะการตรวจเกิดเองหลังแก้ข้อมูล) |
| 13.4 | ลูกศรไม่พาไปแท็บที่ซ่อนอยู่ | N/A | หน้าใหม่ไม่มีแท็บที่ซ่อน ทั้ง 3 แท็บใช้ได้ตลอด (`web/src/App.test.tsx::roving tabindex + ลูกศร/Home/End`) |
| 13.5 | ตรวจสำเร็จอีกครั้ง → ใบสรุปกลับมา | GAP | `web/src/parity/legacy.test.tsx::13) ตรวจล้มเหลวหลังแก้ข้อมูล` `web/src/components/ThisPeriod.test.tsx::ตรวจล้มเหลวหลังมีผล` |
| 14.1 | อายุ 200 → ข้อความผูกกับช่อง + โฟกัส + ไม่ส่งคำขอ | GAP+FIX | `web/src/parity/legacy.test.tsx::14) อายุ 200` `web/src/components/MyData.test.tsx::อายุผิด (ไม่ใช่จำนวนเต็ม/เกิน 120)` (เดิมไม่ย้ายโฟกัสไปช่องอายุ) |
| 14.2 | แก้ค่าแล้วล้างข้อผิดพลาด | GAP+FIX | `web/src/parity/legacy.test.tsx::14) อายุ 200` (เดิมข้อความค้างจนกดบันทึกอีกครั้ง) |
| 14.3 | เว้นว่าง = ไม่ระบุ (ใช้ได้) | mapped | `web/src/components/MyData.test.tsx::อายุผิด (ไม่ใช่จำนวนเต็ม/เกิน 120)` `web/src/parity/legacy.test.tsx::14) อายุ 200` |
| 15.1 | ปุ่มแชตมีชื่อ และแผงปิดอยู่ | mapped | `web/src/chat/chat.test.tsx::15.1 ปุ่มลอยมีชื่อ` |
| 15.2 | เปิดแล้วโฟกัสช่องพิมพ์ | mapped | `web/src/chat/chat.test.tsx::15.2 กดแล้วเปิด` |
| 15.3 | แผงเป็น dialog มีชื่อ บทสนทนาเป็น log | mapped | `web/src/chat/chat.test.tsx::15.3 แผงเป็น dialog` |
| 15.4 | แถบคงที่: ไม่ใช่การวินิจฉัย + 50 ชนิด | mapped | `web/src/chat/chat.test.tsx::15.4 แถบคงที่` |
| 15.5 | แถบคงที่: จำนวนกลุ่มยา | mapped | `web/src/chat/chat.test.tsx::15.4 แถบคงที่` |
| 15.6 | ชิปเริ่มต้นมาจาก /api/meta | mapped | `web/src/chat/chat.test.tsx::15.5 ชิปเริ่มต้นมาจาก meta` `web/src/chat/chat.test.tsx::15.5b meta ไม่มีคำถามแนะนำ` |
| 15.7 | Esc ปิดแผงและโฟกัสกลับปุ่มแชต | mapped | `web/src/chat/chat.test.tsx::15.6 Esc ปิดแผง` `web/src/chat/chat.test.tsx::15.7 ปุ่มปิดในแผง` |
| 16.1 | ฟองผู้ใช้ + ฟองผู้ช่วยพร้อมป้ายที่มา | mapped | `web/src/chat/chat.test.tsx::16.1 ฟองผู้ใช้` |
| 16.2 | ปุ่มดูหลักฐานในคำตอบ (พับไว้) พร้อมหน้า | mapped | `web/src/chat/chat.test.tsx::16.2 ดูหลักฐาน` |
| 16.3 | ประวัติใน sessionStorage ข้อความเท่านั้น | mapped | `web/src/chat/chat.test.tsx::16.3 ประวัติอยู่ใน sessionStorage` `web/src/source-scan.test.ts::ที่เก็บในเบราว์เซอร์ใช้แค่` |
| 16.4 | มีชิปคำถามแนะนำ | mapped | `web/src/chat/chat.test.tsx::16.5 ชิปเปลี่ยนตาม follow_ups` |
| 16.5 | กดชิปได้คำตอบจากผลตรวจปัจจุบัน | mapped | `web/src/chat/chat.test.tsx::16.5 ชิปเปลี่ยนตาม follow_ups` `web/src/chat/chat.test.tsx::16.4 ส่ง /api/ask ด้วย` |
| 16.6 | โหลดหน้าใหม่ในแท็บเดิม ประวัติกลับมา | mapped | `web/src/chat/chat.test.tsx::16.6 โหลดหน้าใหม่ในแท็บเดิม` |
| 16.7 | ล้างประวัติ: หน้าจอและ sessionStorage ว่าง | mapped | `web/src/chat/chat.test.tsx::16.7 ล้างประวัติ` |
| 17.1 | ฉุกเฉิน: role=alert ป้าย ข้อควรทราบเร่งด่วน (1669) | mapped | `web/src/chat/chat.test.tsx::17.1 ฉุกเฉิน` `engine/tests/test_rag_answer.py::test_emergency_is_fixed_message_without_retrieval_and_wins_over_other_intents` |
| 17.2 | ขอขนาดยา: ปฏิเสธ + ป้าย | mapped | `web/src/chat/chat.test.tsx::17.2 ปฏิเสธ` `engine/tests/test_rag_answer.py::test_dose_and_diagnosis_are_fixed_refusals` |
| 17.3 | ยังไม่ตรวจ: บอกให้ตรวจก่อน | mapped | `web/src/chat/chat.test.tsx::17.3 ยังไม่มีสมุนไพร` `engine/tests/test_rag_answer.py::test_safety_yesno_and_explain_without_any_check_ask_to_check_first` |
| 17.4 | ถามสมุนไพรที่ระบุชื่อได้แม้ยังไม่ตรวจ | mapped | `web/src/chat/chat.test.tsx::17.3 ยังไม่มีสมุนไพร` `engine/tests/test_rag_answer.py::test_lookup_answers_from_database_with_evidence_and_pages` |
| 17.5 | คำถามนอกฐาน: ไม่พบข้อมูล | N/A | เนื้อหาคำตอบของเซิร์ฟเวอร์ (หน้าเว็บแสดงตามที่ได้): `engine/tests/test_rag_answer.py::test_lookup_without_anchor_or_data_is_fixed_no_info_refusal` |
| 17.6 | ถาม ปลอดภัยไหม โดยยังไม่ตรวจ: ไม่ตอบใช่/ไม่ใช่ | N/A | เนื้อหาคำตอบของเซิร์ฟเวอร์: `engine/tests/test_rag_answer.py::test_safety_yesno_and_explain_without_any_check_ask_to_check_first` `engine/tests/test_rag_answer.py::test_safety_yesno_never_says_yes_and_lists_current_flags` |
| 17.7 | ข้อความของระบบไม่มีคำว่า ปลอดภัย | mapped | `web/src/chat/chat.test.tsx::17.4 ข้อความของระบบทั้งหน้า` |
| 18.1 | sessionStorage JSON พัง: แชตยังใช้ได้ | mapped | `web/src/chat/chat.test.tsx::18.1 sessionStorage เป็น JSON พัง` |
| 18.2 | setItem โยน error: แชตยังใช้ได้ | mapped | `web/src/chat/chat.test.tsx::18.2 setItem โยน error` `web/src/chat/chat.test.tsx::18.3 เข้าถึง sessionStorage ไม่ได้เลย` |
| 18.3 | การ์ดคำเตือนมีปุ่ม ถามเรื่องคำเตือนนี้ | mapped | `web/src/chat/chat.test.tsx::18.4 การ์ดคำเตือนมีปุ่ม ถามเรื่องคำเตือนนี้` |
| 18.4 | กดแล้วเปิดแชตและเติมคำถาม ไม่ส่งเอง | mapped | `web/src/chat/chat.test.tsx::18.4 การ์ดคำเตือนมีปุ่ม ถามเรื่องคำเตือนนี้` |
| 18.5 | แก้ข้อมูลหลังคุยแล้ว แชตแจ้งว่าคำตอบก่อนหน้าอาจไม่ตรง | mapped | `web/src/chat/chat.test.tsx::18.5 แก้ข้อมูลหลังคุยแล้ว` |
| 19.1 | API ล้ม: role=alert คำถามยังอยู่ | mapped | `web/src/chat/chat.test.tsx::19.1 เครือข่ายล่ม` |
| 19.2 | ทุกปุ่ม/ช่องในแชตมีชื่อ ไม่มี div aria-label ลอย | mapped | `web/src/chat/chat.test.tsx::19.2 ทุกปุ่ม/ช่องในแชตมีชื่อ` |
| 19.3 | ไม่มี id ซ้ำ | mapped | `web/src/chat/chat.test.tsx::19.2 ทุกปุ่ม/ช่องในแชตมีชื่อ` `web/src/parity/legacy.test.tsx::11) โครงสร้างการเข้าถึง` |
| 19.4 | ช่องพิมพ์จำกัด 300 ตัวอักษร | mapped | `web/src/chat/chat.test.tsx::19.3 ช่องพิมพ์จำกัด 300` |
| 19.5 | คำถามฝัง HTML แสดงเป็นข้อความ | mapped | `web/src/chat/chat.test.tsx::19.4 คำถามฝัง HTML` `web/src/chat/chat.test.tsx::19.5 คำตอบ/หลักฐานจากเซิร์ฟเวอร์ที่ฝัง` |
| 20.1 | ผลตรวจ: ไม่พบคำเตือน | mapped | `web/src/parity/legacy.test.tsx::6) กระชาย อายุ 30` |
| 20.2 | คำตอบมี ไม่พบคำเตือนในฐานข้อมูลนี้ | mapped | `web/src/chat/chat.test.tsx::20.1 คำตอบ ไม่พบคำเตือน` `engine/tests/test_rag_answer.py::test_safety_yesno_without_flags_uses_standard_no_flag_wording` |
| 20.3 | ข้อความของระบบไม่มีคำว่า ปลอดภัย | mapped | `web/src/chat/chat.test.tsx::20.1 คำตอบ ไม่พบคำเตือน` |
| 21.1 | ผลปัจจุบัน: คำตอบไม่มีป้ายผลเดิม | mapped | `web/src/chat/chat.test.tsx::21.1-21.5 ป้ายผลเดิม` |
| 21.2 | แก้ข้อมูลแล้วถาม 2 ครั้ง: ทั้งสองคำตอบมีป้ายผลเดิม | N/A | เปลี่ยนโดยการตัดสินงาน 10 (ledger): เซิร์ฟเวอร์ตอบจากข้อมูลปัจจุบันที่ส่งไปพร้อมคำถาม จึงไม่ใช่คำตอบของผลเดิม ไม่ติดป้าย พฤติกรรมใหม่ตรวจใน `web/src/chat/chat.test.tsx::21.1-21.5 ป้ายผลเดิม` |
| 21.3 | ตรวจใหม่แล้ว: คำตอบถัดไปไม่มีป้าย | mapped | `web/src/chat/chat.test.tsx::21.1-21.5 ป้ายผลเดิม` |
| 21.4 | แก้ข้อมูลระหว่างรอคำตอบ: คำตอบมีป้ายผลเดิม | mapped | `web/src/chat/chat.test.tsx::21.1-21.5 ป้ายผลเดิม` |
| 21.5 | ป้ายผลเดิมถูกเก็บในประวัติ | mapped | `web/src/chat/chat.test.tsx::21.1-21.5 ป้ายผลเดิม` (1 คำตอบแทน 3 ตามข้อ 21.2) |
| 22.1 | ล้างประวัติระหว่างรอ: คำตอบที่มาทีหลังไม่ค้าง | mapped | `web/src/chat/chat.test.tsx::22.1 ล้างประวัติระหว่างรอ` `web/src/chat/chat.test.tsx::22.1b ล้างระหว่างรอแล้วคำขอล้มเหลว` |
| 22.2 | 500: ข้อความไทยตายตัว ไม่โชว์รหัสภายใน | mapped | `web/src/chat/chat.test.tsx::22.2 500 -> ข้อความไทยตายตัว` `web/src/api.test.ts::500 and network failure give the fixed Thai message` |
| 22.3 | คำตอบไม่ใช่ JSON: ข้อความไทยตายตัว | mapped | `web/src/chat/chat.test.tsx::22.3 ตอบ 200 แต่ไม่ใช่ JSON` `web/src/api.test.ts::malformed 200 body is an ApiError` |
| 22.4 | 400 ข้อความไม่ใช่ไทย: ข้อความไทยตายตัว | mapped | `web/src/chat/chat.test.tsx::22.4 400 ข้อความไม่ใช่ไทย` `web/src/api.test.ts::400 with non-Thai message falls back` |
| 22.5 | 400 ข้อความไทยจากเซิร์ฟเวอร์: แสดงตามเดิม | mapped | `web/src/chat/chat.test.tsx::22.5 400 ข้อความไทยจากเซิร์ฟเวอร์` |
| 22.6 | 503: คงข้อความจากเซิร์ฟเวอร์ | mapped | `web/src/chat/chat.test.tsx::22.6 503 -> คงข้อความไทย` `web/src/api.test.ts::503 uses the server message` |
| 23.1 | ยาที่ไม่ได้กรอก: คำเตือนจากฐานข้อมูลพร้อมหลักฐาน ไม่บอกว่าไม่พบคำเตือน | mapped | `web/src/chat/chat.test.tsx::23.1 คำตอบคำเตือนจากฐานข้อมูล` `engine/tests/test_rag_answer.py::test_safety_question_naming_an_unchecked_drug_shows_database_items_not_no_flag` |
| 23.2 | ถามเฉพาะสิ่งที่ตรวจแล้วและไม่มีคำเตือน: ข้อความไม่พบคำเตือนมาตรฐาน | N/A | เนื้อหาคำตอบของเซิร์ฟเวอร์: `engine/tests/test_rag_answer.py::test_no_flag_wording_is_still_used_when_question_names_only_checked_things` |

## นอกตาราง (ข้อกำหนดของงาน 11 ที่ไม่ได้มาจากสคริปต์เดิม)

- สแกนซอร์ส: `web/src/source-scan.test.ts` (ไม่มี API แปลง HTML/โค้ด, ไม่มีคำว่า ปลอดภัย, ไม่มีคำขอไปภายนอก, fetch เฉพาะ /api/*, ที่เก็บใช้แค่ hg_tracker_v1/hg_chat_v1)
- สี no_flag ไม่ใช่เขียว และปุ่มสูง 44px: `web/src/styles/contrast.test.ts`
- SEO: `web/src/seo.test.ts`
