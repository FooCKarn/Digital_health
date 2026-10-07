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
/**
 * ตัดคอมเมนต์ // และ /* *\/ ของ JS/TS โดยไม่แตะเนื้อในสตริง ' " ` (รวม ${...} ใน template) และ regex literal
 * ponytail: ตัวแยกคำแบบย่อ แยก regex กับเครื่องหมายหารจากอักขระก่อนหน้า พอสำหรับไฟล์เทสต์ ไม่ใช่ parser เต็ม
 */
function stripJs(s: string): string {
  let out = "";
  const tpl: number[] = []; // ความลึกวงเล็บปีกกาของ ${ ที่เปิดอยู่ (ซ้อนได้)
  let i = 0;
  const str = (q: string) => { // คัดลอกสตริงจนถึง q ที่ไม่ถูก escape
    const start = i++;
    while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; }
    out += s.slice(start, ++i);
  };
  const template = () => { // อยู่ในเนื้อ template ต่อจนจบ ` หรือเจอ ${
    const start = i;
    while (i < s.length && s[i] !== "`" && !(s[i] === "$" && s[i + 1] === "{")) { if (s[i] === "\\") i++; i++; }
    if (s[i] === "`") { out += s.slice(start, ++i); return; }
    out += s.slice(start, (i += 2));
    tpl.push(0);
  };
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const e = s.indexOf("*/", i + 2); i = e < 0 ? s.length : e + 2; out += " "; continue; }
    if (c === "'" || c === '"') { str(c); continue; }
    if (c === "`") { out += c; i++; template(); continue; }
    if (tpl.length && c === "{") tpl[tpl.length - 1]++;
    if (tpl.length && c === "}") {
      if (tpl[tpl.length - 1] === 0) { tpl.pop(); out += c; i++; template(); continue; }
      tpl[tpl.length - 1]--;
    }
    if (c === "/" && /(^|[(,=:[!&|?{};+\-*%~^]|\breturn)\s*$/.test(out.slice(-12))) { // regex literal
      const start = i++;
      let cls = false;
      while (i < s.length && s[i] !== "\n" && (cls || s[i] !== "/")) { if (s[i] === "\\") i++; else if (s[i] === "[") cls = true; else if (s[i] === "]") cls = false; i++; }
      out += s.slice(start, ++i);
      continue;
    }
    out += c; i++;
  }
  return out;
}
const stripPy = (s: string) => s.replace(/#.*$/gm, "");

/**
 * null = เทสต์ชื่อนี้มีอยู่และไม่มีทางถูกข้าม; ไม่งั้นคืนเหตุผล
 * ทั้งไฟล์ห้ามมี skip/only/todo/x* (only ตัวเดียวทำให้เทสต์อื่นในไฟล์ถูกข้าม) หรือ pytest skip/xfail
 * ชื่อต้องเป็นอาร์กิวเมนต์แรกของ test/it/describe (รวม .each ที่ชื่อเป็น template) หรือเป็นชื่อแถวแรกของตาราง .each
 */
function checkRef(file: string, name: string, raw: string): string | null {
  if (file.endsWith(".py")) {
    const src = stripPy(raw);
    const py = /pytest\.mark\.(skip|skipif|xfail)\b|pytest\.(skip|xfail|importorskip)\(|@unittest\.(skip\w*|expectedFailure)|^pytestmark\s*=.*\b(skip\w*|xfail)\b|parametrize\([^)]*,\s*\[\s*\]\s*[,)]|^\s*@skip\w*\b|from (unittest|pytest) import[^\n]*\bskip/m;
    if (py.test(src)) return "ไฟล์มี pytest skip/xfail";
    return new RegExp(`^def ${esc(name)}\\(`, "m").test(src) ? null : `ไม่มี def ${name}(`;
  }
  const src = stripJs(raw);
  // skipIf/runIf/fails/only/todo, x*, ตัวเลือก { ..., skip: true } / { skip } และ ({ skip }) => skip()
  if (/\.(skip\w*|only|todo|runIf|fails)\b|\bx(it|test|describe)\(|[{,]\s*skip\b\s*[:,}]|\bskip\s*\(/.test(src)) return "ไฟล์มี skip/only/todo/x*";
  const q = "[\"'`]";
  // เนื้อใน .each(...) ห้ามข้ามไปถึงการเรียก test/it/describe ตัวอื่น (ผูกกับการเรียกเดียวกัน)
  // และห้ามเลยจุดปิดตาราง ])( ของ .each นั้น
  const same = "(?:(?!\\b(?:test|it|describe)\\b|\\]\\s*(?:as\\s+const\\s*)?\\)\\s*\\()[\\s\\S])*?";
  const firstArg = new RegExp(`\\b(test|it|describe)(\\.each\\(${same}(?:\\]\\s*(?:as\\s+const\\s*)?)?\\))?\\(\\s*${q}${esc(name)}`);
  const eachRow = new RegExp(`\\b(test|it|describe)\\.each\\(\\s*\\[${same}\\[\\s*${q}${esc(name)}`);
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
    ["test.skipIf", `test.skipIf(true)("${N}", () => {});`],
    ["describe.skipIf", `describe.skipIf(true)("กลุ่ม", () => { test("${N}", () => {}); });`],
    ["test.runIf", `test.runIf(false)("${N}", () => {});`],
    ["test.fails", `test.fails("${N}", () => {});`],
    ["ตัวเลือก { skip: true }", `test("${N}", { skip: true }, () => {});`],
    ["({ skip }) => skip()", `test("${N}", ({ skip }) => { skip(); });`],
    ["ตัวเลือก { retry: 1, skip: true }", `test("${N}", { retry: 1, skip: true }, () => {});`],
    ["ตัวเลือกแบบย่อ { skip }", `const skip = true;\ntest("${N}", { skip }, () => {});`],
    ["ชื่ออยู่ในคอมเมนต์ /* */ กลางบรรทัด", `foo(); /* test("${N}", () => {}) */\ntest("อื่น", () => {});`],
    ["ชื่ออยู่ในคอมเมนต์ // กลางบรรทัด", `foo(); // test("${N}", () => {})\ntest("อื่น", () => {});`],
    ["ชื่ออยู่หลัง each ของเทสต์อื่น ไม่ใช่การเรียกเดียวกัน", `test.each([[1]])("อื่น %s", () => {});\nconst x = [["${N}"]];\ntest("ข", () => {});`],
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
    ["unittest.skip", "@unittest.skip('x')\ndef test_a():\n    pass\n"],
    ["importorskip", "np = pytest.importorskip('numpy')\ndef test_a():\n    pass\n"],
    ["pytestmark skip", "pytestmark = pytest.mark.skip\ndef test_a():\n    pass\n"],
    ["parametrize ว่าง", "@pytest.mark.parametrize('x', [])\ndef test_a(x):\n    pass\n"],
    ["from unittest import skip + @skip", "from unittest import skip\n\n@skip('x')\ndef test_a():\n    pass\n"],
    ["@skip อย่างเดียว", "@skip('x')\ndef test_a():\n    pass\n"],
    ["from pytest import skip", "from pytest import mark, skip\ndef test_a():\n    pass\n"],
  ])("pytest จับได้: %s", (_n, src) => {
    expect(checkRef("t.py", "test_a", src)).not.toBeNull();
  });

  test("pytest ผ่าน: def ปกติ (คอมเมนต์ที่มีคำว่า skip ไม่นับ)", () => {
    expect(checkRef("t.py", "test_a", "# pytest.mark.skip ไม่ใช้\ndef test_a():\n    pass\n")).toBeNull();
  });
});

