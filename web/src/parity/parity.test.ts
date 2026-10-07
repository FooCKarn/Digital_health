// กันตาราง scenarios.md เน่า: ทุกสถานการณ์เดิมมีแถวครบ และทุกเทสต์ที่อ้างถึงมีอยู่จริงและถูกรันจริง
import { existsSync, readFileSync } from "node:fs";
import table from "./scenarios.md?raw";

const ROOT = ".."; // npm test รันจาก web/
const legacy = readFileSync(`${ROOT}/scripts/ui_dom_test.js`, "utf8");

// จำนวน ok( ต่อสถานการณ์ในสคริปต์เดิม
const okCount = new Map<number, number>();
const parts = legacy.split(/console\.log\("== (\d+)\)/);
for (let i = 1; i < parts.length; i += 2) okCount.set(Number(parts[i]), (parts[i + 1].match(/\bok\(/g) ?? []).length);

type Row = { id: string; scenario: number; status: string; cover: string };
const rows: Row[] = table.split(/\r?\n/) // checkout บน Windows (autocrlf) ได้ CRLF
  .map((l) => l.match(/^\| (\d+)\.(\d+) \| [^|]+ \| ([^|]+) \| (.+) \|$/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => ({ id: `${m[1]}.${m[2]}`, scenario: Number(m[1]), status: m[3].trim(), cover: m[4] }));
const refs = (cover: string) => [...cover.matchAll(/`([^`:]+)::([^`]+)`/g)].map((m) => ({ file: m[1], name: m[2] }));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// ตัดเฉพาะคอมเมนต์ที่ขึ้นต้นบรรทัด/JSX (glob อย่าง "*.json" ในสตริงไม่ถูกตัด) คอมเมนต์ท้ายบรรทัดที่เหลือทำให้เข้มขึ้นเท่านั้น
const stripJs = (s: string) => s.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const stripPy = (s: string) => s.replace(/#.*$/gm, "");

/**
 * null = เทสต์ชื่อนี้มีอยู่และไม่มีทางถูกข้าม; ไม่งั้นคืนเหตุผล
 * ทั้งไฟล์ห้ามมี skip/only/todo/x* (only ตัวเดียวทำให้เทสต์อื่นในไฟล์ถูกข้าม) หรือ pytest skip/xfail
 * ชื่อต้องเป็นอาร์กิวเมนต์แรกของ test/it/describe (รวม .each ที่ชื่อเป็น template) หรือเป็นชื่อแถวแรกของตาราง .each
 */
function checkRef(file: string, name: string, raw: string): string | null {
  if (file.endsWith(".py")) {
    const src = stripPy(raw);
    if (/pytest\.mark\.(skip|skipif|xfail)\b|pytest\.(skip|xfail)\(/.test(src)) return "ไฟล์มี pytest skip/xfail";
    return new RegExp(`^def ${esc(name)}\\(`, "m").test(src) ? null : `ไม่มี def ${name}(`;
  }
  const src = stripJs(raw);
  if (/\.(skip|only|todo)\b|\bx(it|test|describe)\(/.test(src)) return "ไฟล์มี skip/only/todo/x*";
  const q = "[\"'`]";
  const firstArg = new RegExp(`\\b(test|it|describe)(\\.each\\([\\s\\S]*?\\))?\\(\\s*${q}${esc(name)}`);
  const eachRow = new RegExp(`\\b(test|it|describe)\\.each\\(\\s*\\[[\\s\\S]*?\\[\\s*${q}${esc(name)}`);
  return firstArg.test(src) || eachRow.test(src) ? null : `ไม่มีเทสต์ "${name}"`;
}

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

test("ทุกเทสต์ที่อ้างถึงมีอยู่จริงในไฟล์นั้น และไฟล์ไม่มีทางข้ามเทสต์", () => {
  const all = rows.flatMap((r) => refs(r.cover).map((x) => ({ ...x, id: r.id })));
  expect(all.length).toBeGreaterThan(100);
  const bad: string[] = [];
  for (const { id, file, name } of all) {
    const path = `${ROOT}/${file}`;
    if (!existsSync(path)) { bad.push(`${id}: ไม่มีไฟล์ ${file}`); continue; }
    const why = checkRef(file, name, readFileSync(path, "utf8"));
    if (why) bad.push(`${id}: ${file}: ${why}`);
  }
  expect(bad).toEqual([]);
});

describe("ตัวตรวจ checkRef จับการข้ามเทสต์ได้ (ซอร์สปลอมในสตริง ไม่ได้รันจริง)", () => {
  const N = "ชื่อเทสต์";
  test.each([
    ["test ปกติ", `test("${N} ยาว", () => {});`],
    ["it + backtick", "it(`" + N + "`, () => {});"],
    ["describe", `describe('${N}', () => {});`],
    ["test.each ชื่อเป็น template", `test.each([[1], [2]])("${N} %s", (x) => {});`],
    ["ชื่อเป็นแถวแรกของตาราง each", `test.each([\n  ["อื่น", 1],\n  ["${N} ข", 2],\n] as const)("%s", () => {});`],
    ["คอมเมนต์ที่มีคำว่า .skip ไม่นับ", `// ห้ามใช้ it.skip\ntest("${N}", () => {});`],
  ])("ผ่าน: %s", (_n, src) => {
    expect(checkRef("a.test.ts", N, src)).toBeNull();
  });

  test.each([
    ["describe.skip", `describe.skip("กลุ่ม", () => { test("${N}", () => {}); });`],
    ["test.skip", `test.skip("${N}", () => {});`],
    ["test.skip.each", `test.skip.each([[1]])("${N} %s", () => {});`],
    ["it.todo", `it.todo("${N}");`],
    ["xit", `xit("${N}", () => {});`],
    ["xtest", `xtest("${N}", () => {});`],
    ["xdescribe", `xdescribe("กลุ่ม", () => { it("${N}", () => {}); });`],
    ["sibling .only", `test("${N}", () => {});\ntest.only("อีกตัว", () => {});`],
    ["describe.only", `describe.only("อื่น", () => {});\ntest("${N}", () => {});`],
    ["ชื่ออยู่แค่ในคอมเมนต์", `// test("${N}")\ntest("อื่น", () => {});`],
    ["ชื่ออยู่ในสตริงทั่วไป ไม่ใช่ชื่อเทสต์", `const s = "${N}";\ntest("อื่น", () => {});`],
  ])("จับได้: %s", (_n, src) => {
    expect(checkRef("a.test.ts", N, src)).not.toBeNull();
  });

  test.each([
    ["mark.skip", "@pytest.mark.skip(reason='x')\ndef test_a():\n    pass\n"],
    ["mark.skipif", "@pytest.mark.skipif(True, reason='x')\ndef test_a():\n    pass\n"],
    ["mark.xfail", "@pytest.mark.xfail\ndef test_a():\n    pass\n"],
    ["pytest.skip()", "def test_a():\n    pytest.skip('x')\n"],
    ["ไม่มีฟังก์ชัน", "def test_b():\n    pass\n"],
  ])("pytest จับได้: %s", (_n, src) => {
    expect(checkRef("t.py", "test_a", src)).not.toBeNull();
  });

  test("pytest ผ่าน: def ปกติ (คอมเมนต์ที่มีคำว่า skip ไม่นับ)", () => {
    expect(checkRef("t.py", "test_a", "# pytest.mark.skip ไม่ใช้\ndef test_a():\n    pass\n")).toBeNull();
  });
});
