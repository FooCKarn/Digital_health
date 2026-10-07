// สแกนซอร์สหน้าเว็บ (ไม่รวมไฟล์เทสต์และ src/test/) ตามสเปก §10 และ CLAUDE.md ข้อ 5/10
// สีที่ไม่ใช่เขียวของ no_flag และปุ่มสูง 44px ตรวจใน styles/contrast.test.ts
import indexHtml from "../index.html?raw";

const all = import.meta.glob<string>("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const css = import.meta.glob<string>("./**/*.css", { query: "?raw", import: "default", eager: true });
const src = Object.fromEntries(Object.entries(all).filter(([p]) => !/\.test\.|^\.\/test\//.test(p)));
const files = Object.entries(src);

// ตัดคอมเมนต์ออก (คอมเมนต์อธิบายธุรกิจพูดถึงคำต้องห้ามได้) เหลือโค้ด/ข้อความที่ผู้ใช้เห็น
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const hits = (re: RegExp, list: [string, string][] = files) => list.filter(([, s]) => re.test(code(s))).map(([p]) => p);

test("พบไฟล์ซอร์สจริง (กันการสแกนว่างเปล่า)", () => {
  expect(Object.keys(src)).toEqual(expect.arrayContaining(["./App.tsx", "./api.ts", "./components/FlagCard.tsx", "./chat/ChatPanel.tsx"]));
  expect(Object.keys(src).some((p) => p.includes(".test."))).toBe(false);
});

test("โค้ดแอปไม่ import โมดูลของ node (node:*) — ใช้ได้เฉพาะเทสต์และ src/test/node-fs.d.ts", () => {
  expect(hits(/from\s+["']node:|require\(\s*["']node:|import\(\s*["']node:/)).toEqual([]);
});

test("ไม่มี API ที่แปลงข้อความเป็น HTML/โค้ด", () => {
  expect(hits(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(|new Function\(/)).toEqual([]);
});

test("ไม่มีคำว่า ปลอดภัย ในข้อความที่ผู้ใช้เห็น (ซอร์สและ index.html) นอกรูปปฏิเสธ", () => {
  const visible = (s: string) => code(s).replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "");
  expect(files.filter(([, s]) => visible(s).includes("ปลอดภัย")).map(([p]) => p)).toEqual([]);
  expect(indexHtml.replace(/<!--[\s\S]*?-->/g, "")).not.toContain("ปลอดภัย");
});

test("ไม่มีคำขอไปบริการภายนอก: ไม่มี http(s):// ในโค้ด/CSS และ index.html ไม่โหลดอะไรจากนอกโดเมน (favicon data: ได้)", () => {
  expect(hits(/https?:\/\//)).toEqual([]);
  expect(Object.entries(css).filter(([, s]) => /https?:\/\/|@import\s+url\(\s*["']?\/\//.test(s)).map(([p]) => p)).toEqual([]);
  const tags = indexHtml.replace(/<!--[\s\S]*?-->/g, "");
  expect(tags).not.toMatch(/\b(src|href)\s*=\s*["']?(https?:)?\/\//i);
  expect(tags).not.toMatch(/@import|url\(\s*["']?https?:/i);
  expect([...tags.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)/g)].map((m) => m[1]).every((u) => u.startsWith("/") || u.startsWith("data:"))).toBe(true);
});

test("fetch เรียกเฉพาะ /api/* และมีที่เดียวคือ api.ts", () => {
  expect(hits(/\bfetch\(/)).toEqual(["./api.ts"]);
  expect(hits(/XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\(\s*["'`]http/)).toEqual([]);
  const api = code(src["./api.ts"]);
  const urls = [...api.matchAll(/(?<!function )\b(?:call|post)(?:<[^>]*>)?\(\s*([^,]+),/g)].map((m) => m[1].trim());
  // post() ส่ง url ของตัวเองต่อให้ call() ได้ครั้งเดียว ที่เหลือต้องเป็นค่าคงที่ /api/*
  expect(urls.filter((u) => u === "url")).toHaveLength(1);
  const literal = urls.filter((u) => u !== "url");
  expect(literal.length).toBeGreaterThanOrEqual(6);
  for (const u of literal) expect(u).toMatch(/^"\/api\/[a-z]+"$/);
  // จุดเดียวที่ส่งต่อ url เข้า fetch คือ call() ที่รับ url จาก post/getMeta ข้างบน
  expect([...api.matchAll(/\bfetch\(([^,)]+)/g)].map((m) => m[1])).toEqual(["url"]);
});

test("ที่เก็บในเบราว์เซอร์ใช้แค่ hg_tracker_v1 และ hg_diary_v1 (localStorage) กับ hg_chat_v1 (sessionStorage)", () => {
  expect(hits(/\b(localStorage|sessionStorage)\b/)).toEqual(["./chat/chatStore.ts", "./model/storage.ts"]);
  expect(hits(/document\.cookie|indexedDB|caches\.open/)).toEqual([]);
  expect(code(src["./model/tracker.ts"])).toMatch(/STORAGE_KEY = "hg_tracker_v1"/);
  expect(code(src["./model/diary.ts"])).toMatch(/DIARY_KEY = "hg_diary_v1"/);
  expect(code(src["./chat/chatStore.ts"])).toMatch(/CHAT_KEY = "hg_chat_v1"/);
  // store.removeItem(id) คือเมธอดของ TrackerStore ไม่ใช่ Web Storage
  const keys = files.flatMap(([p, s]) => [...code(s).matchAll(/(\w+)\??\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)]
    .filter((m) => m[1] !== "store").map((m) => `${p}:${m[2].trim()}`));
  expect(keys.length).toBeGreaterThanOrEqual(8);
  for (const k of keys) {
    // storage.ts เขียนคีย์ทดสอบชั่วคราวแล้วลบทันที เพื่อดูว่าเบราว์เซอร์ให้บันทึกได้ไหม
    expect(["STORAGE_KEY", "CHAT_KEY", "DIARY_KEY"].includes(k.split(":")[1]) || k === "./model/storage.ts:k").toBe(true);
  }
  expect(code(src["./model/storage.ts"])).toMatch(/const k = "__hg_probe__";[\s\S]*removeItem\(k\)/);
});
