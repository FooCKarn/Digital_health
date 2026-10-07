# Tracker Redesign (งานย่อยที่ 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้าเว็บใหม่แนว herb tracker (Vite + Preact + TypeScript ใน `web/`) ที่บันทึกสมุนไพร/ยาที่กำลังใช้ในเครื่องผู้ใช้ แล้วแสดงแผน "ช่วงนี้" จากผล `/api/analyze` แล้วสลับแทนหน้าเดิม `public/index.html` เมื่อเทสต์ครบ

**Architecture:** ผลตรวจมาจาก engine ฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่แตะ `engine/`, `data/`, `api/` ยกเว้นงานที่ 1 ซึ่งแก้ `engine/rag.py` + config/เทสต์เท่านั้น) หน้าเว็บมีฟังก์ชันล้วนสำหรับสร้าง payload/จัดกลุ่ม (`web/src/model/`) กับ `TrackerStore` ที่ซ่อนที่เก็บข้อมูลไว้หลังอินเทอร์เฟซ แล้วคอมโพเนนต์ Preact เรียกใช้ หน้าเก่าอยู่คู่กันจนกว่าเทสต์ใหม่ครอบคลุมทุกสถานการณ์เดิม

**Tech Stack:** Vite, Preact, TypeScript, Vitest + @testing-library/preact + jsdom (ติดตั้งใน `web/` เท่านั้น ห้ามมี `requirements.txt` หรือ `package.json` ที่ root), Python engine เดิม

**Spec:** `docs/superpowers/specs/2026-10-07-tracker-redesign-design.md` (ผู้ตัดสินใจ: ทีม อนุมัติแล้ว 2026-10-07) อ่านคู่กับแผนนี้ ถ้าขัดกัน spec ชนะ

## Global Constraints

- กฎข้อ 1/3: คำเตือนทุกข้อมาจากผลของ `/api/analyze` ห้ามจัดกลุ่ม/ตัดสินเองฝั่งเบราว์เซอร์ ใช้ `severity` ที่ engine คืน (`avoid` | `caution` | `info`) เท่านั้น
- กฎข้อ 5: ห้ามใช้ "ปลอดภัย" หรือ "ใช้ได้อย่างเหมาะสม" เป็นข้อสรุป ข้อความมาตรฐานคือ `ไม่พบธงเตือนในฐานข้อมูลนี้` และต้องมาคู่ `นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร` ทุกมุมมองผลต้องมีขอบเขต (สมุนไพร X จาก 50 ชนิด, N กลุ่มยา) และข้อความไม่ใช่การวินิจฉัย (`disclaimer_th` จาก `/api/meta`)
- กฎข้อ 7: ข้อความ/เกณฑ์ที่ทีมตั้งอยู่ใน `data/config.json` และมาทาง `/api/meta` ห้ามฝังตัวเลขเกณฑ์ใน `web/`
- กฎข้อ 10 (ตอนนี้): ข้อมูลตัวติดตามอยู่ใน localStorage เท่านั้น ห้ามส่งขึ้นเซิร์ฟเวอร์เพื่อเก็บ ห้ามใส่ใน URL/log; แชตใช้ sessionStorage เดิม key `hg_chat_v1` เก็บเฉพาะข้อความแชต ห้ามเก็บโปรไฟล์/ยา
- ห้ามใช้ `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `outerHTML` ใน `web/src`
- ห้ามใช้สีเขียวกับสถานะ "ไม่พบธงเตือนในฐานข้อมูลนี้" (ใช้เทาน้ำเงิน) ห้ามใช้สีอย่างเดียวสื่อความหมาย: ทุกป้ายต้องมี ไอคอน SVG + ข้อความ
- คอนทราสต์ข้อความ ≥ 4.5:1 (ข้อความ/ปุ่มใช้ `#0E7490` ไม่ใช่ `#0891B2`), ปุ่ม/ตัวควบคุมสัมผัส ≥ 44px, ไม่ใช้อีโมจิเป็นไอคอน, ฟอนต์ Noto Sans Thai ขนาดฐาน 16px line-height 1.6, เคารพ `prefers-reduced-motion`, ธีมมืดตามระบบ
- ข้อความ UI ภาษาไทย ชื่อตัวแปร/ฟังก์ชันอังกฤษ คอมเมนต์ธุรกิจภาษาไทย
- ห้ามตั้ง `verified: true` เอง; ห้ามแก้ `data/herbs.json`
- Python 3.12 / ทดสอบ Python ด้วย `PYTHONUTF8=1` และไม่ตั้ง API key; เทสต์เว็บรันใน `web/` ด้วย `npm test`
- ห้ามติดตั้ง dependency ที่ root หรือนอก `web/` และห้าม commit `node_modules/`, `web/dist/`
- รูปแบบผลตรวจที่ UI ต้องใช้ (จาก `engine/check.py`): `result.flags[]` มี `flag_id, rule_id, severity, evidence_tier, mechanism_tag, herb_id, message_th, source_page, pdf_page, evidence_quote, verified` (+ `drug_class`/`condition`/`group` บางธง); `result.aggregates[]`; `result.coverage {herbs_in_db, drug_classes_in_db, unknown_inputs[], not_checked[]}`; `result.pharmacist_review_required`; `result.disclaimer_th`; `/api/analyze` คืน `{result, summary}` โดย `summary` มี `headline_th, herbs[], drugs_as_entered[], flags[], aggregates[], follow_up_questions_th[], unknown_inputs[], not_checked[], disclaimer_th, draft_notice_th`

## Review Focus

(อินพุต/เงื่อนไขที่ spec ไม่ได้ระบุทุกข้อแต่ผู้ใช้จริงจะเจอ เรียงจากน่าจะเจอที่สุด แต่ละข้อมีเทสต์ในงานที่ระบุ)

1. **รายการมีแต่ยา ไม่มีสมุนไพร:** `/api/analyze` ต้องมีสมุนไพร ≥ 1 ผู้ใช้ต้องเห็นข้อความ "ยังไม่มีสมุนไพรให้ตรวจ" ไม่ใช่ error และไม่ใช่ "ไม่พบธง" (งาน 5, 7)
2. **วัน/เวลา:** วันที่เริ่ม = วันนี้ → `days_in_use` = 1; เปลี่ยนเขตเวลา/DST ต้องไม่ทำให้นับเพี้ยน (คำนวณจากสตริงวันที่ ไม่ใช่เวลา local); เกิน 365 วันหรืออนาคตถูกปฏิเสธตอนเพิ่ม (งาน 4)
3. **รายการซ้ำ/ชื่อยาแปลก:** เพิ่มสมุนไพรชนิดเดียวกันสองครั้ง ต้องไม่ซ้ำ; ยาที่ไม่อยู่ในแผนที่กลุ่มยา (อยู่ใน `coverage.unknown_inputs`) ต้องแสดง "ยังไม่มีข้อมูลตรวจ" ไม่ใช่ "ไม่พบธง" (งาน 4, 5)
4. **ไม่ได้กรอกอายุ/ตั้งครรภ์:** สมุนไพรที่ไม่มีธงแต่ `coverage.not_checked` ไม่ว่าง ต้องแสดงรายการที่ยังไม่ได้ตรวจคู่กับสถานะเสมอ ห้ามสื่อว่าตรวจครบ (งาน 7)
5. **ข้อมูลใน localStorage เสีย/ถูกแก้มือ/นำเข้าไฟล์ใหญ่หรือผิดรูป:** หน้าต้องไม่พัง ไม่นำเข้าบางส่วน ไม่ใช้ค่าที่ไม่ผ่านการตรวจ (งาน 4, 9)

