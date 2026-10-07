import { isValidISODate, validateStart } from "./dates";

export type ItemKind = "herb" | "drug";
export interface TrackerItem { id: string; kind: ItemKind; ref: string; label: string; start_date: string; end_date: string | null }
export interface Profile { age: number | null; pregnant: "yes" | "no" | null; breastfeeding: "yes" | "no" | null; conditions: string[] }
export interface TrackerState { v: 1; items: TrackerItem[]; profile: Profile }
export interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const STORAGE_KEY = "hg_tracker_v1";
const MAX_IMPORT_BYTES = 100 * 1024;
const MAX_ITEMS = 200;
const MAX_TEXT = 100;
const MAX_CONDITIONS = 50;

const emptyProfile = (): Profile => ({ age: null, pregnant: null, breastfeeding: null, conditions: [] });
const emptyState = (): TrackerState => ({ v: 1, items: [], profile: emptyProfile() });

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const yn = (x: unknown): x is "yes" | "no" | null => x === null || x === "yes" || x === "no";

/** ตรวจทีละฟิลด์ แล้วสร้างอ็อบเจ็กต์ใหม่จากฟิลด์ที่อนุญาตเท่านั้น (กัน __proto__/ฟิลด์แปลก) */
function parseState(raw: unknown): TrackerState | string {
  const BAD = "ไฟล์ไม่ถูกต้อง";
  if (!isObj(raw) || raw.v !== 1) return "ไฟล์ไม่ถูกต้องหรือเป็นเวอร์ชันที่ไม่รองรับ";
  if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return "จำนวนรายการไม่ถูกต้อง";
  const ids = new Set<string>();
  const items: TrackerItem[] = [];
  for (const it of raw.items) {
    if (!isObj(it)) return BAD;
    const { id, kind, ref, label, start_date, end_date } = it;
    if (!str(id, 64) || ids.has(id) || (kind !== "herb" && kind !== "drug") || !str(ref, MAX_TEXT) || !str(label, MAX_TEXT)) return BAD;
    if (!isValidISODate(start_date) || !(end_date === null || isValidISODate(end_date))) return "วันที่ในไฟล์ไม่ถูกต้อง";
    if (end_date !== null && end_date < start_date) return "วันที่ในไฟล์ไม่ถูกต้อง";
    ids.add(id);
    items.push({ id, kind, ref, label, start_date, end_date });
  }
  const p = raw.profile;
  if (!isObj(p)) return BAD;
  const { age, pregnant, breastfeeding, conditions } = p;
  if (!(age === null || (typeof age === "number" && Number.isInteger(age) && age >= 0 && age <= 120))) return BAD;
  if (!yn(pregnant) || !yn(breastfeeding)) return BAD;
  if (!Array.isArray(conditions) || conditions.length > MAX_CONDITIONS || !conditions.every((c) => str(c, MAX_TEXT))) return BAD;
  return { v: 1, items, profile: { age, pregnant, breastfeeding, conditions: [...(conditions as string[])] } };
}

export class TrackerStore {
  persistent: boolean;
  recovered = false; // true เมื่อข้อมูลใน storage เสียและเริ่มใหม่
  private _state: TrackerState = emptyState();
  private subs = new Set<() => void>();

  constructor(private storage: KeyValueStorage | null, private today: () => string) {
    this.persistent = storage !== null;
    if (!storage) return;
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (text === null) return;
      const r = text.length > MAX_IMPORT_BYTES ? "big" : parseState(JSON.parse(text));
      if (typeof r === "string") this.recovered = true;
      else this._state = r;
    } catch {
      this.recovered = true;
    }
  }

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
    if (!str(input.ref, MAX_TEXT)) return { ok: false, message: "รายการไม่ถูกต้อง" };
    const dateErr = validateStart(input.start_date, this.today());
    if (dateErr) return { ok: false, message: dateErr };
    if (this.active().some((i) => i.kind === input.kind && i.ref === input.ref)) return { ok: false, message: "มีรายการนี้อยู่แล้ว" };
    if (this._state.items.length >= MAX_ITEMS) return { ok: false, message: "จำนวนรายการเต็มแล้ว" };
    const item: TrackerItem = { id: crypto.randomUUID(), kind: input.kind, ref: input.ref, label, start_date: input.start_date, end_date: null };
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

  setProfile(p: Profile): void {
    this.commit({ ...this._state, profile: { ...p, conditions: [...p.conditions] } });
  }

  active(): TrackerItem[] {
    const t = this.today();
    return this._state.items.filter((i) => i.end_date === null || i.end_date >= t);
  }

  history(): TrackerItem[] {
    const t = this.today();
    return this._state.items.filter((i) => i.end_date !== null && i.end_date < t);
  }

  exportJSON(): string { return JSON.stringify(this._state, null, 2); }

  importJSON(text: string): { ok: true } | { ok: false; message: string } {
    if (typeof text !== "string" || new Blob([text]).size > MAX_IMPORT_BYTES) return { ok: false, message: "ไฟล์ใหญ่เกิน 100 KB" };
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, message: "ไฟล์ไม่ใช่ JSON ที่อ่านได้" }; }
    const r = parseState(raw);
    if (typeof r === "string") return { ok: false, message: r };
    this.commit(r);
    return { ok: true };
  }

  clearAll(): void {
    try { this.storage?.removeItem(STORAGE_KEY); } catch { /* ใช้งานต่อในหน่วยความจำ */ }
    this._state = emptyState();
    this.subs.forEach((f) => f());
  }
}
