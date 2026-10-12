import { cloudCall } from "../api";
import type { DiaryStore } from "./diary";
import type { ReminderStore } from "./reminder";
import type { TrackerStore } from "./tracker";

/**
 * ซิงก์ข้อมูลกับคลาวด์ (ไม่บังคับ; ค่าเริ่มต้นข้อมูลอยู่ในเครื่องเท่านั้น)
 * - ข้อมูลในเครื่องยังเป็นหลัก ซิงก์ไปคลาวด์เฉพาะเมื่อผู้ใช้สมัคร/เข้าสู่ระบบแล้ว
 * - ไม่เขียนทับคลาวด์ด้วยข้อมูลว่าง (กันล้างข้อมูลในเครื่องแล้วคลาวด์ว่างตาม); ลบข้อมูลคลาวด์ต้องกดเอง
 * - สองฝั่งมีข้อมูลต่างกันตอนเข้าสู่ระบบ = ให้ผู้ใช้เลือกฝั่งที่จะใช้ ไม่รวมให้เอง
 */
export type CloudStatus = "unknown" | "unavailable" | "anonymous" | "ready" | "syncing" | "conflict" | "error";
export interface RemoteState { version: number; updated_at: string | null; tracker: unknown; diary: unknown; reminder: unknown }
interface Resp { status: number; data: any }
export type Caller = (method: string, url: string, body?: unknown) => Promise<Resp>;

const DEBOUNCE_MS = 1500;

export class CloudSync {
  status: CloudStatus = "unknown";
  handle: string | null = null;
  message = "";
  lastSynced: string | null = null;
  conflict: RemoteState | null = null;
  private version = 0;
  private applying = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subs = new Set<() => void>();
  private offs: (() => void)[] = [];