---

### Task 1: แก้ช่องโหว่ข้อ 5 ของแชต (คำถามที่มีคำหัวข้อแต่ไม่ได้กรอกข้อมูลนั้น)

ข้อค้างจากรีวิวสุดท้ายของงานแชต (Important 1): `ขิงให้เด็กกินได้ไหม` (ติ๊กขิง ไม่มีธง) ได้ `safety_no_flag` ทั้งที่ฐานข้อมูลมี `khing.age_limits.0` ขณะที่ `เด็กกินขิงได้ไหม` ได้คำเตือนถูกต้อง

**Files:**
- Modify: `engine/rag.py` (เส้นทาง `safety_yesno` / `explain_flags` ใน `answer`)
- Modify: `docs/rag_eval.json` (เพิ่มเคส S05, S06)
- Test: `engine/tests/test_rag_answer.py`
- Modify: `data/config.json` (เพิ่มคำพ้อง "ยาความดัน" → กลุ่มยาลดความดันใน `rag_synonyms` ถ้ามีกลุ่มยานี้ใน `data/drug_class_map.json`; และวลี `แน่นหน้าอก` ใน `chat_emergency_phrases`; ทั้งสองมีหมายเหตุ "ทีมตั้งเอง ไม่ใช่มาตรฐาน ผู้เชี่ยวชาญต้องตรวจ" อยู่แล้วที่ระดับรายการ)

**Interfaces:**
- Consumes: `rag.answer(question, result, context_herbs, checked_herbs, index, config, complete=None, use_llm=True)`; ฟังก์ชันภายใน `_lookup(question, scope_herbs, index, config, phrases)` และตัวแปร `uncovered` ที่ใช้ตัดสินว่าคำถามพูดถึงสิ่งที่ยังไม่ได้ตรวจ (อ่านโค้ดใน `engine/rag.py` ก่อนแก้)
- Produces: พฤติกรรม: ถ้าคำถามประเภท `safety_yesno`/`explain_flags` ไม่มีธงในผลตรวจ แต่ `_lookup` ของสมุนไพรที่เกี่ยวข้องพบรายการ (ผ่านคำหัวข้อเช่น เด็ก/อายุ/คนท้อง) ให้ถือว่า "ไม่ครอบคลุม" แล้วใช้เส้นทาง `asked_unchecked` (ข้อความตายตัว + รายการจากฐานข้อมูล ไม่เรียก LLM) แทน `safety_no_flag`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** ใน `engine/tests/test_rag_answer.py` (ใช้ helper `ask(...)` เดิมของไฟล์; ดูว่ารับ `checked`/profile อย่างไร)

```python
def test_topic_word_question_with_no_flag_still_shows_database_item():
    # ติ๊กขิง ไม่มีธง: ถามเรื่องเด็ก ต้องเห็นข้อห้ามเด็กจากฐานข้อมูล ไม่ใช่ "ไม่พบธงเตือน"
    a = ask("ขิงให้เด็กกินได้ไหม", herbs=["khing"], age=30)
    assert a["intent"] == "safety_yesno"
    assert any(c["item_id"] == "khing.age_limits.0" for c in a["cites"])
    assert not a["text"].startswith("ไม่พบธงเตือนในฐานข้อมูลนี้")

def test_same_question_without_topic_word_keeps_standard_no_flag_text():
    # คำถามที่พูดถึงแค่สิ่งที่ตรวจแล้วและไม่มีธง ยังต้องได้ข้อความมาตรฐาน
    a = ask("ขิงกินได้ไหม", herbs=["khing"], age=30)
    assert a["text"].startswith("ไม่พบธงเตือนในฐานข้อมูลนี้")
```

(ถ้า helper `ask` ไม่รับพารามิเตอร์ `herbs`/`age` ให้ปรับตามรูปแบบเดิมของไฟล์ ดูการเรียกในเทสต์ข้างเคียง ห้ามเปลี่ยนความหมายของเทสต์เดิม)

- [ ] **Step 2: รันให้ล้ม**

Run: `PYTHONUTF8=1 python -m pytest engine/tests/test_rag_answer.py -k "topic_word or without_topic" -v`
Expected: เทสต์แรก FAIL (ได้ `safety_no_flag`), เทสต์ที่สองผ่านหรือล้มได้ถ้า helper ยังไม่รองรับ (แก้ helper ให้ผ่านก่อนไปต่อ)

- [ ] **Step 3: แก้ `engine/rag.py`** — ในเส้นทาง `safety_yesno`/`explain_flags` คำนวณ `hits = _lookup(question, <named herbs หรือ checked_herbs>, index, config, phrases)` ก่อนตัดสิน แล้วเพิ่มเงื่อนไข `or (not flags and hits)` เข้า `uncovered` และใช้ `hits` ซ้ำในสาขา `asked_unchecked` แทนการค้นซ้ำ (ผู้ตรวจรอบสุดท้ายระบุว่าเป็นการแก้ ~2 บรรทัด) ห้ามเรียก LLM ในสาขานี้

- [ ] **Step 4: เพิ่มเคสประเมิน** `docs/rag_eval.json` S05 (`ขิงให้เด็กกินได้ไหม`, ขิงติ๊ก, อายุ 30 → คาดรายการ `khing.age_limits.0`) และ S06 (`ขิงกินได้ไหม` → ข้อความ `safety_no_flag`) ใช้รูปแบบเคส S01–S04 เดิมในไฟล์; รหัสรายการต้องมีอยู่จริงใน `data/herbs.json`

- [ ] **Step 5: คำพ้อง/วลีตามรีวิว** (Minor 1, 3): ใส่ "ยาความดัน" ใน `rag_synonyms` ชี้กลุ่มยาลดความดันเฉพาะเมื่อกลุ่มนั้นมีใน `data/drug_class_map.json` (ถ้าไม่มี ข้ามและบันทึกใน report); เพิ่ม `แน่นหน้าอก` ใน `chat_emergency_phrases`; เพิ่มเทสต์สั้น ๆ ว่า `ขิงกินได้ไหม มีอาการแน่นหน้าอก` ได้ intent `emergency`

- [ ] **Step 6: รันทุกชุดแล้ว commit**

Run: `PYTHONUTF8=1 python -m pytest engine/tests -q && PYTHONUTF8=1 python scripts/run_golden.py | tail -2 && PYTHONUTF8=1 python scripts/run_rag_eval.py | tail -5`
Expected: ผ่านทั้งหมด; golden PASS 20/FAIL 0/SKIP 1; ชุดประเมินไม่มีเคสจริงที่ล้ม (K01 ยังเป็น known_limit)

```bash
git add engine/rag.py engine/tests/test_rag_answer.py docs/rag_eval.json data/config.json
git commit -m "Chat: topic-word yes/no questions show database items instead of no-flag"
```

---

