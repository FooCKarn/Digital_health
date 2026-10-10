import { createContext } from "preact";
import type { Cite, Flag } from "../types";

// ประวัติแชตอยู่ใน sessionStorage ของแท็บนี้เท่านั้น: ข้อความ + ป้ายที่มา + หลักฐาน (ไม่มีโปรไฟล์ ยา วันที่ รายการสมุนไพร)
// ไม่ส่งประวัติให้เซิร์ฟเวอร์/LLM; storage เสียหรือใช้ไม่ได้ = ทำงานต่อโดยไม่มีประวัติ
export const CHAT_KEY = "hg_chat_v1";
export const CHAT_MAX = 50;
const MAX_TEXT = 4000;

/** u = ผู้ใช้, a = ผู้ช่วย, n = หมายเหตุระบบ, e = ข้อผิดพลาด (อยู่ในหน่วยความจำเท่านั้น ไม่ลงประวัติ) */
export type ChatMsg =
  | { r: "u" | "n" | "e"; t: string }
  | { r: "a"; t: string; src: string; cites: Cite[]; old?: true };

type SessionStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export function getSessionStorage(): SessionStore | null {
  try { return window.sessionStorage; } catch { return null; }
}

const txt = (x: unknown, max = MAX_TEXT): x is string => typeof x === "string" && x.length <= max;

// สร้างอ็อบเจ็กต์ใหม่จากฟิลด์ที่อนุญาตเท่านั้น (ทั้งตอนโหลดประวัติและตอนรับคำตอบจากเซิร์ฟเวอร์)
function toCite(c: unknown): Cite | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const s = (x: unknown) => (txt(x, 500) ? x : "");
  return {
    item_id: s(o.item_id), herb_id: s(o.herb_id), herb_name_th: s(o.herb_name_th),
    source_page: typeof o.source_page === "number" ? o.source_page : s(o.source_page),
    pdf_page: typeof o.pdf_page === "number" ? o.pdf_page : null,
    evidence_quote: txt(o.evidence_quote, 1000) ? o.evidence_quote : null,
    verified: o.verified === true,
    ...(txt(o.source_doc_th, 300) && o.source_doc_th ? { source_doc_th: o.source_doc_th } : {}),
  };
}

export function toMsg(m: unknown, allowError = false): ChatMsg | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (!txt(o.t)) return null;
  if (o.r === "u" || o.r === "n" || (allowError && o.r === "e")) return { r: o.r, t: o.t };
  if (o.r !== "a" || !txt(o.src, 50) || !(o.cites === undefined || Array.isArray(o.cites))) return null;
  const cites = ((o.cites as unknown[] | undefined) ?? []).map(toCite).filter((c): c is Cite => c !== null);
  return { r: "a", t: o.t, src: o.src, cites, ...(o.old === true ? { old: true as const } : {}) };
}

export class ChatStore {
  msgs: ChatMsg[] = [];
  /** เพิ่มเมื่อล้าง: คำตอบของคำถามที่ค้างอยู่ถูกทิ้ง */
  gen = 0;
  private subs = new Set<() => void>();

  constructor(private storage: SessionStore | null) {
    try {
      const v = JSON.parse(storage?.getItem(CHAT_KEY) ?? "null");
      if (v && v.v === 1 && Array.isArray(v.msgs)) {
        this.msgs = v.msgs.map((m: unknown) => toMsg(m)).filter((m: ChatMsg | null): m is ChatMsg => m !== null).slice(-CHAT_MAX);
      }
    } catch { this.msgs = []; }
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  add(m: ChatMsg): void {
    this.msgs = [...this.msgs, m].slice(-CHAT_MAX);
    try {
      this.storage?.setItem(CHAT_KEY, JSON.stringify({ v: 1, msgs: this.msgs.filter((x) => x.r !== "e") }));
    } catch { /* โควตาเต็ม/โหมดส่วนตัว: ไม่มีประวัติ แต่แชตยังใช้ได้ */ }
    this.subs.forEach((f) => f());
  }

  /** หมายเหตุระบบ ไม่ซ้ำติดกัน และไม่เพิ่มในแชตว่าง */
  note(t: string): void {
    const last = this.msgs[this.msgs.length - 1];
    if (last && last.r !== "n") this.add({ r: "n", t });
  }

  clear(): void {
    this.gen++;
    this.msgs = [];
    try { this.storage?.removeItem(CHAT_KEY); } catch { /* ไม่มีที่เก็บ = ไม่มีอะไรต้องลบ */ }
    this.subs.forEach((f) => f());
  }
}

/** ปุ่ม "ถามเรื่องคำเตือนนี้" บนการ์ดคำเตือน (มีเฉพาะเมื่อแชตติดตั้งอยู่) */
export const AskFlag = createContext<{ herbName(id: string): string; ask(f: Flag): void } | null>(null);
