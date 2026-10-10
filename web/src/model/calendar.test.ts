import { addDays, monthGrid, shiftMonth, thaiDate, weekday } from "./dates";
import { dayInfo, itemsOn, monthTotals } from "./calendar";
import type { DiaryState } from "./diary";
import type { TrackerItem } from "./tracker";

const it = (id: string, start: string, end: string | null = null): TrackerItem => ({ id, kind: "herb", ref: id, label: id, start_date: start, end_date: end });
const d0: DiaryState = { v: 1, entries: [], taken: {}, dose: {} };

test("addDays ข้ามเดือน/ปี/ปีอธิกสุรทิน และปฏิเสธวันที่ผิด", () => {
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addDays("2026-02-30", 1)).toBeNull();
});

test("monthGrid: ตุลาคม 2026 เริ่มวันพฤหัส มี 31 วัน แถวละ 7 ช่อง", () => {
  expect(weekday("2026-10-01")).toBe(4);
  const g = monthGrid(2026, 10);
  expect(g.every((w) => w.length === 7)).toBe(true);
  expect(g[0].slice(0, 4)).toEqual([null, null, null, null]);
  expect(g[0][4]).toBe("2026-10-01");
  expect(g.flat().filter(Boolean)).toHaveLength(31);
  expect(g.flat().filter(Boolean).at(-1)).toBe("2026-10-31");
  expect(monthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28);
  expect(monthGrid(2024, 2).flat().filter(Boolean)).toHaveLength(29);
});

test("shiftMonth ข้ามปี", () => {
  expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
  expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
  expect(shiftMonth(2026, 10, 0)).toEqual([2026, 10]);
});

test("thaiDate ใช้ พ.ศ.", () => {
  expect(thaiDate("2026-10-08")).toBe("8 ตุลาคม 2569");
});

test("itemsOn: นับเฉพาะช่วงที่ใช้ รวมวันที่หยุด", () => {
  const items = [it("a", "2026-10-02"), it("b", "2026-10-01", "2026-10-03")];
  expect(itemsOn(items, "2026-10-01").map((i) => i.id)).toEqual(["b"]);
  expect(itemsOn(items, "2026-10-03").map((i) => i.id)).toEqual(["a", "b"]);
  expect(itemsOn(items, "2026-10-04").map((i) => i.id)).toEqual(["a"]);
});

test("dayInfo/monthTotals นับจากที่บันทึกเท่านั้น", () => {
  const items = [it("a", "2026-10-01")];
  const d: DiaryState = { v: 1, entries: [{ id: "x", date: "2026-10-02", mood: 4, symptom: null, sys: null, dia: null, glucose: null, weight: null }], taken: { a: ["2026-10-02", "2026-10-05"] }, dose: {} };
  expect(dayInfo(items, d, "2026-10-02")).toEqual({ date: "2026-10-02", mood: 4, hasEntry: true, active: 1, taken: 1 });
  expect(dayInfo(items, d, "2026-10-03")).toMatchObject({ hasEntry: false, taken: 0, active: 1 });
  expect(monthTotals(items, d, ["2026-10-02", "2026-10-03"])).toEqual({ entryDays: 1, takenMarks: 1 });
  expect(dayInfo([], d0, "2026-10-02")).toMatchObject({ active: 0, taken: 0 });
});
