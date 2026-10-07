import { dayNumber, todayISO, validateStart } from "./dates";

test("start day is day 1; counts calendar days across DST boundaries", () => {
  expect(dayNumber("2026-10-07", "2026-10-07")).toBe(1);
  expect(dayNumber("2026-10-07", "2026-10-13")).toBe(7);
  expect(dayNumber("2026-03-28", "2026-04-02")).toBe(6); // ข้ามเปลี่ยนเวลาฤดูร้อนของหลายประเทศ ต้องไม่เพี้ยน
});

test("start date validation: future and >365 days ago rejected", () => {
  expect(validateStart("2026-10-08", "2026-10-07")).toMatch(/อนาคต/);
  expect(validateStart("2025-10-07", "2026-10-07")).toMatch(/365/); // วันที่ 366 ต้องถูกปฏิเสธ
  expect(validateStart("2025-10-08", "2026-10-07")).toBeNull(); // วันที่ 365 พอดี
  expect(validateStart("2026-02-30", "2026-10-07")).toMatch(/วันที่/);
  expect(validateStart("abc", "2026-10-07")).toMatch(/วันที่/);
  expect(validateStart("2026-10-07", "2026-10-07")).toBeNull();
});

test("todayISO uses local calendar date, zero padded", () => {
  expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
});

test("leap days and year boundaries", () => {
  expect(validateStart("2026-02-29", "2026-10-07")).toMatch(/วันที่/);
  expect(validateStart("2024-02-29", "2024-10-07")).toBeNull();
  expect(dayNumber("2024-02-28", "2024-03-01")).toBe(3);
  expect(dayNumber("2025-12-31", "2026-01-01")).toBe(2);
});
