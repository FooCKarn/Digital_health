# ใบพลู (Baiploo) บน Cloudflare

โครงสร้าง: **Python Worker** (ตัวตรวจ engine เดิม + บัญชีผู้ใช้ + ซิงก์) + **D1** (ข้อมูลอ้างอิง บัญชี และข้อมูลที่ผู้ใช้เลือกซิงก์) + **Static Assets** (เว็บ `web/dist`)
การตัดสินใจของทีม (2026-10-12): เก็บข้อมูลอ้างอิงและบัญชีผู้ใช้ + ข้อมูลบันทึกสุขภาพใน D1, ตัวตรวจเขียนด้วย Python (Python Workers), AI คง Gemini/Anthropic

> **สถานะ: เตรียมพร้อม ยังไม่เคย deploy จริง** ทุกส่วนของตรรกะ (`app/`, `engine/`) ทดสอบในเครื่องกับ SQLite (D1 คือ SQLite) แล้ว และ migrations/seed รันกับ D1 ท้องถิ่นของ wrangler ผ่านแล้ว
> แต่ **ยังไม่ได้รัน Python Worker จริง** (ตัวรัน Python Workers ต้องดาวน์โหลด Pyodide จาก `pyodide-capnp-bin.edgeworker.net` ซึ่งเครื่องทดสอบนี้เข้าไม่ได้) และ Python Workers ของ Cloudflare ยังเป็นเบต้า
> ไฟล์ที่ยังไม่ได้พิสูจน์กับ runtime จริงมีไฟล์เดียวคือ `src/worker.py` (ตัวเชื่อม JS<->Python บาง ๆ: D1, WebCrypto, fetch) ให้ทดสอบด้วย `wrangler dev` ก่อนเปิดใช้

## ⚠️ ข้อมูลสุขภาพและ PDPA

บัญชี + ข้อมูลบันทึกสุขภาพในคลาวด์เป็นข้อมูลอ่อนไหวตามกฎหมาย ต้นแบบนี้ **ห้ามใช้ข้อมูลผู้ป่วยจริง** (CLAUDE.md กฎข้อ 10) จนกว่าที่ปรึกษากฎหมายจะตรวจนโยบาย (`web/src/components/Policy.tsx`)
สิ่งที่ทำไว้แล้ว: ซิงก์เป็นตัวเลือก (ค่าเริ่มต้นข้อมูลอยู่ในเครื่อง), บันทึกความยินยอม+เวอร์ชันนโยบายตอนสมัคร, ไม่เก็บอีเมล/เบอร์โทร, เก็บแฮชรหัสผ่านและแฮชโทเค็น, ลบบัญชีลบทุกแถว, ข้อมูลบันทึกสุขภาพไม่ส่งให้ AI
สิ่งที่ยังไม่ได้ทำ: เข้ารหัสรายฟิลด์, ช่องทางติดต่อ/คำขอใช้สิทธิ์, การเลือกที่ตั้งข้อมูล, บันทึกการเข้าถึงโดยผู้ดูแล

## Deploy อัตโนมัติ (GitHub Actions)

ทุกครั้งที่ push เข้า `main` workflow `.github/workflows/deploy-cloudflare.yml` จะ build, apply migrations แล้ว `wrangler deploy` ต้องตั้ง secret ใน GitHub: `CLOUDFLARE_API_TOKEN` (สิทธิ์ Workers Scripts:Edit, D1:Edit) และ `CLOUDFLARE_ACCOUNT_ID` ครั้งแรกให้สั่งรัน workflow ด้วยมือ (Actions > Run workflow) แล้วติ๊ก `seed` หนึ่งครั้งเพื่อใส่ข้อมูลอ้างอิง ห้ามติ๊กอีกหลังมีคนแก้ข้อมูลใน D1

## ขึ้นระบบด้วยมือ (ครั้งแรก)

```bash
cd cloudflare && npm i -D wrangler && npx wrangler login
npx wrangler d1 create herbguard                 # คัดลอก database_id ไปใส่ใน wrangler.jsonc
python ../scripts/build_worker.py                # สร้าง build/ (worker + engine) และ build/seed.sql จาก data/*.json
npx wrangler d1 migrations apply herbguard --remote
npx wrangler d1 execute herbguard --remote --file build/seed.sql
(cd ../web && npm ci && npm run build)           # เว็บที่ Worker เสิร์ฟ (assets.directory = ../web/dist)
npx wrangler secret put GEMINI_API_KEY           # หรือ ANTHROPIC_API_KEY (ไม่ตั้ง = AI ใช้ไม่ได้ ระบบตกไปใช้ข้อความสำรอง)
# ค้นข้อมูลภายนอกของแชตใช้ GEMINI_API_KEY ตัวเดิม ไม่ต้องตั้งความลับเพิ่ม (ตัวเลือก: GEMINI_SEARCH_MODEL=รุ่นคั่นจุลภาค, HERBGUARD_WEB_SEARCH=0 เพื่อปิด); ต้องใช้ key ที่เปิดใช้ Google Search grounding ได้
npx wrangler deploy
```

