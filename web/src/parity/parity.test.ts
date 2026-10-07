// กันตาราง scenarios.md เน่า: ทุกสถานการณ์เดิมมีแถวครบ และทุกเทสต์ที่อ้างถึงมีอยู่จริงและถูกรันจริง
import { existsSync, readFileSync } from "node:fs";
import { parse } from "@babel/parser";
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
const stripPy = (s: string) => // ตัด # นอกสตริง ทีละบรรทัด (ponytail: ไม่รู้จัก triple-quote ข้ามบรรทัด)
  s.split("\n").map((l) => {
    let q = "";
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = ""; } else if (c === "'" || c === '"') q = c; else if (c === "#") return l.slice(0, i);
    }
    return l;
  }).join("\n");

const BAD_PROPS = new Set(["skip", "skipIf", "skipUnless", "only", "todo", "runIf", "fails"]);
const ROOTS = new Set(["test", "it", "describe"]);
/* eslint-disable @typescript-eslint/no-explicit-any */
let SRC = ""; // ซอร์สที่กำลังตรวจ
type N = any; // โหนด AST ของ @babel/parser
const unwrap = (n: N): N => (n && /^(TS(As|Satisfies|NonNull|TypeAssertion)Expression|ParenthesizedExpression)$/.test(n.type) ? unwrap(n.expression) : n);
const lit = (n: N): string | null => {
  n = unwrap(n);
  if (n?.type === "StringLiteral") return n.value;
  if (n?.type === "TemplateLiteral") return n.expressions.length ? SRC.slice(n.start + 1, n.end - 1) : n.quasis[0].value.cooked; // มี ${} คืนข้อความดิบ
  return null;
};
// ชื่อ key: identifier / "สตริง" / ['สตริง']
const keyName = (n: N): string | null => (n.computed ? lit(n.key) : n.key.type === "Identifier" ? n.key.name : lit(n.key));
const member = (n: N): string | null => (n.computed ? lit(n.property) : n.property?.name ?? null);
const isMember = (n: N) => n.type === "MemberExpression" || n.type === "OptionalMemberExpression";
const isCall = (n: N) => n.type === "CallExpression" || n.type === "OptionalCallExpression";
// callee ที่ราก test/it/describe (รวม .concurrent/.sequential/.each(...)); each = ตาราง .each(table)
function calleeInfo(e: N): { each?: N } | null {
  e = unwrap(e);
  if (e.type === "Identifier") return ROOTS.has(e.name) ? {} : null;
  if (isMember(e)) return calleeInfo(e.object);
  if (isCall(e) && isMember(unwrap(e.callee)) && member(unwrap(e.callee)) === "each" && calleeInfo(unwrap(e.callee).object)) return { each: e.arguments[0] };
  return null;
}

/**
 * null = เทสต์ชื่อนี้มีอยู่และไม่มีทางถูกข้าม; ไม่งั้นคืนเหตุผล
 * JS/TS: parse เป็น AST (คอมเมนต์/สตริงไม่ใช่โหนด จึงไม่หลอกตัวตรวจ) ไม่เขียนตัวแยกคำเอง
 * ponytail: ใช้ @babel/parser เพราะ typescript 7 ไม่มี compiler API แบบ JS แล้ว (เป็น dependency ทางอ้อมของ preact preset)
 * ทั้งไฟล์ห้ามมี skip/only/todo/runIf/fails/x*, option skip (ทุกรูปแบบคีย์), เรียก skip(...)
 * ชื่อต้องเป็นอาร์กิวเมนต์แรกของ test/it/describe (รวม .each ที่ชื่อเป็น template) หรือสมาชิกแรกของแถวในตาราง .each
 */
