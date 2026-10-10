import type { KeyValueStorage } from "./tracker";

/**
 * เตือนให้บันทึกการใช้ประจำวัน: เก็บเวลาในเครื่องเท่านั้น ทำงานขณะเปิดหน้าเว็บนี้ค้างไว้ในเบราว์เซอร์
 * (ไม่มีเซิร์ฟเวอร์ส่งแจ้งเตือน จึงไม่ส่งข้อมูลใดออกจากเครื่อง) ข้อความแจ้งเตือนไม่ใส่ชื่อยา
 */
export const REMINDER_KEY = "hg_reminder_v1";
export interface ReminderState { time: string | null; last: string | null }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReminderStore {
  private _s: ReminderState = { time: null, last: null };
  private subs = new Set<() => void>();
  constructor(private storage: KeyValueStorage | null) {
    try {
      const raw = storage?.getItem(REMINDER_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        this._s = { time: typeof o?.time === "string" && TIME.test(o.time) ? o.time : null, last: typeof o?.last === "string" && DATE.test(o.last) ? o.last : null };
      }
    } catch { /* เริ่มใหม่ */ }
  }
  get state(): ReminderState { return this._s; }
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => void this.subs.delete(fn); }
  private commit(s: ReminderState) {
    this._s = s;
    try { this.storage?.setItem(REMINDER_KEY, JSON.stringify(s)); } catch { /* ใช้ได้ต่อโดยไม่จำค่า */ }
    this.subs.forEach((f) => f());
  }
  /** null = ปิดเตือน; เวลาไม่ถูกรูปแบบ HH:MM = false */
  setTime(time: string | null): boolean {
    if (time !== null && !TIME.test(time)) return false;
    this.commit({ time, last: null });
    return true;
  }
  markFired(today: string): void { this.commit({ ...this._s, last: today }); }
  /** ถึงเวลาแล้ว วันนี้ยังไม่เตือน และยังมีรายการที่ไม่ได้กดว่าใช้ */
  shouldFire(nowHHMM: string, today: string, hasUntaken: boolean): boolean {
    return this._s.time !== null && this._s.last !== today && hasUntaken && nowHHMM >= this._s.time;
  }
}

export const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
