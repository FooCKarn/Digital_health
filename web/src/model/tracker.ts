import { isValidISODate, startForDay, validateStart } from "./dates";

export type ItemKind = "herb" | "drug" | "formula";
/** สมุนไพรและตำรับส่งไปตรวจในอาร์เรย์ herbs เดียวกัน (โควตา 50 ร่วมกัน) */
export const isHerbish = (k: ItemKind) => k !== "drug";
export const kindLabel = (k: ItemKind) => (k === "herb" ? "สมุนไพร" : k === "formula" ? "ตำรับ" : "ยา");
export interface TrackerItem { id: string; kind: ItemKind; ref: string; label: string; start_date: string; end_date: string | null }
export interface Profile { age: number | null; pregnant: "yes" | "no" | null; breastfeeding: "yes" | "no" | null; conditions: string[] }
export interface TrackerState { v: 1; items: TrackerItem[]; profile: Profile }
export interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const STORAGE_KEY = "hg_tracker_v1";
export const MAX_IMPORT_BYTES = 256 * 1024;
const MAX_HERBS = 50;
const MAX_DRUGS = 30;
const MAX_COND = 50;
const bytes = (t: string) => new TextEncoder().encode(t).length;
const MAX_ITEMS = 200;
const MAX_TEXT = 100;
const MAX_CONDITIONS = 50;
const refMax = (k: ItemKind) => (k === "drug" ? MAX_TEXT : 50);

const emptyProfile = (): Profile => ({ age: null, pregnant: null, breastfeeding: null, conditions: [] });
const emptyState = (): TrackerState => ({ v: 1, items: [], profile: emptyProfile() });

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const yn = (x: unknown): x is "yes" | "no" | null => x === null || x === "yes" || x === "no";

/** ตรวจโปรไฟล์ คืนข้อความผิดพลาดหรือ null (known = รหัสโรคที่เซิร์ฟเวอร์รู้จัก ถ้ามี) */
function profileError(p: unknown, known: string[] | null): string | null {
  const BAD = "ข้อมูลโปรไฟล์ไม่ถูกต้อง";
  if (!isObj(p)) return BAD;
  const { age, pregnant, breastfeeding, conditions } = p;
  if (!(age === null || (typeof age === "number" && Number.isInteger(age) && age >= 0 && age <= 120))) return BAD;
  if (!yn(pregnant) || !yn(breastfeeding)) return BAD;
  if (!Array.isArray(conditions) || conditions.length > MAX_CONDITIONS || !conditions.every((c) => str(c, MAX_COND))) return BAD;
  if (known && !conditions.every((c) => known.includes(c as string))) return "มีโรคประจำตัวที่ระบบไม่รู้จัก";
  return null;
}

