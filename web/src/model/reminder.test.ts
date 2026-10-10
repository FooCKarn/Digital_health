import { ReminderStore, REMINDER_KEY, hhmm } from "./reminder";
import type { KeyValueStorage } from "./tracker";

const mem = (init: Record<string, string> = {}): KeyValueStorage => { const d = { ...init }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const T = "2026-10-11";

test("ตั้งเวลา เตือนครั้งเดียวต่อวัน และเตือนเมื่อมีรายการที่ยังไม่กดเท่านั้น", () => {
  const r = new ReminderStore(mem());
  expect(r.shouldFire("21:00", T, true)).toBe(false); // ยังไม่ได้ตั้ง
  expect(r.setTime("20:30")).toBe(true);
  expect(r.shouldFire("20:29", T, true)).toBe(false);
  expect(r.shouldFire("20:30", T, false)).toBe(false); // กดครบแล้ว ไม่ต้องเตือน
  expect(r.shouldFire("20:30", T, true)).toBe(true);
  r.markFired(T);
  expect(r.shouldFire("23:00", T, true)).toBe(false);
  expect(r.shouldFire("20:31", "2026-10-12", true)).toBe(true); // วันถัดไปเตือนใหม่
});

test("เวลาผิดรูปแบบถูกปฏิเสธ ปิดเตือนได้ และอ่านค่าเสียจากที่เก็บแล้วเริ่มใหม่", () => {
  const st = mem();
  const r = new ReminderStore(st);
  expect(r.setTime("25:00")).toBe(false);
  expect(r.setTime("8:00")).toBe(false);
  r.setTime("08:00");
  expect(new ReminderStore(st).state.time).toBe("08:00");
  r.setTime(null);
  expect(new ReminderStore(st).state.time).toBeNull();
  expect(new ReminderStore(mem({ [REMINDER_KEY]: "{oops" })).state).toEqual({ time: null, last: null });
  expect(new ReminderStore(mem({ [REMINDER_KEY]: JSON.stringify({ time: "99:99", last: "x" }) })).state).toEqual({ time: null, last: null });
  expect(hhmm(new Date(2026, 9, 11, 7, 5))).toBe("07:05");
});