describe("stripJs ตัดคอมเมนต์โดยไม่แตะสตริง/template/regex", () => {
  test.each([
    ["/* */ กลางบรรทัด", 'a(); /* ซ่อน */ b();', "a();   b();"],
    ["// กลางบรรทัด", 'a(); // ซ่อน\nb();', "a(); \nb();"],
    ["glob ในสตริงไม่ใช่คอมเมนต์", 'g("../x/*.json"); /* c */ h("*/");', 'g("../x/*.json");   h("*/");'],
    ["เครื่องหมายคำพูดซ้อน", `a("it's // no"); b('say "hi" /* no */'); // c`, `a("it's // no"); b('say "hi" /* no */'); `],
    ["template มี \${} ที่มีเครื่องหมายคำพูด", "t(`x ${f('a//b', \"}\")} /* in tpl */ y`); // c", "t(`x ${f('a//b', \"}\")} /* in tpl */ y`); "],
    ["template ซ้อนใน \${}", "t(`a ${`b ${1} //`} c`); /* c */", "t(`a ${`b ${1} //`} c`);  "],
    ["regex literal ที่มี // และเครื่องหมายคำพูด", String.raw`x = /"\/\/"[/]/g; // c`, String.raw`x = /"\/\/"[/]/g; `],
    ["การหารไม่ใช่ regex", "y = a / b; // c\nz = 1;", "y = a / b; \nz = 1;"],
  ])("%s", (_n, src, want) => {
    expect(stripJs(src)).toBe(want);
  });
});