/** ตรวจทีละฟิลด์ แล้วสร้างอ็อบเจ็กต์ใหม่จากฟิลด์ที่อนุญาตเท่านั้น (กัน __proto__/ฟิลด์แปลก) */
function parseState(raw: unknown, today: string, known: string[] | null, onLoad = false): TrackerState | string {
  const BAD = "ไฟล์ไม่ถูกต้อง";
  // ตอนโหลดจากเครื่อง: วันที่ล้ำไป 1 วัน (นาฬิกา/เขตเวลาเพี้ยน) ปัดเป็นวันนี้ แทนที่จะทิ้งข้อมูลทั้งหมด; นำเข้าไฟล์ยังปฏิเสธ
  const tomorrow = startForDay(0, today);
  const fix = (d: unknown) => (onLoad && d === tomorrow ? today : d);
  if (!isObj(raw) || raw.v !== 1) return "ไฟล์ไม่ถูกต้องหรือเป็นเวอร์ชันที่ไม่รองรับ";
  if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return "จำนวนรายการไม่ถูกต้อง";
  const ids = new Set<string>();
  const items: TrackerItem[] = [];
  let herbs = 0, drugs = 0;
  for (const it of raw.items) {
    if (!isObj(it)) return BAD;
    const { id, kind, ref, label } = it;
    const start_date = fix(it.start_date), end_date = fix(it.end_date);
    if (!str(id, 64) || ids.has(id) || (kind !== "herb" && kind !== "drug" && kind !== "formula") || !str(ref, refMax(kind)) || !str(label, MAX_TEXT)) return BAD;
    if (!isValidISODate(start_date) || !(end_date === null || isValidISODate(end_date))) return "วันที่ในไฟล์ไม่ถูกต้อง";
    // ไม่ปฏิเสธวันเริ่มเก่า (สำรองข้อมูลอายุเกินปีต้องกู้ได้) แต่ปฏิเสธอนาคต
    if (start_date > today || (end_date !== null && (end_date < start_date || end_date > today))) return "วันที่ในไฟล์ไม่ถูกต้อง";
    if (end_date === null) { if (isHerbish(kind)) herbs++; else drugs++; }
    ids.add(id);
    items.push({ id, kind, ref, label, start_date, end_date });
  }
  if (herbs > MAX_HERBS || drugs > MAX_DRUGS) return "จำนวนรายการที่ใช้อยู่เกินกำหนด";
  const perr = profileError(raw.profile, known);
  if (perr) return perr;
  const p = raw.profile as Profile;
  return { v: 1, items, profile: { age: p.age, pregnant: p.pregnant, breastfeeding: p.breastfeeding, conditions: [...p.conditions] } };
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class TrackerStore {
  persistent: boolean;
  recovered = false; // true เมื่อข้อมูลใน storage เสียและเริ่มใหม่
  private _state: TrackerState = emptyState();
  private subs = new Set<() => void>();

  private known: string[] | null;

  constructor(private storage: KeyValueStorage | null, private today: () => string, opts?: { knownConditions?: string[] }) {
    this.known = opts?.knownConditions ?? null;
    this.persistent = storage !== null;
    if (!storage) return;
    let text: string | null;
    try { text = storage.getItem(STORAGE_KEY); } catch { this.persistent = false; return; }
    if (text === null) return;
    try {
      const r = bytes(text) > MAX_IMPORT_BYTES ? "big" : parseState(JSON.parse(text), today(), this.known, true);
      if (typeof r === "string") this.recovered = true;
      else this._state = r;
    } catch {
      this.recovered = true;
    }
  }

  setKnownConditions(known: string[] | null): void { this.known = known; }

  get state(): TrackerState { return this._state; }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  private commit(next: TrackerState): void {
    this._state = next;
    if (this.storage && this.persistent) {
      try { this.storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { this.persistent = false; }
    }
    this.subs.forEach((f) => f());
  }

  addItem(input: { kind: ItemKind; ref: string; label: string; start_date: string }): { ok: true; item: TrackerItem } | { ok: false; message: string } {
    const label = input.label.trim();
    if (!label || label.length > MAX_TEXT) return { ok: false, message: "ชื่อต้องไม่ว่างและไม่เกิน 100 ตัวอักษร" };
    if (!str(input.ref, refMax(input.kind))) return { ok: false, message: "รายการไม่ถูกต้อง" };
    const dateErr = validateStart(input.start_date, this.today());
    if (dateErr) return { ok: false, message: dateErr };
    const act = this.active();
    if (act.some((i) => i.kind === input.kind && i.ref === input.ref)) return { ok: false, message: "มีรายการนี้อยู่แล้ว" };
    const herbish = isHerbish(input.kind);
    if (act.filter((i) => isHerbish(i.kind) === herbish).length >= (herbish ? MAX_HERBS : MAX_DRUGS))
      return { ok: false, message: herbish ? "ใช้สมุนไพรและตำรับพร้อมกันได้รวมไม่เกิน 50 รายการ" : "ใช้ยาพร้อมกันได้ไม่เกิน 30 รายการ" };
    if (this._state.items.length >= MAX_ITEMS) return { ok: false, message: "จำนวนรายการเต็มแล้ว" };
    const item: TrackerItem = { id: newId(), kind: input.kind, ref: input.ref, label, start_date: input.start_date, end_date: null };
    this.commit({ ...this._state, items: [...this._state.items, item] });
    return { ok: true, item };
  }

  stopItem(id: string): void {
    const t = this.today();
    this.commit({ ...this._state, items: this._state.items.map((i) => (i.id === id ? { ...i, end_date: t } : i)) });
  }

  removeItem(id: string): void {
    this.commit({ ...this._state, items: this._state.items.filter((i) => i.id !== id) });
  }

  setProfile(p: Profile): { ok: true } | { ok: false; message: string } {
    const err = profileError(p, this.known);
    if (err) return { ok: false, message: err };
    this.commit({ ...this._state, profile: { ...p, conditions: [...p.conditions] } });
    return { ok: true };
  }

  // end_date ใช้แสดงผลเท่านั้น: หยุดแล้ว = ประวัติทันที
  active(): TrackerItem[] { return this._state.items.filter((i) => i.end_date === null); }

  history(): TrackerItem[] { return this._state.items.filter((i) => i.end_date !== null); }

  exportJSON(): string { return JSON.stringify(this._state); }

  importJSON(text: string): { ok: true } | { ok: false; message: string } {
    if (typeof text !== "string" || bytes(text) > MAX_IMPORT_BYTES) return { ok: false, message: "ไฟล์ใหญ่เกิน 256 KB" };
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, message: "อ่านไฟล์ไม่ได้ ใช้ไฟล์ที่ส่งออกจากแอปนี้เท่านั้น" }; }
    const r = parseState(raw, this.today(), this.known);
    if (typeof r === "string") return { ok: false, message: r };
    this.commit(r);
    return { ok: true };
  }

  /** false = ล้างในหน่วยความจำแล้ว แต่ลบจากที่เก็บในเครื่องไม่สำเร็จ (ข้อมูลอาจกลับมาเมื่อเปิดหน้าใหม่) */
  clearAll(): boolean {
    let ok = true;
    try { this.storage?.removeItem(STORAGE_KEY); } catch { ok = false; }
    this._state = emptyState();
    this.subs.forEach((f) => f());
    return ok;
  }
}
