import { buildBrief } from "./brief";
import type { TrackerItem } from "./tracker";
import type { AnalyzeResult } from "../types";

const T = "2026-10-11";
const it = (id: string, start: string): TrackerItem => ({ id, kind: "herb", ref: id, label: id, start_date: start, end_date: null });
const res = (sev: string[]) => ({ flags: sev.map((s) => ({ severity: s })), aggregates: [], coverage: { not_checked: [], unknown_inputs: [] } }) as unknown as AnalyzeResult;
const base = { today: T, hasEntryToday: false, notCheckedLabels: ["อายุ"], result: null, resultCurrent: false };

test("ไม่มีรายการ: ศูนย์ทุกค่า ไม่มีผลตรวจ", () => {
  const b = buildBrief({ ...base, items: [], isTaken: () => false });
  expect(b).toMatchObject({ itemCount: 0, untaken: [], takenCount: 0, warnings: null, longestUse: null, noEntryToday: true });
});

test("นับรายการที่ยังไม่ติ๊ก/ติ๊กแล้ว และวันใช้นานสุด (นับเฉพาะตั้งแต่ 2 วัน)", () => {
  const b = buildBrief({ ...base, items: [it("a", "2026-10-01"), it("b", T)], isTaken: (id) => id === "b" });
  expect(b.untaken.map((x) => x.id)).toEqual(["a"]);
  expect(b.takenCount).toBe(1);
  expect(b.longestUse).toEqual({ label: "a", days: 11 });
});

test("มีคำเตือน: นับทั้งหมดและควรหลีกเลี่ยง และแสดงเงื่อนไขที่ยังไม่ได้ตรวจ", () => {
  const b = buildBrief({ ...base, items: [it("a", T)], isTaken: () => true, hasEntryToday: true, result: res(["avoid", "caution"]), resultCurrent: true });
  expect(b.warnings).toEqual({ total: 2, avoid: 1 });
  expect(b.notChecked).toEqual(["อายุ"]);
  expect(b.noEntryToday).toBe(false);
});

test("ผลตรวจเก่า (ไม่ตรงข้อมูลปัจจุบัน) ไม่ถูกนำมาสรุป", () => {
  const b = buildBrief({ ...base, items: [it("a", T)], isTaken: () => false, result: res(["avoid"]), resultCurrent: false });
  expect(b.warnings).toBeNull();
  expect(b.notChecked).toEqual([]);
});