### Task 2: โครงโปรเจกต์ `web/` (Vite + Preact + TypeScript + Vitest)

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts` (หรือรวมใน vite.config), `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/test/setup.ts`, `web/src/App.test.tsx`, `web/.gitignore` (`node_modules`, `dist`)
- Modify: `.gitignore` (เพิ่ม `web/node_modules/`, `web/dist/`)

**Interfaces:**
- Produces: คำสั่ง `npm run dev|build|test|typecheck` ใน `web/`; `App` คอมโพเนนต์ราก; proxy dev ไปยัง `scripts/dev_server.py` (พอร์ต 8000) สำหรับ `/api/*`

- [ ] **Step 1: สร้างไฟล์ตั้งต้น** `web/package.json` (เวอร์ชันให้ `npm install` เลือกล่าสุดที่เข้ากันได้แล้ว commit `package-lock.json`)

```json
{
  "name": "herbguard-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

ติดตั้ง: `cd web && npm install preact && npm install -D vite @preact/preset-vite typescript vitest jsdom @testing-library/preact @testing-library/user-event @testing-library/jest-dom`

`web/vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], globals: true },
});
```

`web/tsconfig.json`: `strict: true`, `jsx: "react-jsx"`, `jsxImportSource: "preact"`, `target: "ES2022"`, `moduleResolution: "bundler"`, `types: ["vitest/globals", "@testing-library/jest-dom"]`, `include: ["src"]`.

`web/src/test/setup.ts`: `import "@testing-library/jest-dom/vitest";` และ cleanup ของ testing-library หลังแต่ละเทสต์

`web/index.html`: โครง HTML ภาษาไทย (`<html lang="th">`), `<title>`, meta description, `<meta name="robots" content="noindex, nofollow">` (ย้ายค่าจาก `public/index.html` ปัจจุบัน — อ่านแล้วคัดลอกเฉพาะ meta/OG ที่มีอยู่), โหลด Noto Sans Thai จาก Google Fonts, `<div id="app">`, `<script type="module" src="/src/main.tsx">`

`web/src/App.tsx`: คอมโพเนนต์ที่แสดง `<h1>HerbGuard TTM</h1>` ชั่วคราว

- [ ] **Step 2: เขียนเทสต์ smoke** `web/src/App.test.tsx`: render `<App />` แล้ว `expect(screen.getByRole("heading", {level:1})).toHaveTextContent("HerbGuard")`

- [ ] **Step 3: รันและตรวจ**

Run: `cd web && npm test && npm run typecheck && npm run build`
Expected: เทสต์ผ่าน, build สร้าง `web/dist/index.html`

- [ ] **Step 4: Commit** (ไม่รวม `node_modules`, `dist`)

```bash
git add web .gitignore
git commit -m "web: scaffold Vite + Preact + TypeScript + Vitest"
```

---

### Task 3: ชนิดข้อมูล + ตัวเรียก API (`web/src/api.ts`)

**Files:**
- Create: `web/src/types.ts`, `web/src/api.ts`, `web/src/api.test.ts`

**Interfaces:**
- Produces:
  - ชนิด `Severity = "avoid"|"caution"|"info"`, `Flag`, `Aggregate`, `Coverage`, `AnalyzeResult`, `Summary`, `Meta`, `AskAnswer`, `ParseProposal`
  - `class ApiError extends Error { kind: "network"|"server"|"bad_request"|"unavailable"; thaiMessage: string }`
  - `analyze(payload: AnalyzePayload, signal?: AbortSignal): Promise<{result: AnalyzeResult; summary: Summary}>`
  - `getMeta(): Promise<Meta>`; `ask(payload): Promise<AskAnswer>`; `parseText(text): Promise<ParseProposal>`; `explain(payload): Promise<{explanation: unknown}>`; `sendFeedback(payload): Promise<void>`
  - ข้อความผิดพลาดไทยตายตัว (ไม่แสดงรหัสดิบ): ล้มเหลวเครือข่าย/500/รูปแบบตอบผิด → `ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง`; 400 → ถ้า message เป็นภาษาไทย แสดงตามนั้น มิฉะนั้นข้อความตายตัว; 503 → ใช้ message จากเซิร์ฟเวอร์

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** (mock `globalThis.fetch`)

```ts
import { analyze, ApiError } from "./api";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const err = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

test("analyze posts JSON to /api/analyze and returns the body", async () => {
  const fetchMock = vi.fn(() => ok({ result: { flags: [] }, summary: {} }));
  vi.stubGlobal("fetch", fetchMock);
  const r = await analyze({ herbs: [{ id: "khing", days_in_use: 3 }], drugs: [], profile: { conditions: [] } });
  expect(fetchMock).toHaveBeenCalledWith("/api/analyze", expect.objectContaining({ method: "POST" }));
  expect(r.result.flags).toEqual([]);
});

test("500 and network failure give the fixed Thai message, never raw codes", async () => {
  vi.stubGlobal("fetch", vi.fn(() => err(500, { error: "server_error", detail: "boom" })));
  await expect(analyze({ herbs: [{ id: "khing" }], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ kind: "server", thaiMessage: "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง" });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fail"))));
  await expect(analyze({ herbs: [{ id: "khing" }], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ kind: "network", thaiMessage: "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง" });
});

test("400 with non-Thai message falls back to the fixed text; Thai message is kept", async () => {
  vi.stubGlobal("fetch", vi.fn(() => err(400, { error: "bad json" })));
  await expect(analyze({ herbs: [], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ kind: "bad_request", thaiMessage: "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง" });
  vi.stubGlobal("fetch", vi.fn(() => err(400, { error: "herbs ต้องมี 1-50 รายการ" })));
  await expect(analyze({ herbs: [], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ thaiMessage: "herbs ต้องมี 1-50 รายการ" });
});

test("malformed 200 body is an ApiError, not a TypeError", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("not json", { status: 200 }))));
  await expect(analyze({ herbs: [{ id: "khing" }], drugs: [], profile: { conditions: [] } })).rejects.toBeInstanceOf(ApiError);
});
```

- [ ] **Step 2: รันให้ล้ม** — Run: `cd web && npx vitest run src/api.test.ts` · Expected: FAIL (ไม่มีโมดูล)

- [ ] **Step 3: เขียน `types.ts` และ `api.ts`** ตามรูปแบบผลตรวจใน Global Constraints (อ่าน `engine/service.py` `ask`/`parse`/`explain`/`feedback` และ `api/*.py` เพื่อให้ชนิดตรงกับที่เซิร์ฟเวอร์คืนจริง รวมถึงรูปคำตอบ `/api/ask` — ดูเทสต์ใน `engine/tests/test_api.py`); ฟังก์ชันเรียก `fetch` ด้วย `headers: {"content-type": "application/json"}`; แยก error ตามสถานะ; ห้ามใส่ `detail` ของเซิร์ฟเวอร์ใน `thaiMessage`

- [ ] **Step 4: รันให้ผ่านและ typecheck** — Run: `cd web && npm test && npm run typecheck` · Expected: ผ่าน

- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: API client with fixed Thai errors"`

---

### Task 4: ตัวติดตาม (TrackerStore) + วันที่ + ส่งออก/นำเข้า

**Files:**
- Create: `web/src/model/dates.ts`, `web/src/model/tracker.ts`, `web/src/model/storage.ts`
- Test: `web/src/model/dates.test.ts`, `web/src/model/tracker.test.ts`

**Interfaces:**
- Produces:

```ts
// dates.ts — คำนวณจากสตริงวันที่ (YYYY-MM-DD) ด้วย UTC เท่านั้น ไม่ผูกกับ DST/เขตเวลา
export function todayISO(now?: Date): string;                 // วันที่ local ของเครื่องผู้ใช้เป็น YYYY-MM-DD
export function dayNumber(startISO: string, todayISOStr: string): number;   // วันเริ่ม = 1
export function validateStart(startISO: string, todayISOStr: string): string | null;  // ข้อความผิดพลาดไทย หรือ null

// tracker.ts
export type ItemKind = "herb" | "drug";
export interface TrackerItem { id: string; kind: ItemKind; ref: string; label: string; start_date: string; end_date: string | null }
export interface Profile { age: number | null; pregnant: "yes" | "no" | null; breastfeeding: "yes" | "no" | null; conditions: string[] }
export interface TrackerState { v: 1; items: TrackerItem[]; profile: Profile }
export interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export class TrackerStore {
  constructor(storage: KeyValueStorage | null, today: () => string);
  get state(): TrackerState; readonly persistent: boolean;      // persistent=false เมื่อ storage ใช้ไม่ได้
  subscribe(fn: () => void): () => void;
  addItem(input: {kind: ItemKind; ref: string; label: string; start_date: string}): {ok: true; item: TrackerItem} | {ok: false; message: string};
  stopItem(id: string): void;                                   // ตั้ง end_date = วันนี้
  removeItem(id: string): void;
  setProfile(p: Profile): void;
  active(): TrackerItem[]; history(): TrackerItem[];
  exportJSON(): string;
  importJSON(text: string): {ok: true} | {ok: false; message: string};   // ตรวจทั้งไฟล์ ไม่นำเข้าบางส่วน
  clearAll(): void;
}
export const STORAGE_KEY = "hg_tracker_v1";
```

กติกา: รายการที่ `end_date === null` หรือ `end_date >= วันนี้` คือ active; `addItem` ปฏิเสธซ้ำ (kind+ref เดียวกันที่ยัง active), start_date เป็นอนาคตหรือเก่ากว่า 365 วัน (ข้อความไทย), label ว่าง/เกิน 100 ตัวอักษร; `importJSON` ปฏิเสธไฟล์เกิน 100 KB, `v !== 1`, ฟิลด์ผิดชนิด, `items` เกิน 200, วันที่ผิดรูป, `conditions` ไม่ใช่สตริง; storage เสีย (parse ไม่ได้/ชนิดผิด) → เริ่มสถานะว่างและตั้งธง `recovered=true` ไม่ throw; `setItem` โยนข้อผิดพลาด (quota/private mode) → ทำงานต่อในหน่วยความจำ `persistent=false`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** (ส่วนสำคัญ; เทสต์วันที่)

```ts
import { dayNumber, validateStart } from "./dates";

test("start day is day 1; counts calendar days across DST boundaries", () => {
  expect(dayNumber("2026-10-07", "2026-10-07")).toBe(1);
  expect(dayNumber("2026-10-07", "2026-10-13")).toBe(7);
  expect(dayNumber("2026-03-28", "2026-04-02")).toBe(6);        // ข้ามเปลี่ยนเวลาฤดูร้อนของหลายประเทศ ต้องไม่เพี้ยน
});

test("start date validation: future and >365 days ago rejected", () => {
  expect(validateStart("2026-10-08", "2026-10-07")).toMatch(/อนาคต/);
  expect(validateStart("2025-10-07", "2026-10-07")).toMatch(/365/);   // วันที่ 366 ต้องถูกปฏิเสธ
  expect(validateStart("2025-10-08", "2026-10-07")).toBeNull();   // วันที่ 365 พอดี ใช้ได้ (/api/analyze รับ days_in_use 0-365)
  expect(validateStart("2026-02-30", "2026-10-07")).toMatch(/วันที่/);
});
```

นิยาม: วันเริ่ม = วันที่ 1; `validateStart` ผ่านเมื่อ `1 ≤ dayNumber ≤ 365` (ตรงกับ `days_in_use` 0–365 ที่ `/api/analyze` รับ)

เทสต์ `tracker.test.ts` ต้องครอบคลุม (เขียนเป็นโค้ดจริงทีละข้อ): เพิ่ม/หยุด/ลบ; ซ้ำถูกปฏิเสธ; active/history แยกถูก; storage เป็น `null` → `persistent=false` และยังทำงาน; `setItem` โยนข้อผิดพลาด → ไม่ throw `persistent=false`; JSON เสียใน storage → state ว่าง ไม่ throw; round-trip `exportJSON`→`importJSON`; นำเข้าไฟล์ผิดรูป/ใหญ่เกิน/`v:2`/วันที่ผิด → `{ok:false}` และ state เดิมไม่เปลี่ยน; `clearAll` ลบ key; subscriber ถูกเรียกเมื่อเปลี่ยน

- [ ] **Step 2: รันให้ล้ม** — Run: `cd web && npx vitest run src/model` · Expected: FAIL

- [ ] **Step 3: เขียนโค้ดตามอินเทอร์เฟซ** (ใช้ `Date.UTC(y,m-1,d)` หารด้วย 86400000 เพื่อนับวัน; ตรวจ `dayNumber ≤ 365`; ตรวจวันที่จริง เช่น 2026-02-30 ไม่ผ่าน)

- [ ] **Step 4: รันให้ผ่าน** — Run: `cd web && npm test && npm run typecheck` · Expected: ผ่าน

- [ ] **Step 5: Commit** — `git add web/src/model && git commit -m "web: tracker store with date rules, export/import, storage fallback"`

---

### Task 5: โมเดลแผง "ช่วงนี้" (ฟังก์ชันล้วน)

**Files:**
- Create: `web/src/model/panel.ts`
- Test: `web/src/model/panel.test.ts`

**Interfaces:**
- Consumes: `TrackerItem`, `Profile` (งาน 4), `AnalyzeResult`, `Flag` (งาน 3), `dayNumber` (งาน 4)
- Produces:

```ts
export interface AnalyzePayload { herbs: {id: string; days_in_use?: number}[]; drugs: string[]; profile: { age?: number; pregnant?: boolean; breastfeeding?: boolean; conditions: string[] } }
export function buildPayload(active: TrackerItem[], profile: Profile, todayISOStr: string): AnalyzePayload | null;   // null = ไม่มีสมุนไพร (ห้ามเรียก API)
export type ItemStatus = "flagged" | "no_flag" | "no_data";
export function itemStatus(item: TrackerItem, result: AnalyzeResult): ItemStatus;
export interface PanelGroups { avoid: Flag[]; caution: Flag[]; info: Flag[] }
export function groupFlags(result: AnalyzeResult): PanelGroups;                 // ตาม severity ของ engine เท่านั้น เรียงตามลำดับเดิมของ engine
export function notCheckedLabels(result: AnalyzeResult, labels: Record<string,string>): string[];
```

กติกา: `buildPayload` ส่ง `pregnant`/`breastfeeding` เฉพาะเมื่อผู้ใช้ตอบ "yes"/"no" (ไม่ระบุ = ไม่ใส่คีย์ เพื่อให้ engine แสดง `not_checked`) และ `age` เฉพาะเมื่อไม่ใช่ null; `days_in_use = dayNumber(start, today)`; `drugs` = `ref` ของรายการยาที่ active; `itemStatus`: สมุนไพร → `flagged` ถ้ามี flag ที่ `herb_id === ref`, มิฉะนั้น `no_flag` (ถ้าไม่อยู่ใน `coverage.unknown_inputs`), ถ้าอยู่ใน `unknown_inputs` → `no_data`; ยา → `no_data` ถ้า `ref` อยู่ใน `unknown_inputs` (เทียบแบบ trim/lowercase) ไม่เช่นนั้น `no_flag` เพราะผลตรวจไม่บอกกลุ่มของแต่ละยา ธงที่เกี่ยวกับยาแสดงในแผงธงตามสมุนไพร ไม่ผูกกับแถวยา ห้ามคาดเดากลุ่มยาฝั่งเบราว์เซอร์ (กฎข้อ 1) ผู้ทำบันทึกข้อสังเกตนี้ในรายงาน และ ActiveList ต้องไม่ใช้ป้าย `no_flag` ของแถวยาเป็นข้อสรุปว่ายานั้นไม่มีธง (แสดงข้อความ "ดูธงในแผงด้านบน" แทนป้ายสถานะสำหรับแถวยาที่ไม่ใช่ `no_data`)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

```ts
import { buildPayload, groupFlags, itemStatus } from "./panel";
const item = (o: Partial<any>) => ({ id: "i1", kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-05", end_date: null, ...o });
const profile = { age: null, pregnant: null, breastfeeding: null, conditions: [] };

test("payload: days_in_use from start date, unspecified profile keys are omitted", () => {
  const p = buildPayload([item({})], profile, "2026-10-07")!;
  expect(p.herbs).toEqual([{ id: "khing", days_in_use: 3 }]);
  expect(p.profile).toEqual({ conditions: [] });                  // ไม่มี age/pregnant/breastfeeding
});

test("payload: answered profile values are sent (false is a real answer)", () => {
  const p = buildPayload([item({})], { ...profile, age: 60, pregnant: "no", breastfeeding: "yes" }, "2026-10-07")!;
  expect(p.profile).toEqual({ age: 60, pregnant: false, breastfeeding: true, conditions: [] });
});

test("payload: no herbs -> null (never call the API); drug-only list included in drugs when herbs exist", () => {
  expect(buildPayload([item({ kind: "drug", ref: "warfarin", label: "warfarin" })], profile, "2026-10-07")).toBeNull();
  const p = buildPayload([item({}), item({ id: "i2", kind: "drug", ref: "warfarin", label: "warfarin" })], profile, "2026-10-07")!;
  expect(p.drugs).toEqual(["warfarin"]);
});

test("groupFlags uses engine severity only and keeps engine order", () => {
  const r: any = { flags: [{ flag_id: "f1", severity: "avoid" }, { flag_id: "f2", severity: "info" }, { flag_id: "f3", severity: "caution" }, { flag_id: "f4", severity: "avoid" }] };
  const g = groupFlags(r);
  expect(g.avoid.map((f) => f.flag_id)).toEqual(["f1", "f4"]);
  expect(g.caution.map((f) => f.flag_id)).toEqual(["f3"]);
  expect(g.info.map((f) => f.flag_id)).toEqual(["f2"]);
});

test("itemStatus: flagged vs no_flag vs no_data (unknown input is never 'no_flag')", () => {
  const r: any = { flags: [{ herb_id: "khing" }], coverage: { unknown_inputs: ["ยาแปลก"] } };
  expect(itemStatus(item({}), r)).toBe("flagged");
  expect(itemStatus(item({ ref: "garlic" }), r)).toBe("no_flag");
  expect(itemStatus(item({ kind: "drug", ref: "ยาแปลก", label: "ยาแปลก" }), r)).toBe("no_data");
  expect(itemStatus(item({ kind: "drug", ref: "warfarin", label: "warfarin" }), r)).toBe("no_flag");
});
```

- [ ] **Step 2: รันให้ล้ม** — `cd web && npx vitest run src/model/panel.test.ts` · FAIL
- [ ] **Step 3: เขียน `panel.ts`** ตามกติกา
- [ ] **Step 4: รันให้ผ่าน** — `cd web && npm test && npm run typecheck`
- [ ] **Step 5: Commit** — `git add web/src/model && git commit -m "web: panel model (payload, grouping, item status)"`

---

### Task 6: โทเคนดีไซน์ + คอมโพเนนต์พื้นฐาน

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/styles/base.css`, `web/src/components/Icon.tsx`, `web/src/components/SeverityBadge.tsx`, `web/src/components/ScopeChip.tsx`, `web/src/components/Disclaimer.tsx`
- Test: `web/src/components/primitives.test.tsx`, `web/src/styles/contrast.test.ts`

**Interfaces:**
- Produces: `SeverityBadge({kind: "avoid"|"caution"|"info"|"no_flag"|"no_data"})` แสดง ไอคอน SVG + ข้อความไทยตายตัว (ควรหลีกเลี่ยง / ควรระวัง / ข้อมูลเพิ่มเติม / ไม่พบธงเตือนในฐานข้อมูลนี้ / ยังไม่มีข้อมูลตรวจ) มี `data-kind`; `ScopeChip({coverage})` แสดง `สมุนไพร X จาก 50 ชนิด · N กลุ่มยา`; `Disclaimer({text})`; โทเคนสีเป็นตัวแปร CSS (`--c-primary: #0E7490`, `--c-avoid-fg/bg`, `--c-caution-fg/bg`, `--c-info-fg/bg`, `--c-noflag-fg/bg`, `--c-text`, `--c-bg` + ชุดธีมมืดใน `@media (prefers-color-scheme: dark)`)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**: (ก) `SeverityBadge` ทุกชนิดมี `<svg aria-hidden>` และข้อความไทยตรงตามรายการ และ `no_flag` ไม่ใช้โทเคนสีเขียว (เทสต์สแกน `tokens.css`: ห้ามมีค่า hue เขียวในโทเคน `--c-noflag-*`; ตรวจเป็นรายการค่าสีที่ระบุไว้ในไฟล์) (ข) `contrast.test.ts` อ่านค่าสี fg/bg คู่ของ avoid/caution/info/noflag/primary/text จาก `tokens.css` (ทั้งสว่างและมืด) แล้วคำนวณอัตราส่วนคอนทราสต์ตามสูตร WCAG ต้อง ≥ 4.5 ทุกคู่ (ค) `ScopeChip` แสดงตัวเลขจากข้อมูล ไม่ฝังตัวเลข (ส่ง coverage ต่างกัน ได้ข้อความต่างกัน) (ง) ปุ่มทุกชนิดในโทเคนกำหนด `min-height: 44px` (สแกน base.css)
- [ ] **Step 2: รันให้ล้ม** — `cd web && npx vitest run src/components src/styles`
- [ ] **Step 3: เขียนโค้ด** ฟอนต์ Noto Sans Thai (โหลดใน `index.html` แล้ว), `font-size:16px; line-height:1.6`, `:focus-visible` เห็นชัด, `@media (prefers-reduced-motion: reduce)` ปิดแอนิเมชัน, ไอคอน SVG เขียนเอง (ไม่เพิ่ม dependency) ห้ามอีโมจิ
- [ ] **Step 4: รันให้ผ่าน** — `cd web && npm test && npm run typecheck`
- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: design tokens and primitives (badges, scope chip, disclaimer)"`

---

### Task 7: หน้า "ช่วงนี้" (แผง + รายการ + การตรวจอัตโนมัติ)

**Files:**
- Create: `web/src/hooks/useAnalysis.ts`, `web/src/components/ThisPeriod.tsx`, `web/src/components/FlagCard.tsx`, `web/src/components/ActiveList.tsx`, `web/src/components/SummaryStrip.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/hooks/useAnalysis.test.tsx`, `web/src/components/ThisPeriod.test.tsx`

**Interfaces:**
- Consumes: `TrackerStore` (4), `buildPayload/groupFlags/itemStatus/notCheckedLabels` (5), `analyze/ApiError/getMeta` (3), primitives (6)
- Produces: `useAnalysis(store, today)` คืน `{status: "idle"|"loading"|"ok"|"error"; result; summary; stale: boolean; error: string|null; retry(): void}`: หน่วงเวลา 300 ms หลังรายการ/โปรไฟล์เปลี่ยน, ใช้ตัวนับรุ่น (`gen`) — ผลที่ตอบกลับหลังข้อมูลเปลี่ยนไปแล้วถูกทิ้ง, `AbortController` ยกเลิกคำขอเก่า, เมื่อตรวจล้มเหลวคงผลล่าสุดไว้พร้อม `stale=true` และ `error` (ข้อความไทยจาก `ApiError.thaiMessage`); ถ้า `buildPayload` ได้ `null` → `status="idle"` และไม่เรียก API; `ThisPeriod` แสดง: หัวผล (ถ้าไม่มีธงเลย: `ไม่พบธงเตือนในฐานข้อมูลนี้` + `นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร`), `ScopeChip` + `Disclaimer` เหนือธงแรกเสมอ, แถบสรุป 3 กลุ่ม (ลิงก์ข้ามไปกลุ่ม), 3 กลุ่ม `<details>` (avoid เปิดไว้), `FlagCard` ต่อธง (ข้อความ `message_th`, `evidence_tier`, หน้า `source_page` (หน้าพิมพ์) และ `pdf_page`, สถานะ `verified`, `evidence_quote` ในกล่อง "ดูหลักฐาน" แบบ `<details>`), แบนเนอร์เด่นเฉพาะเมื่อมี `avoid`, ข้อความ `ยังไม่ได้ตรวจ (ไม่มีในฐานข้อมูล): …` จาก `unknown_inputs`, `ไม่ได้ตรวจเงื่อนไข (ไม่ได้กรอก): …` จาก `not_checked` ทุกครั้งที่ไม่ว่างแม้ไม่มีธง, ประกาศผลผ่าน `aria-live="polite"`; `ActiveList` แสดงแถวละรายการ ชื่อ ชนิด `วันที่ N` และ `SeverityBadge` ตาม `itemStatus` (สมุนไพรที่ยังไม่มีสถานะระหว่างโหลดแสดง `กำลังตรวจ…`) พร้อมปุ่ม หยุดใช้/ลบ ขนาด ≥ 44px

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**: `useAnalysis` — (ก) เปลี่ยนรายการสองครั้งเร็ว ๆ ใช้ผลของครั้งหลังเท่านั้น (ผลช้าของครั้งแรกถูกทิ้ง); (ข) ไม่มีสมุนไพร → ไม่เรียก `fetch`; (ค) ตรวจล้มเหลว → คงผลเก่า `stale=true` และมี `error` เป็นข้อความไทยตายตัว ไม่ล้างรายการ; (ง) `retry()` เรียกใหม่และล้าง `error`. `ThisPeriod` — (จ) ไม่มีธง + ไม่ได้กรอกอายุ → เห็นทั้ง `ไม่พบธงเตือนในฐานข้อมูลนี้` และ `ไม่ได้ตรวจเงื่อนไข (ไม่ได้กรอก): อายุ`; (ฉ) ยาที่อยู่ใน `unknown_inputs` ได้ป้าย `ยังไม่มีข้อมูลตรวจ` ไม่ใช่ `ไม่พบธง`; (ช) กลุ่ม avoid เปิดไว้ กลุ่มอื่นพับ; (ซ) ข้อความธงที่ฝัง `<img onerror=...>` แสดงเป็นข้อความ ไม่สร้าง element (เทียบสถานการณ์ 7 เดิม); (ฌ) ไม่มีข้อความ "ปลอดภัย" ใน DOM นอกรูปที่อนุญาต (ไม่มี "ปลอดภัย" เลย ยกเว้นข้อความจากข้อมูลที่ส่งมา); (ญ) แถวที่ `verified:false` แสดงสถานะ "ร่าง ยังไม่ผ่านผู้เชี่ยวชาญ" (ตามข้อความเดิมของหน้าเก่า) โดยอ่านถ้อยคำจาก `summary.draft_notice_th`
- [ ] **Step 2: รันให้ล้ม** · **Step 3: เขียนโค้ด** · **Step 4: รันให้ผ่าน** (`cd web && npm test && npm run typecheck`)
- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: this-period panel, active list and auto analysis hook"`

---

### Task 8: ปุ่ม "+ เพิ่ม" (bottom sheet) + ให้ AI แยกข้อความ + ให้ AI เรียบเรียง

**Files:**
- Create: `web/src/components/AddSheet.tsx`, `web/src/components/ParseBox.tsx`, `web/src/components/ExplainBox.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/components/AddSheet.test.tsx`

**Interfaces:**
- Consumes: `getMeta()` (รายการสมุนไพร/ยา/โรค), `TrackerStore.addItem`, `parseText`, `explain`
- Produces: `AddSheet({meta, store, onClose})`: `role="dialog"` มีชื่อ, ค้นหา (กรองรายการจาก `meta.herbs`/`meta.drugs`), เลือก 1 รายการ + วันที่เริ่ม (`<input type="date" max=วันนี้>`, ค่าเริ่ม = วันนี้), ยืนยัน → `addItem` (แสดงข้อความผิดพลาดไทยใกล้ช่อง ไม่ใช่แค่ด้านบน), ปิดด้วย Esc คืนโฟกัสไปปุ่มเพิ่ม, พิมพ์ชื่อยาที่ไม่อยู่ในรายการได้ (ตามพฤติกรรมเดิมของหน้าเก่าที่ให้พิมพ์ยาเอง) แล้วสถานะจะเป็น `ยังไม่มีข้อมูลตรวจ` เมื่อ engine ไม่รู้จัก; `ParseBox`: พิมพ์ข้อความอิสระ → `POST /api/parse` → แสดงรายการที่เสนอ ให้ผู้ใช้ติ๊กยืนยันก่อนเพิ่ม (CLAUDE.md ข้อ 4 (a): ผู้ใช้ยืนยันก่อน; ไม่มี key → แสดงข้อความไทยตายตัว ไม่พัง); `ExplainBox`: ปุ่มตัวเลือก "ให้ AI เรียบเรียงภาษา" ใน `ThisPeriod` เรียก `/api/explain` แสดงผลพร้อมป้ายที่มา (เหมือนหน้าเก่า: อ่านพฤติกรรมจาก `public/index.html` ฟังก์ชัน `explainNow`/`applyParsed` และสถานการณ์ 8)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** (ใช้ `@testing-library/user-event`): เพิ่มขิง วันที่เริ่ม 3 วันก่อน → store มีรายการ `วันที่ 4` (วันนี้ฉีดผ่านพารามิเตอร์); วันที่ในอนาคต → ข้อความผิดพลาดอยู่ใกล้ช่องวันที่ และไม่เพิ่ม; Esc ปิดและโฟกัสกลับ; พิมพ์ยาแปลกแล้วเพิ่มได้; ParseBox แสดงข้อเสนอและยังไม่เพิ่มจนกว่าผู้ใช้ติ๊กยืนยัน; `/api/parse` ตอบ 503 → เห็นข้อความไทยตายตัว; ปุ่มที่กำลังทำงานไม่ถูกกดซ้ำ (เทียบสถานการณ์ 8)
- [ ] **Step 2–4:** รันให้ล้ม · เขียนโค้ด · รันให้ผ่าน (`cd web && npm test && npm run typecheck`)
- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: add sheet, AI text parse (user confirms), AI explain"`

---

### Task 9: ที่เคยใช้ + ข้อมูลของฉัน (โปรไฟล์ ส่งออก/นำเข้า/ลบ ใบสรุปเภสัชกร อภิธานศัพท์ ข้อเสนอแนะ)

**Files:**
- Create: `web/src/components/History.tsx`, `web/src/components/MyData.tsx`, `web/src/components/ProfileForm.tsx`, `web/src/components/PharmacistSummary.tsx`, `web/src/components/Glossary.tsx`, `web/src/components/FeedbackCard.tsx`
- Modify: `web/src/App.tsx` (แท็บ/การนำทางด้านล่าง: ช่วงนี้ · ที่เคยใช้ · ข้อมูลของฉัน; ลำดับโฟกัสถูกต้อง; แท็บเป็น `role="tablist"` พร้อมลูกศร/Home/End เหมือนหน้าเก่า)
- Test: `web/src/components/MyData.test.tsx`, `web/src/components/History.test.tsx`

**Interfaces:**
- Produces: `ProfileForm` (อายุเป็นจำนวนเต็ม 0–120 ว่างได้; ตั้งครรภ์/ให้นมบุตร เป็น select 3 ค่า ไม่ระบุ/ใช่/ไม่ใช่ (ห้ามใช้ checkbox — ผู้ใช้ที่ไม่ได้ติ๊กจะถูกตีเป็น "ไม่ตั้งครรภ์" ซึ่งผิดกฎ R1 เดิม ดูสถานการณ์ 10); โรค/สภาวะเป็น checkbox จาก `meta.conditions`), `MyData` (ส่งออก JSON ดาวน์โหลด, นำเข้า `<input type="file">` ตรวจทั้งไฟล์แล้วแจ้งผล, ปุ่ม "ลบข้อมูลทั้งหมด" ต้องยืนยันก่อน, ข้อความ `ข้อมูลอยู่ในเครื่องของคุณเท่านั้น` และถ้า `store.persistent===false` แสดง `ข้อมูลจะหายเมื่อปิดหน้านี้`), `PharmacistSummary` แสดงใบสรุปจาก `summary` ของ `/api/analyze` (ตารางธง, คำถามที่ควรถามต่อ, ยังไม่ได้ตรวจ, ขอบเขต, ปุ่ม ดาวน์โหลด JSON และ พิมพ์ — ย้ายโครงจาก `renderResult` ส่วน p2 ของหน้าเก่า ซ้ำพฤติกรรมไม่เปลี่ยน), `History` รายการที่หยุดแล้วพร้อมช่วงวันที่ ไม่ตรวจย้อนหลัง, `Glossary` และ `FeedbackCard` ตามพฤติกรรมเดิม (feedback ส่งไป `/api/feedback` เหมือนเดิม; ห้ามแนบข้อมูลสุขภาพของผู้ใช้ในข้อเสนอแนะ)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**: โปรไฟล์ `ไม่ระบุ` ไม่ส่งคีย์ pregnant ใน payload (ผ่าน `buildPayload`) และผู้ใช้เปลี่ยนเป็น `ไม่ใช่` ส่ง `false`; ส่งออกแล้วนำเข้าได้ข้อมูลเดิม; ไฟล์ผิดรูป → ข้อความไทยและข้อมูลเดิมไม่เปลี่ยน; ลบข้อมูลต้องกดยืนยันและล้างรายการ/โปรไฟล์/localStorage; `store.persistent=false` แสดงแบนเนอร์; ใบสรุปแสดงขอบเขตและ `disclaimer_th`; History ไม่มีปุ่มตรวจย้อนหลัง; การนำทางด้วยลูกศร/Home/End ระหว่างแท็บ (เทียบสถานการณ์ 4, 11); ฟอร์มข้อเสนอแนะไม่ส่งรายการสมุนไพร/โปรไฟล์ของผู้ใช้
- [ ] **Step 2–4:** รันให้ล้ม · เขียนโค้ด · รันให้ผ่าน (`cd web && npm test && npm run typecheck`)
- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: history, my data (profile, export/import/delete), pharmacist summary"`

---

### Task 10: ย้ายแชต (ปุ่มลอย แผง ประวัติ ฉุกเฉิน) ไปเป็นคอมโพเนนต์

**Files:**
- Create: `web/src/chat/chatStore.ts`, `web/src/chat/ChatPanel.tsx`, `web/src/chat/ChatFab.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles/base.css` (สไตล์แชต ใช้โทเคนใหม่ จำกัดขอบเขตเฉพาะ `#chatPanel .cmsg` ตามบทเรียนจากรีวิวเดิมที่ `.msg` ไม่ขอบเขตไปกระทบการ์ดธง)
- Test: `web/src/chat/chat.test.tsx`

**Interfaces:**
- Consumes: `ask()` (3), `useAnalysis` ผล/สถานะ (7), `TrackerStore` (4), `Meta.chat_followups_th` (ชิปเริ่มต้นจาก `/api/meta` ไม่ฝังเอง)
- Produces: พฤติกรรมเท่ากับสถานการณ์ 15–23 ของ `scripts/ui_dom_test.js`: ปุ่มลอยมี `aria-label/aria-expanded/aria-controls`; แผง `role="dialog"` ไม่เป็น modal; Esc ปิดและคืนโฟกัส; เปิดแล้วโฟกัสไปช่องพิมพ์; ประวัติใน `sessionStorage` key `hg_chat_v1` รูป `{v:1, msgs:[...]}` สูงสุด 50 ข้อความ เก็บเฉพาะข้อความ (ห้ามมีโปรไฟล์/ยา/วันที่เริ่ม — เทสต์ตรวจ key ของ storage); storage ใช้ไม่ได้ต้องไม่พัง; ปุ่ม "ล้างประวัติ" (ล้างระหว่างรอ → คำตอบที่มาทีหลังถูกทิ้ง); `role="log"`; คำตอบฉุกเฉิน `role="alert"`; ป้ายที่มา (`ฐานข้อมูล`/`AI เรียบเรียง`/ข้อความตายตัว) และ "ดูหลักฐาน"; คำตอบหลังผู้ใช้แก้รายการ (ผลเปลี่ยน) ติดข้อความ `อ้างอิงผลตรวจก่อนที่คุณจะแก้ข้อมูล — กดตรวจใหม่เพื่ออัปเดต` (ทั้งคำตอบที่ถามหลังแก้และคำตอบที่กำลังรอข้ามการแก้); ปุ่ม "ถามต่อ" จากธง; ข้อความผิดพลาดไทยตายตัว (ไม่แสดงรหัสดิบ: 500/ไม่ใช่ JSON/รูปตอบผิด → ข้อความตายตัว; 503 ใช้ข้อความเซิร์ฟเวอร์); ป้องกันกดส่งซ้ำ (`aria-disabled`); แถบ `ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · … · ห้ามพิมพ์ข้อมูลส่วนตัว` + ขอบเขต (สมุนไพร X จาก 50 ชนิด · N กลุ่มยา) แสดงถาวร; ส่ง `/api/ask` ด้วย `herbs/drugs/profile` จากรายการที่กำลังใช้ (ผ่าน `buildPayload`) + `question` + `context_herbs` เท่านั้น ไม่ส่งประวัติแชต; ถามตอนไม่มีสมุนไพรในรายการ → เซิร์ฟเวอร์ตอบ "ยังไม่มีผลตรวจ" ตามเดิม (ไม่ต้องเรียกพิเศษ)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** ทีละสถานการณ์ 15–23 (อ่านแต่ละ `console.log("== N)` ใน `scripts/ui_dom_test.js` บรรทัด 232–400 แล้วแปลงทุก `ok(...)` เป็น `expect(...)` ของเทสต์ใหม่ หนึ่งเทสต์ต่อหนึ่งข้ออ้างสำคัญ; fetch จำลองคืนรูปคำตอบ `/api/ask` จริง (ดู `engine/tests/test_api.py` และ `service.ask`)); เพิ่มเทสต์ใหม่: key ของ `sessionStorage` มีเฉพาะ `v`/`msgs`; ข้อความ `.cmsg` ฝัง `<img onerror>` ไม่สร้าง element
- [ ] **Step 2–4:** รันให้ล้ม · เขียนโค้ด · รันให้ผ่าน (`cd web && npm test && npm run typecheck`)
- [ ] **Step 5: Commit** — `git add web/src && git commit -m "web: chat panel ported as components"`

---

### Task 11: เทสต์ความเท่าเทียมกับหน้าเก่า + เทสต์สแกนซอร์ส + SEO

**Files:**
- Create: `web/src/parity/scenarios.md` (ตาราง "สถานการณ์เดิม → ไฟล์/ชื่อเทสต์ใหม่" ครบ 0–23), `web/src/source-scan.test.ts`, `web/src/seo.test.ts`
- Modify: เทสต์ที่ขาดตามตาราง

**Interfaces:**
- Produces: ตาราง mapping ที่ทุกแถวชี้ไปเทสต์ที่มีอยู่จริง (ผู้ทำต้องรัน `grep` ชื่อเทสต์ยืนยัน); สแกนซอร์ส `web/src/**/*.{ts,tsx}` (ไม่รวมไฟล์ `*.test.*`): ไม่มี `dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML`; ไม่มีคำว่า `ปลอดภัย` ยกเว้นรูปปฏิเสธที่อนุญาต (`ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม`/ไม่มีคำนี้เลยจะดีที่สุด); ไม่มีค่าสี hue เขียวในโทเคน noflag; ปุ่มมี `min-height:44px`; `seo.test.ts` ตรวจ `web/index.html`: `lang="th"`, `<title>`, meta description, `robots noindex` (ค่าเดียวกับ `public/index.html` ที่คัดลอกมา), ไม่มี canonical/sitemap (ตามสถานการณ์ 0 เดิมและหมายเหตุใน hackathon.md ข้อ go-live)

- [ ] **Step 1:** อ่านสถานการณ์ 0–14 ของ `scripts/ui_dom_test.js` (บรรทัด 66–231) ที่ยังไม่ถูกครอบคลุมโดยงาน 7–10 แล้วเขียนเทสต์ใหม่ที่ตรวจเรื่องเดียวกัน: 0 (โครงหน้า/SEO), 2 (ตรวจโดยไม่เลือกอะไร → ข้อความไทย ไม่มี error), 3 (ขิง+กระเทียม+warfarin อายุ 60 ได้ธงตามที่ engine คืน — ใช้ fetch จำลองคืนผลจริงที่จับมาจาก `python -c` เรียก `engine.service.run` เก็บเป็น fixture JSON ใน `web/src/test/fixtures/`), 5, 6, 9 (R3 + โรค), 10 (ตั้งครรภ์ 3 ค่า), 11 (ชื่อ/ARIA), 12 (ผลเก่าไม่ทับ), 13 (ตรวจล้มเหลวไม่ค้างข้อมูลเก่า), 14 (อายุผิด)
- [ ] **Step 2: รัน** `cd web && npm test` — ทุกเทสต์ผ่าน; ตาราง mapping ครบ
- [ ] **Step 3: Commit** — `git add web && git commit -m "web: parity tests for all legacy UI scenarios, source scans, SEO"`

---

### Task 12: ย้ายระบบ deploy + สลับหน้า + เอกสาร

**Files:**
- Modify: `vercel.json`, `scripts/dev_server.py` (เสิร์ฟ `web/dist` เมื่อมี; ไม่งั้นเสิร์ฟ `public/` เดิม), `CLAUDE.md` (เฉพาะส่วน "คำสั่ง" เพิ่มคำสั่ง npm — ห้ามแตะกฎเหล็ก), `hackathon.md`, `docs/architecture-dataflow.md`, `.vercelignore`
- Delete (หลังตรวจผ่านเท่านั้น): `public/index.html`, `scripts/ui_dom_test.js`, marker tests ใน `engine/tests/test_api.py`/`test_ui.py` ที่สแกน `public/index.html` (ย้ายเจตนาไปแล้วใน `web/src/source-scan.test.ts`; ตรวจให้แน่ใจว่าเทสต์ pytest ที่เหลือไม่อ้างไฟล์ที่ลบ)
- Keep: `public/robots.txt` (ย้ายเข้า `web/public/robots.txt` เพื่อให้ Vite คัดลอกลง `dist`)

**Interfaces:**
- Produces: `vercel.json` มี `"installCommand": "npm ci --prefix web"`, `"buildCommand": "npm run build --prefix web"`, `"outputDirectory": "web/dist"`, คง `functions` ของ `api/*.py` และ header ทั้งหมด (noindex, nosniff, DENY, no-referrer); ปรับ `includeFiles` ถ้า `"**"` ดึง `web/node_modules` เข้ากลุ่มฟังก์ชัน Python เกินขนาด (ใช้ `"{engine,data,api}/**"` ถ้าจำเป็น และบันทึกเหตุผล)

- [ ] **Step 1: ตรวจครบ** — Run: `PYTHONUTF8=1 python -m pytest engine/tests -q && PYTHONUTF8=1 python scripts/run_golden.py | tail -2 && PYTHONUTF8=1 python scripts/run_rag_eval.py | tail -5 && cd web && npm test && npm run build` · Expected: ผ่านทั้งหมด
- [ ] **Step 2: รันจริงในเครื่อง** — `python scripts/dev_server.py 8000` เสิร์ฟ `web/dist` + `/api/*`; เรียก `curl` ตรวจ `/`, `/api/meta` ได้ 200 (รายงานผลจริง; ยังไม่ได้ตรวจด้วยเบราว์เซอร์จริง ต้องบอกชัด)
- [ ] **Step 3: preview deploy (ต้องให้ผู้ใช้อนุมัติก่อน — เป็นการ push สาขาขึ้น GitHub ให้ Vercel สร้าง preview)** — **หยุดและถามผู้ใช้** ว่าจะ push สาขาแล้วทดสอบ preview หรือไม่; เมื่ออนุมัติ: push สาขา `tracker-redesign` ตรวจว่า build สำเร็จ, `/` แสดงหน้าใหม่, `/api/meta` และ `/api/analyze` ทำงาน, header ความปลอดภัยยังอยู่ ถ้า Vite กับฟังก์ชัน Python อยู่ร่วมกันไม่ได้ ให้หยุดและรายงานทางเลือก (เช่น แยกโปรเจกต์ Vercel สองโปรเจกต์) ห้ามเดา
- [ ] **Step 4: สลับและลบหน้าเก่า** เฉพาะเมื่อ Step 1–3 ผ่านและผู้ใช้เห็นชอบ
- [ ] **Step 5: เอกสาร** อัปเดต `hackathon.md` (สถานะงานย่อยที่ 1, ข้อค้าง, สิ่งที่ยังไม่ทดสอบ: เบราว์เซอร์จริง/screen reader/Vercel preview ถ้ายังไม่ได้ทำ, ข้อความตายตัวบนหน้าใหม่ที่รอทีมตัดสินตาม spec ข้อ 12) และ `docs/architecture-dataflow.md` (เพิ่ม web/ + ตัวติดตาม + ลำดับข้อมูล) และคำสั่งใน `CLAUDE.md` (เฉพาะบล็อก "คำสั่ง": `cd web && npm ci`, `npm test`, `npm run dev`, `npm run build`) ไม่แก้กฎเหล็ก
- [ ] **Step 6: Commit** — `git add -A web vercel.json scripts hackathon.md docs CLAUDE.md .vercelignore .gitignore && git commit -m "Switch site to the new web/ app; update deploy config and docs"` (ไม่ push; ผู้ใช้สั่ง push แยก)
