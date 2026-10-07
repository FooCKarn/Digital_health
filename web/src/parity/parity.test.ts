// กันตาราง scenarios.md เน่า: ทุกสถานการณ์เดิมมีแถวครบ และทุกเทสต์ที่อ้างถึงมีอยู่จริง (ไม่ถูก skip)
import { existsSync, readFileSync } from "node:fs";
import table from "./scenarios.md?raw";

const ROOT = ".."; // npm test รันจาก web/
const legacy = readFileSync(`${ROOT}/scripts/ui_dom_test.js`, "utf8");

// จำนวน ok( ต่อสถานการณ์ในสคริปต์เดิม
const okCount = new Map<number, number>();
const parts = legacy.split(/console\.log\("== (\d+)\)/);
for (let i = 1; i < parts.length; i += 2) okCount.set(Number(parts[i]), (parts[i + 1].match(/\bok\(/g) ?? []).length);

type Row = { id: string; scenario: number; status: string; cover: string };
const rows: Row[] = table.split("\n")
  .map((l) => l.match(/^\| (\d+)\.(\d+) \| [^|]+ \| ([^|]+) \| (.+) \|$/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => ({ id: `${m[1]}.${m[2]}`, scenario: Number(m[1]), status: m[3].trim(), cover: m[4] }));
const refs = (cover: string) => [...cover.matchAll(/`([^`:]+)::([^`]+)`/g)].map((m) => ({ file: m[1], name: m[2] }));

test("สคริปต์เดิมมีสถานการณ์ 0-23 และตารางมีแถวเท่ากับจำนวน ok( ทุกสถานการณ์", () => {
  expect([...okCount.keys()]).toEqual([...Array(24).keys()]);
  for (const [s, n] of okCount) expect([s, rows.filter((r) => r.scenario === s).length]).toEqual([s, n]);
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
});

test("ทุกแถวมีสถานะที่รู้จัก; mapped/GAP ต้องอ้างเทสต์; N/A ต้องมีเหตุผล", () => {
  for (const r of rows) {
    expect(["mapped", "GAP", "GAP+FIX", "N/A"]).toContain(r.status);
    if (r.status === "N/A") expect(r.cover.trim().length, r.id).toBeGreaterThan(20);
    else expect(refs(r.cover).length, r.id).toBeGreaterThan(0);
  }
});

test("ทุกเทสต์ที่อ้างถึงมีอยู่จริงในไฟล์นั้น และไม่ถูก skip", () => {
  const all = rows.flatMap((r) => refs(r.cover).map((x) => ({ ...x, id: r.id })));
  expect(all.length).toBeGreaterThan(100);
  const missing: string[] = [];
  for (const { id, file, name } of all) {
    const path = `${ROOT}/${file}`;
    if (!existsSync(path)) { missing.push(`${id}: ไม่มีไฟล์ ${file}`); continue; }
    const src = readFileSync(path, "utf8");
    // ชื่อต้องเป็นส่วนต้นของชื่อเทสต์ (ต้นสตริง) หรือชื่อฟังก์ชัน pytest
    const found = file.endsWith(".py") ? src.includes(`def ${name}(`) : ["\"", "'", "`"].some((q) => src.includes(q + name));
    if (!found) missing.push(`${id}: ${file} ไม่มีเทสต์ "${name}"`);
    else if (!file.endsWith(".py") && ["\"", "'", "`"].some((q) => new RegExp(`\\.(skip|todo)\\(\\s*${q}${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(src))) {
      missing.push(`${id}: ${file} "${name}" ถูก skip`);
    }
  }
  expect(missing).toEqual([]);
});