  constructor(private tracker: TrackerStore, private diary: DiaryStore, private reminder: ReminderStore, private caller: Caller = cloudCall) {}

  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => void this.subs.delete(fn); }
  private set(status: CloudStatus, message = ""): void { this.status = status; this.message = message; this.subs.forEach((s) => s()); }

  private call(method: string, url: string, body?: unknown): Promise<Resp> { return this.caller(method, url, body); }
  private err(r: Resp, fallback: string): string {
    return typeof r.data?.error === "string" && /[฀-๿]/.test(r.data.error) ? r.data.error : fallback;
  }

  /** เรียกตอนเปิดหน้า: ดูว่าเข้าสู่ระบบอยู่ไหม และเซิร์ฟเวอร์นี้มีระบบบัญชีไหม (Vercel รุ่นเดิมไม่มี = ซ่อนส่วนนี้) */
  async init(): Promise<void> {
    try {
      const r = await this.call("GET", "/api/auth/me");
      if (r.status !== 200 || !r.data || !("user" in r.data)) return this.set("unavailable");
      if (!r.data.user) return this.set("anonymous");
      this.handle = r.data.user.handle;
      await this.reconcile();
    } catch {
      this.set("unavailable");
    }
  }

  async register(handle: string, password: string, consentPolicy: string): Promise<boolean> {
    return this.enter("/api/auth/register", { handle, password, consent_policy: consentPolicy }, handle);
  }
  async login(handle: string, password: string): Promise<boolean> {
    return this.enter("/api/auth/login", { handle, password }, handle);
  }
  private async enter(url: string, body: object, handle: string): Promise<boolean> {
    try {
      const r = await this.call("POST", url, body);
      if (r.status !== 200) { this.set("anonymous", this.err(r, "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง")); return false; }
      this.handle = r.data?.user?.handle ?? handle.toLowerCase();
      await this.reconcile();
      return true;
    } catch {
      this.set("anonymous", "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
      return false;
    }
  }

  async logout(): Promise<void> {
    this.stop();
    try { await this.call("POST", "/api/auth/logout", {}); } catch { /* ออกจากฝั่งเครื่องอยู่ดี */ }
    this.handle = null; this.conflict = null; this.version = 0; this.lastSynced = null;
    this.set("anonymous");
  }

  /** ลบบัญชีและข้อมูลทุกอย่างในคลาวด์ (ข้อมูลในเครื่องไม่ถูกลบ) */
  async deleteAccount(password: string): Promise<boolean> {
    try {
      const r = await this.call("DELETE", "/api/account", { password });
      if (r.status !== 200) { this.set(this.status === "unknown" ? "anonymous" : this.status, this.err(r, "ลบบัญชีไม่สำเร็จ")); return false; }
      this.stop(); this.handle = null; this.conflict = null; this.version = 0; this.lastSynced = null;
      this.set("anonymous", "ลบบัญชีและข้อมูลในคลาวด์แล้ว (ข้อมูลในเครื่องนี้ยังอยู่)");
      return true;
    } catch {
      this.set(this.status, "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
      return false;
    }
  }

  // ---------- เอกสารฝั่งเครื่อง ----------
  localHasData(): boolean {
    const p = this.tracker.state.profile;
    const d = this.diary.state;
    return this.tracker.state.items.length > 0 || p.age !== null || p.pregnant !== null || p.breastfeeding !== null || p.conditions.length > 0
      || d.entries.length > 0 || Object.keys(d.taken).length > 0 || Object.keys(d.dose).length > 0;
  }
  private localDocs() {
    return { tracker: JSON.parse(this.tracker.exportJSON()), diary: JSON.parse(this.diary.exportJSON()), reminder: { ...this.reminder.state } };
  }
  private apply(s: RemoteState): string | null {
    this.applying = true;
    try {
      if (s.tracker) { const r = this.tracker.importJSON(JSON.stringify(s.tracker)); if (!r.ok) return r.message; }
      if (s.diary) { const r = this.diary.importJSON(JSON.stringify(s.diary)); if (!r.ok) return r.message; }
      if (s.reminder) this.reminder.replace(s.reminder);
      return null;
    } finally { this.applying = false; }
  }

  // ---------- ซิงก์ ----------
  private async reconcile(): Promise<void> {
    this.set("syncing");
    const r = await this.call("GET", "/api/state");
    if (r.status !== 200) return this.set("error", this.err(r, "อ่านข้อมูลจากคลาวด์ไม่สำเร็จ"));
    const remote: RemoteState = r.data.state;
    this.version = remote.version;
    const local = this.localHasData();
    if (remote.version === 0) {
      this.watch();
      return local ? this.push() : this.ready();
    }
    if (!local) {
      const bad = this.apply(remote);
      this.watch();
      return bad ? this.set("error", `ข้อมูลในคลาวด์ใช้ไม่ได้: ${bad}`) : this.ready();
    }
    const l = this.localDocs();
    const same = JSON.stringify([l.tracker, l.diary]) === JSON.stringify([remote.tracker, remote.diary]);
    if (same) { this.watch(); return this.ready(); }
    this.conflict = remote;
    this.set("conflict");
  }

  /** ผู้ใช้เลือกว่าจะใช้ข้อมูลฝั่งไหนเมื่อสองฝั่งต่างกัน */
  async resolve(choice: "cloud" | "local"): Promise<void> {
    const remote = this.conflict;
    if (!remote) return;
    this.conflict = null;
    if (choice === "cloud") {
      const bad = this.apply(remote);
      this.version = remote.version;
      this.watch();
      return bad ? this.set("error", `ข้อมูลในคลาวด์ใช้ไม่ได้: ${bad}`) : this.ready();
    }
    this.version = remote.version; // ทับคลาวด์ด้วยข้อมูลในเครื่อง (ใช้เวอร์ชันล่าสุดที่เพิ่งอ่าน)
    this.set("syncing");
    this.watch();
    await this.push();
  }

  private ready(): void { this.set("ready"); }

  private watch(): void {
    if (this.offs.length) return;
    const on = () => { if (!this.applying) this.schedule(); };
    this.offs = [this.tracker.subscribe(on), this.diary.subscribe(on), this.reminder.subscribe(on)];
  }
  private stop(): void {
    this.offs.forEach((o) => o()); this.offs = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule(): void {
    if (this.status === "conflict" || this.status === "anonymous") return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.push(); }, DEBOUNCE_MS);
  }

  /** ส่งข้อมูลในเครื่องขึ้นคลาวด์ (กดเองหรือหลังแก้ไข); ข้อมูลว่างไม่ถูกส่งอัตโนมัติ */
  async push(force = false): Promise<void> {
    if (!this.handle || this.status === "conflict") return;
    if (!force && !this.localHasData()) return this.ready();
    this.set("syncing");
    try {
      const r = await this.call("PUT", "/api/state", { base_version: this.version, ...this.localDocs() });
      if (r.status === 200) {
        this.version = r.data.state.version;
        this.lastSynced = r.data.state.updated_at;
        return this.ready();
      }
      if (r.status === 409 && r.data?.state) { this.conflict = r.data.state; return this.set("conflict", this.err(r, "")); }
      if (r.status === 401) { this.stop(); this.handle = null; return this.set("anonymous", "หมดเวลาเข้าสู่ระบบ ต้องเข้าสู่ระบบใหม่"); }
      this.set("error", this.err(r, "ซิงก์ไม่สำเร็จ ข้อมูลในเครื่องยังอยู่ครบ"));
    } catch {
      this.set("error", "เชื่อมต่อไม่ได้ ข้อมูลในเครื่องยังอยู่ครบ จะลองใหม่เมื่อมีการแก้ไขครั้งถัดไป");
    }
  }

  /** ลบเฉพาะข้อมูลที่ซิงก์ในคลาวด์ (เก็บบัญชีไว้): เขียนเอกสารว่างทับ */
  async clearCloudData(): Promise<void> {
    if (!this.handle) return;
    this.set("syncing");
    const empty = {
      tracker: { v: 1, items: [], profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] } },
      diary: { v: 1, entries: [], taken: {}, dose: {} }, reminder: { time: null, last: null },
    };
    try {
      const r = await this.call("PUT", "/api/state", { base_version: this.version, ...empty });
      if (r.status === 200) { this.version = r.data.state.version; return this.set("ready", "ลบข้อมูลในคลาวด์แล้ว (ข้อมูลในเครื่องนี้ยังอยู่)"); }
      this.set("error", this.err(r, "ลบข้อมูลในคลาวด์ไม่สำเร็จ"));
    } catch {
      this.set("error", "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    }
  }
}
