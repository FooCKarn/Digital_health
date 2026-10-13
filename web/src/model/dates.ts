import { getLang, t } from "../i18n";

// คำนวณจากสตริง YYYY-MM-DD ด้วย UTC เท่านั้น ไม่ผูกกับ DST/เขตเวลา
const MS_DAY = 86400000;

function utcDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = Date.UTC(y, mo - 1, d);
  const c = new Date(t);
  // ตรวจวันที่จริง เช่น 2026-02-30 ไม่ผ่าน
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
  return t / MS_DAY;
}

export function isValidISODate(iso: unknown): iso is string {
  return typeof iso === "string" && utcDay(iso) !== null;
}

export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** วันเริ่ม = 1; คืน NaN ถ้าวันที่ผิดรูป */
export function dayNumber(startISO: string, todayISOStr: string): number {
  const a = utcDay(startISO);
  const b = utcDay(todayISOStr);
  return a === null || b === null ? NaN : b - a + 1;
}

/** วันที่เริ่มเมื่อวันนี้เป็นวันที่ n ของการใช้ (n=1 คือวันนี้); คืน null ถ้าผิดรูป */
export function startForDay(n: number, todayISOStr: string): string | null {
  const t = utcDay(todayISOStr);
  if (t === null || !Number.isInteger(n)) return null;
  return new Date((t - (n - 1)) * MS_DAY).toISOString().slice(0, 10);
}

export function validateStart(startISO: string, todayISOStr: string): string | null {
  const n = dayNumber(startISO, todayISOStr);
  if (Number.isNaN(n)) return t("วันที่ไม่ถูกต้อง", "Invalid date");
  if (n < 1) return t("วันที่เริ่มเป็นอนาคตไม่ได้", "The start date cannot be in the future");
  if (n > 365) return t("วันที่เริ่มต้องไม่เกิน 365 วันที่ผ่านมา", "The start date must be within the last 365 days");
  return null;
}

/** บวก/ลบวัน (n ติดลบได้) คืน YYYY-MM-DD; วันที่ผิดรูปคืน null */
export function addDays(iso: string, n: number): string | null {
  const t = utcDay(iso);
  if (t === null || !Number.isInteger(n)) return null;
  return new Date((t + n) * MS_DAY).toISOString().slice(0, 10);
}

/** วันในสัปดาห์ของวันที่ (0 = อาทิตย์) */
export function weekday(iso: string): number {
  const t = utcDay(iso);
  return t === null ? NaN : new Date(t * MS_DAY).getUTCDay();
}

/** เดือนปฏิทินเป็นแถวสัปดาห์ละ 7 ช่อง (เริ่มอาทิตย์) ช่องว่างนอกเดือนเป็น null; month = 1-12 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const p = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${p(month)}-01`;
  const lead = weekday(first);
  if (Number.isNaN(lead)) return [];
  const len = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: len }, (_, i) => `${year}-${p(month)}-${p(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** เลื่อนเดือน: คืน [ปี, เดือน 1-12] */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const i = year * 12 + (month - 1) + delta;
  return [Math.floor(i / 12), (i % 12) + 1];
}

export const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** ชื่อเดือน/วัน/ปีตามภาษาที่เลือก (ไทยใช้ พ.ศ. อังกฤษใช้ ค.ศ.) */
export const monthName = (m: number) => (getLang() === "en" ? EN_MONTHS : THAI_MONTHS)[m - 1];
export const weekdayName = (i: number) => (getLang() === "en" ? EN_WEEKDAYS : THAI_WEEKDAYS)[i];
export const displayYear = (y: number) => (getLang() === "en" ? y : y + 543);

/** "8 ตุลาคม 2569" (พ.ศ.) หรือ "8 October 2026" เมื่อเลือกภาษาอังกฤษ */
export function thaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || utcDay(iso) === null) return iso;
  return `${+m[3]} ${monthName(+m[2])} ${displayYear(+m[1])}`;
}
