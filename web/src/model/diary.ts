import { addDays, dayNumber, isValidISODate } from "./dates";
import type { KeyValueStorage } from "./tracker";

/**
 * บันทึกสุขภาพส่วนตัว + เช็กอินการใช้ (อยู่ใน localStorage ของผู้ใช้เท่านั้น ไม่ส่งขึ้นเซิร์ฟเวอร์)
 * ข้อห้ามของโมดูลนี้: ไม่แปลผลค่าสุขภาพ (ไม่มีคำว่าสูง/ต่ำ/ปกติ) และไม่ตัดสินความเสี่ยง
 * ช่วงตัวเลขด้านล่างเป็นแค่ตัวกันพิมพ์ผิด (ทีมตั้งเอง ไม่ใช่เกณฑ์ทางการแพทย์)
 */
export const DIARY_KEY = "hg_diary_v1";
export const MAX_DIARY_BYTES = 256 * 1024;
export const MAX_ENTRIES = 400;
export const MAX_NOTE = 200;

export const RANGES = {
  sys: [50, 260], dia: [30, 160], glucose: [20, 600], weight: [2, 300],
} as const;
export type VitalKey = keyof typeof RANGES;
export const VITAL_LABEL: Record<VitalKey, { th: string; unit: string }> = {
  sys: { th: "ความดันตัวบน", unit: "mmHg" },
  dia: { th: "ความดันตัวล่าง", unit: "mmHg" },
  glucose: { th: "น้ำตาลในเลือด", unit: "mg/dL" },
  weight: { th: "น้ำหนัก", unit: "กก." },
};
export const MOODS = [
  { v: 1, th: "แย่มาก" }, { v: 2, th: "ไม่ค่อยดี" }, { v: 3, th: "เฉย ๆ" }, { v: 4, th: "ดี" }, { v: 5, th: "ดีมาก" },
] as const;

export interface DiaryEntry {
  id: string; date: string;
  mood: number | null; symptom: string | null;
  sys: number | null; dia: number | null; glucose: number | null; weight: number | null;
}
export const MAX_DOSE = 60;
/** dose: ขนาด/ปริมาณที่ผู้ใช้จดเองต่อรายการ เป็นข้อความอิสระ ระบบไม่แปลผลและไม่ส่งขึ้นเซิร์ฟเวอร์ */
export interface DiaryState { v: 1; entries: DiaryEntry[]; taken: Record<string, string[]>; dose: Record<string, string> }
export type EntryInput = Omit<DiaryEntry, "id">;

const empty = (): DiaryState => ({ v: 1, entries: [], taken: {}, dose: {} });
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const bytes = (t: string) => new TextEncoder().encode(t).length;

function numOk(k: VitalKey, x: unknown): x is number | null {
  if (x === null) return true;
  return typeof x === "number" && Number.isFinite(x) && x >= RANGES[k][0] && x <= RANGES[k][1];
}

/** ตรวจหนึ่งรายการ คืนข้อความผิดพลาดหรือ null */
export function entryError(e: unknown, today: string): string | null {
  if (!isObj(e)) return "ข้อมูลไม่ถูกต้อง";
  if (!isValidISODate(e.date)) return "วันที่ไม่ถูกต้อง";
  if (dayNumber(e.date, today) < 1) return "วันที่เป็นอนาคตไม่ได้";
  if (!(e.mood === null || (typeof e.mood === "number" && Number.isInteger(e.mood) && e.mood >= 1 && e.mood <= 5))) return "ระดับความรู้สึกไม่ถูกต้อง";
  if (!(e.symptom === null || (typeof e.symptom === "string" && e.symptom.trim().length > 0 && e.symptom.length <= MAX_NOTE)))
    return `อาการต้องไม่เกิน ${MAX_NOTE} ตัวอักษร`;
  for (const k of Object.keys(RANGES) as VitalKey[]) {
    if (!numOk(k, e[k])) return `${VITAL_LABEL[k].th}ต้องอยู่ระหว่าง ${RANGES[k][0]}-${RANGES[k][1]} ${VITAL_LABEL[k].unit}`;
  }
  if ((e.sys === null) !== (e.dia === null)) return "ความดันต้องกรอกทั้งตัวบนและตัวล่าง";
  if (e.sys !== null && e.dia !== null && (e.sys as number) <= (e.dia as number)) return "ความดันตัวบนต้องมากกว่าตัวล่าง";
  if (e.mood === null && e.symptom === null && e.sys === null && e.glucose === null && e.weight === null) return "ยังไม่ได้กรอกอะไร";
  return null;
}