function checkJs(name: string, raw: string): string | null {
  SRC = raw;
  let ast;
  try { ast = parse(raw, { sourceType: "module", plugins: ["typescript", "jsx"] }); } catch (e) { return `parse ไม่ผ่าน (${(e as Error).message})`; } // แยกไม่ได้ = ไม่เชื่อ
  let bad: string | null = null, found = false;
  const hit = (n: N) => lit(n)?.startsWith(name) ?? false;
  const walk = (n: N): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n.type !== "string") return;
    if (isMember(n) && BAD_PROPS.has(member(n) ?? "")) bad = `.${member(n)}`;
    if ((n.type === "ObjectProperty" || n.type === "ObjectMethod") && keyName(n) === "skip") bad = "option/binding skip";
    if (isCall(n)) {
      const c = unwrap(n.callee);
      if (c.type === "Identifier" && (c.name === "skip" || /^x(it|test|describe)$/.test(c.name))) bad = `${c.name}()`;
      const info = calleeInfo(c);
      if (info) {
        if (hit(n.arguments[0])) found = true;
        const t = unwrap(info.each);
        if (t?.type === "ArrayExpression") for (const row of t.elements) {
          const r = unwrap(row);
          if (hit(r) || (r?.type === "ArrayExpression" && hit(r.elements[0]))) found = true;
        }
      }
    }
    for (const k of Object.keys(n)) if (k !== "loc" && k !== "extra" && k !== "leadingComments" && k !== "trailingComments" && k !== "innerComments") walk(n[k]);
  };
  walk(ast.program);
  if (bad) return `ไฟล์มี skip/only/todo/x* (${bad})`;
  return found ? null : `ไม่มีเทสต์ "${name}"`;
}

function checkRef(file: string, name: string, raw: string): string | null {
  if (!file.endsWith(".py")) return checkJs(name, raw);
  const src = stripPy(raw);
  const py = /pytest\.mark\.(skip|skipif|xfail)\b|pytest\.(skip|xfail|importorskip)\(|@unittest\.(skip\w*|expectedFailure)|@\w+\.(skip\w*|expectedFailure)\b|\b\w+\.skip(If|Unless)?\(|^pytestmark\s*=.*\b(skip\w*|xfail)\b|parametrize\([^)]*,\s*\[\s*\]\s*[,)]|^\s*@skip\w*\b|from (unittest|pytest) import[^\n]*\bskip/m;
  if (py.test(src)) return "ไฟล์มี pytest skip/xfail";
  return new RegExp(`^def ${esc(name)}\\(`, "m").test(src) ? null : `ไม่มี def ${name}(`;
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
    ["concurrent", `test.concurrent("${N}", () => {});`],
    ["regex/สตริงมี // ก่อน test จริง", `const r = /"/g; const u = "http://x"; // c\ntest("${N}", () => {});`],
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
    ["a++ / 2 แล้วคอมเมนต์", `y = a++ / 2; // test("${N}", f)`],
    ["a-- / 2 แล้วคอมเมนต์ block", `a-- / 2; /* test("${N}", f) */`],
    ["} / 2 แล้วคอมเมนต์", `y = x} / 2; // test("${N}", f)`],
    ["typeof regex แล้วคอมเมนต์", `x = typeof /"/;\n// test("${N}", f)`],
    ["case regex.source แล้วคอมเมนต์", `switch(x){case /"/.source: break}\n// test("${N}", f)`],
    ["คีย์ตัวเลือกเป็นสตริง", `test("${N}", { retry: 1, "skip": true }, fn);`],
    ["คีย์ตัวเลือกแบบ computed", `test("${N}", { ['skip']: true }, fn);`],
    ["test['skip']", `test['skip']("${N}", fn);`],
    ["ctx.skip()", `test("${N}", (ctx) => { ctx.skip(); });`],
    ["test.concurrent.skip", `test.concurrent.skip("${N}", fn);`],
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
    ["import unittest as u + @u.skip", "import unittest as u\n\n@u.skip('x')\ndef test_a():\n    pass\n"],
    ["alias skipIf", "import unittest as u\n@u.skipIf(True, 'x')\ndef test_a():\n    pass\n"],
    ["def อยู่ในคอมเมนต์ #", "# def test_a():\ndef test_b():\n    pass  # def test_a():\n"],
    ["from pytest import skip", "from pytest import mark, skip\ndef test_a():\n    pass\n"],
  ])("pytest จับได้: %s", (_n, src) => {
    expect(checkRef("t.py", "test_a", src)).not.toBeNull();
  });

  test("pytest ผ่าน: # ในสตริงไม่ใช่คอมเมนต์", () => {
    expect(checkRef("t.py", "test_a", "X = '#'\ndef test_a():\n    pass\n")).toBeNull();
  });

  test("pytest ผ่าน: def ปกติ (คอมเมนต์ที่มีคำว่า skip ไม่นับ)", () => {
    expect(checkRef("t.py", "test_a", "# pytest.mark.skip ไม่ใช้\ndef test_a():\n    pass\n")).toBeNull();
  });
});
