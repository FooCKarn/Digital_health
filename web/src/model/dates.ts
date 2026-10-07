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
  if (Number.isNaN(n)) return "วันที่ไม่ถูกต้อง";
  if (n < 1) return "วันที่เริ่มเป็นอนาคตไม่ได้";
  if (n > 365) return "วันที่เริ่มต้องไม่เกิน 365 วันที่ผ่านมา";
  return null;
}