function parse(raw: unknown, today: string): DiaryState | string {
  const BAD = "ไฟล์บันทึกสุขภาพไม่ถูกต้อง";
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.entries) || !isObj(raw.taken)) return BAD;
  if (raw.entries.length > MAX_ENTRIES) return "จำนวนบันทึกเกินกำหนด";
  const entries: DiaryEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw.entries) {
    const err = entryError(e, today);
    if (err) return err;
    const x = e as DiaryEntry;
    if (typeof x.id !== "string" || !x.id || x.id.length > 64 || seen.has(x.id) || entries.some((y) => y.date === x.date)) return BAD;
    seen.add(x.id);
    entries.push({ id: x.id, date: x.date, mood: x.mood, symptom: x.symptom === null ? null : x.symptom.trim(), sys: x.sys, dia: x.dia, glucose: x.glucose, weight: x.weight });
  }
  const taken: Record<string, string[]> = {};
  const keys = Object.keys(raw.taken);
  if (keys.length > 300) return BAD;
  for (const k of keys) {
    const v = (raw.taken as Record<string, unknown>)[k];
    if (k.length > 64 || !Array.isArray(v) || v.length > MAX_ENTRIES) return BAD;
    const days = new Set<string>();
    for (const d of v) {
      if (!isValidISODate(d) || dayNumber(d, today) < 1) return BAD;
      days.add(d);
    }
    taken[k] = [...days].sort();
  }
  const dose: Record<string, string> = {};
  if (raw.dose !== undefined) {
    if (!isObj(raw.dose) || Object.keys(raw.dose).length > 300) return BAD;
    for (const [k, v] of Object.entries(raw.dose)) {
      if (k.length > 64 || typeof v !== "string" || v.length > MAX_DOSE) return BAD;
      if (v.trim()) dose[k] = v.trim();
    }
  }
  return { v: 1, entries: entries.sort((a, b) => a.date.localeCompare(b.date)), taken, dose };
}

export class DiaryStore {
  persistent: boolean;
  recovered = false;
  private _state: DiaryState = empty();
  private subs = new Set<() => void>();

  constructor(private storage: KeyValueStorage | null, private today: () => string) {
    this.persistent = storage !== null;
    if (!storage) return;
    let text: string | null;
    try { text = storage.getItem(DIARY_KEY); } catch { this.persistent = false; return; }
    if (text === null) return;
    try {
      const r = bytes(text) > MAX_DIARY_BYTES ? "big" : parse(JSON.parse(text), today());
      if (typeof r === "string") this.recovered = true; else this._state = r;
    } catch { this.recovered = true; }
  }

  get state(): DiaryState { return this._state; }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  private commit(next: DiaryState): void {
    this._state = next;
    if (this.storage && this.persistent) {
      try { this.storage.setItem(DIARY_KEY, JSON.stringify(next)); } catch { this.persistent = false; }
    }
    this.subs.forEach((f) => f());
  }

  /** หนึ่งวันมีหนึ่งบันทึก: บันทึกซ้ำวันเดิมจะแทนที่ */
  saveEntry(input: EntryInput): { ok: true } | { ok: false; message: string } {
    const clean: EntryInput = { ...input, symptom: input.symptom === null ? null : input.symptom.trim() || null };
    const err = entryError(clean, this.today());
    if (err) return { ok: false, message: err };
    const old = this._state.entries.find((e) => e.date === clean.date);
    if (!old && this._state.entries.length >= MAX_ENTRIES) return { ok: false, message: "จำนวนบันทึกเต็มแล้ว ลบบันทึกเก่าก่อน" };
    const id = old?.id ?? `d${clean.date}`;
    const rest = this._state.entries.filter((e) => e.date !== clean.date);
    this.commit({ ...this._state, entries: [...rest, { ...clean, id }].sort((a, b) => a.date.localeCompare(b.date)) });
    return { ok: true };
  }

  removeEntry(date: string): void {
    this.commit({ ...this._state, entries: this._state.entries.filter((e) => e.date !== date) });
  }

  entryOn(date: string): DiaryEntry | undefined { return this._state.entries.find((e) => e.date === date); }

  isTaken(itemId: string, date: string): boolean { return (this._state.taken[itemId] ?? []).includes(date); }

