import type { ChatMsg } from "../chat/chatStore";
import type { Brief } from "./brief";
import type { ParseProposal } from "../types";

/** ข้อความในแชตของหน้าผู้ช่วย: เก็บในหน่วยความจำของหน้านี้เท่านั้น (ไม่ลงที่เก็บของเบราว์เซอร์ ไม่ส่งให้ AI) หายเมื่อรีเฟรช */
export type AMsg =
  | { k: "u"; t: string }
  | { k: "text"; t: string; tone?: "err"; go?: { label: string; to: "now" | "diary" | "mine" } }
  | { k: "brief"; b: Brief }
  | { k: "check"; headline: string; none: boolean; items: { severity: string; text: string }[]; scope: string }
  | { k: "answer"; m: ChatMsg }
  | { k: "proposal"; p: ParseProposal; state: "open" | "done" }
  | { k: "done"; t: string; undo: (() => void) | null };

export class AssistantLog {
  msgs: AMsg[] = [];
  private subs = new Set<() => void>();
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => void this.subs.delete(fn); }
  private emit() { this.subs.forEach((f) => f()); }
  add(m: AMsg): number { this.msgs = [...this.msgs, m]; this.emit(); return this.msgs.length - 1; }
  patch(i: number, m: AMsg): void { this.msgs = this.msgs.map((x, k) => (k === i ? m : x)); this.emit(); }
  clear(): void { this.msgs = []; this.emit(); }
}