ทดสอบในเครื่อง: `npx wrangler d1 migrations apply herbguard --local && npx wrangler d1 execute herbguard --local --file build/seed.sql && npx wrangler dev`
ไม่มี Cloudflare ก็ลองบัญชี/ซิงก์ได้: `python scripts/dev_server.py 8000` (ใช้ `app/router.py` ตัวเดียวกับ Worker กับ SQLite ที่ `.dev/herbguard.sqlite`)

## เก็บไฟล์ต้นฉบับ (PDF) ใน R2

ไฟล์ต้นฉบับที่ได้จากหน่วยงาน (ถูก `.gitignore` ไม่เข้า git) เก็บไว้ใน R2 bucket ส่วนตัวชื่อ `herbguard-sources` ด้วย `scripts/upload_sources_r2.sh <โฟลเดอร์ไฟล์>` (ต้องเปิด R2 ในแดชบอร์ด Cloudflare ก่อน และ token ต้องมีสิทธิ์ R2:Edit) Worker ไม่ได้ผูก bucket นี้ เพราะไม่ต้องอ่านไฟล์เหล่านี้ ข้อมูลที่สกัดแล้วอยู่ใน D1 (`ref_docs`) ผ่าน seed

## แก้ข้อมูลอ้างอิง (ผู้เชี่ยวชาญ)

- ข้อมูลอยู่ในตารางตามชื่อไฟล์เดิม: `herbs` + `herb_rules` (กฎรายแถว: `kind` = contraindications/age_limits/drug_cautions/condition_cautions/duration_limits/notes), `formulas` + `formula_rules`, `drug_entries`, `conditions`, `mechanism_tags`, `config` (พารามิเตอร์ที่ทีมตั้งเอง พร้อม note), `ref_docs`
- แก้ได้ที่ D1 Console หรือ `wrangler d1 execute` ทุกครั้งที่แก้ trigger จะเปลี่ยน `ref_meta.data_version` และ Worker โหลดข้อมูลใหม่ภายใน 30 วินาที
- **ห้ามตั้ง `verified = 1` โดยไม่ใส่ `verified_by`** ฐานข้อมูลปฏิเสธให้ (CHECK) ตามกฎข้อ 2; `level` ต้องเป็น avoid/caution/info, `evidence_tier` ต้องเป็น A/B/C
- ข้อความต้องมาจากเอกสารต้นทางพร้อมเลขหน้า (`source_page`, `pdf_page`) ห้ามเติมจากความจำ (กฎข้อ 1)
- **อย่ารัน seed.sql ซ้ำหลังมีคนแก้ใน D1** seed ลบแล้วใส่จากไฟล์ใหม่ ทับการแก้ทั้งหมด เมื่อเริ่มแก้ใน D1 ให้ถือ D1 เป็นต้นฉบับ แล้วส่งกลับเป็นไฟล์เก็บใน git ด้วย:
  `npx wrangler d1 export herbguard --remote --output d1.sql && sqlite3 d1.db < d1.sql && python scripts/export_reference_from_sqlite.py d1.db`
- ผลตรวจจากข้อมูลใน D1 ต้องเท่ากับจากไฟล์ทุกเคส: `python -m pytest cloudflare/tests` (มีเทสต์เทียบ golden inputs) และ `python scripts/run_golden.py`

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `migrations/0001_reference.sql` | ตารางข้อมูลอ้างอิง + CHECK บังคับกติกา verified/level/tier + trigger เปลี่ยน data_version |
| `migrations/0002_accounts.sql` | users, sessions, login_attempts, user_state |
| `app/dataset.py` | JSON <-> แถว D1 แบบไม่สูญเสีย (เทสต์ round-trip) และสร้าง seed.sql |
| `app/router.py` | เส้นทาง `/api/*` ทั้งหมด (ตรวจ Origin กัน CSRF, คุกกี้ HttpOnly, จำกัดขนาด) |
| `app/auth.py`, `app/state.py` | บัญชี (PBKDF2-SHA256 100k รอบ, ล็อกเมื่อเดารหัส, หมดอายุ 30 วัน) และข้อมูลซิงก์ (ล็อกเวอร์ชันกันเขียนทับ) |
| `app/llm_bridge.py` | ให้ engine (ซิงก์) เรียก LLM ผ่าน `fetch` ของ Workers โดยเล่นซ้ำคำตอบที่ดึงมา ตัวตรวจ guardrail ทำงานเหมือนเดิม |
| `src/worker.py` | ตัวเชื่อม Workers runtime (ยังไม่ได้ทดสอบกับ runtime จริง) |
| `../scripts/build_worker.py` | สร้าง `build/` และ `seed.sql` |

## API

เดิม: `GET /api/meta`, `POST /api/analyze|parse|explain|ask|brief|assistant|feedback`
ใหม่: `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `DELETE /api/account`, `GET|PUT /api/state`
คำขอที่แก้ข้อมูลต้องมี `Origin` ตรงกับ `Host` และ `Content-Type: application/json`

## Vercel

ยังใช้ได้เหมือนเดิม (`api/*.py` อ่านข้อมูลจากไฟล์ ไม่มีระบบบัญชี หน้าเว็บจะซ่อนส่วนบัญชีเอง) ถ้าย้ายมา Cloudflare เต็มตัวแล้วค่อยลบ `api/` และ `vercel.json`