  /** สลับ "ใช้แล้ววันนี้"; วันอนาคตไม่ได้ */
  toggleTaken(itemId: string, date: string): boolean {
    if (!isValidISODate(date) || dayNumber(date, this.today()) < 1 || !itemId || itemId.length > 64) return false;
    const cur = this._state.taken[itemId] ?? [];
    const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date].sort().slice(-MAX_ENTRIES);
    const taken = { ...this._state.taken, [itemId]: next };
    if (next.length === 0) delete taken[itemId];
    this.commit({ ...this._state, taken });
    return true;
  }

  /**
   * ติ๊กว่าใช้ทุกวันตั้งแต่ start ถึง today (ผู้ใช้เลือกเองตอนเพิ่ม/แก้วันเริ่ม)
   * ไม่แตะวันที่เคยติ๊กไว้แล้ว คืนจำนวนวันที่เพิ่ม
   */
  markRange(itemId: string, start: string, end: string): number {
    if (!itemId || itemId.length > 64 || !isValidISODate(start) || !isValidISODate(end)) return 0;
    const last = Math.min(dayNumber(start, end), MAX_ENTRIES);
    if (dayNumber(end, this.today()) < 1 || last < 1) return 0;
    const cur = new Set(this._state.taken[itemId] ?? []);
    const before = cur.size;
    for (let k = 0; k < last; k++) { const d = addDays(end, -k); if (d) cur.add(d); }
    const next = [...cur].sort().slice(-MAX_ENTRIES);
    this.commit({ ...this._state, taken: { ...this._state.taken, [itemId]: next } });
    return Math.max(0, next.length - before);
  }

  /** ลบเช็กอินของรายการที่ถูกลบออกจากรายการใช้ (กันข้อมูลค้าง) */
  dropTaken(itemId: string): void {
    if (!(itemId in this._state.taken) && !(itemId in this._state.dose)) return;
    const taken = { ...this._state.taken };
    const dose = { ...this._state.dose };
    delete taken[itemId];
    delete dose[itemId];
    this.commit({ ...this._state, taken, dose });
  }

  /** จดขนาดที่ใช้ (ข้อความอิสระ); ว่าง = ลบ */
  setDose(itemId: string, text: string): { ok: true } | { ok: false; message: string } {
    const t = text.trim();
    if (!itemId || itemId.length > 64) return { ok: false, message: "รายการไม่ถูกต้อง" };
    if (t.length > MAX_DOSE) return { ok: false, message: `จดได้ไม่เกิน ${MAX_DOSE} ตัวอักษร` };
    const dose = { ...this._state.dose };
    if (t) dose[itemId] = t; else delete dose[itemId];
    this.commit({ ...this._state, dose });
    return { ok: true };
  }

  doseOf(itemId: string): string { return this._state.dose[itemId] ?? ""; }

  exportJSON(): string { return JSON.stringify(this._state); }

  importJSON(text: string): { ok: true } | { ok: false; message: string } {
    if (typeof text !== "string" || bytes(text) > MAX_DIARY_BYTES) return { ok: false, message: "ไฟล์ใหญ่เกิน 256 KB" };
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, message: "อ่านไฟล์ไม่ได้ ใช้ไฟล์ที่ส่งออกจากแอปนี้เท่านั้น" }; }
    const r = parse(raw, this.today());
    if (typeof r === "string") return { ok: false, message: r };
    this.commit(r);
    return { ok: true };
  }

  clearAll(): boolean {
    let ok = true;
    try { this.storage?.removeItem(DIARY_KEY); } catch { ok = false; }
    this._state = empty();
    this.subs.forEach((f) => f());
    return ok;
  }
}

/** จำนวนวันใน n วันล่าสุด (รวมวันนี้) ที่มีเช็กอิน; windowStart ไม่ก่อนวันเริ่มใช้ */
export function takenInWindow(taken: string[], startISO: string, today: string, n = 7): { took: number; days: number } {
  const since = Math.min(n, Math.max(0, dayNumber(startISO, today)));
  let took = 0;
  for (const d of taken) {
    const back = dayNumber(d, today) - 1; // 0 = วันนี้
    if (back >= 0 && back < since) took++;
  }
  return { took, days: since };
}

/** ค่าที่บันทึกไว้ของสัญญาณหนึ่ง เรียงตามวัน (ไม่แปลผล) */
export function series(entries: DiaryEntry[], key: VitalKey): { date: string; value: number }[] {
  return entries.flatMap((e) => (e[key] === null ? [] : [{ date: e.date, value: e[key] as number }]));
}
