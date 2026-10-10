import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, ask } from "../api";
import { Evidence } from "../components/FlagCard";
import { ScopeChip } from "../components/ScopeChip";
import { useBusy } from "../hooks/useBusy";
import { buildPayload } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { Meta } from "../types";
import { toMsg, type ChatMsg, type ChatStore } from "./chatStore";

// ข้อความตายตัวจากหน้าเดิม (public/index.html)
const NOTICE = "ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · ตอบจากฐานข้อมูลของเครื่องมือนี้เท่านั้น · ห้ามพิมพ์ข้อมูลส่วนตัว";
// หน้าใหม่ตรวจซ้ำอัตโนมัติ (ไม่มีปุ่ม ตรวจ) จึงไม่ใช้ถ้อยคำเดิม "กดตรวจใหม่"
const STALE_LINE = "ผลตรวจกำลังอัปเดตหลังคุณแก้ข้อมูล ถามอีกครั้งเมื่อผลใหม่ขึ้น จะได้คำตอบที่ตรงกับข้อมูลล่าสุด";
const CHANGED = "ผลตรวจเปลี่ยนแล้ว คำตอบก่อนหน้าอาจไม่ตรงกับข้อมูลปัจจุบัน";
const SRC_LABEL: Record<string, string> = {
  database: "ข้อความจากฐานข้อมูล", llm: "AI เรียบเรียงจากข้อความที่ค้นได้", refusal: "ตอบไม่ได้ / ไม่มีข้อมูล", emergency: "ข้อควรทราบเร่งด่วน",
};
const FIXED = new ApiError("server").thaiMessage;

/** ข้อความไทยตายตัว ไม่แสดงรหัสภายใน: ใช้ข้อความเซิร์ฟเวอร์เฉพาะ 400/503 ที่เป็นภาษาไทย (ApiError กรองแล้ว) */
function errText(e: unknown): string {
  if (e instanceof ApiError && (e.kind === "bad_request" || e.kind === "unavailable") && e.thaiMessage !== FIXED) return e.thaiMessage;
  if (e instanceof ApiError && e.kind === "bad_request") return "คำถามหรือข้อมูลไม่ถูกต้อง";
  return "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง";
}

function Msg({ m }: { m: ChatMsg }) {
  if (m.r !== "a") return m.r === "e" ? <div class="cmsg err" role="alert">{m.t}</div> : <div class={`cmsg ${m.r}`}>{m.t}</div>;
  const em = m.src === "emergency";
  return (
    <div class={em ? "cmsg a emerg" : "cmsg a"} role={em ? "alert" : undefined}>
      <span class="src">{SRC_LABEL[m.src] ?? "ผู้ช่วย AI"}</span>
      {m.t}
      {m.old && <span class="stl">{STALE_LINE}</span>}
      {m.cites.filter((c) => c.evidence_quote).slice(0, 6).map((c, i) => (
        <Evidence key={i} summary={`ดูหลักฐาน: ${c.herb_name_th}`} quote={c.evidence_quote!} page={c.source_page} pdfPage={c.pdf_page} doc={c.source_doc_th}>
          <p class="meta">{`รหัสรายการ ${c.item_id} · ${c.verified ? "ตรวจแล้ว" : "ร่าง: ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ"}`}</p>
        </Evidence>
      ))}
    </div>
  );
}

export type OpenRequest = { n: number; prefill?: string } | null;

type Props = {
  chat: ChatStore; store: TrackerStore; meta: Meta; today: string;
  open: OpenRequest; onClose(): void;
  /** แสดงเป็นส่วนของหน้า (หน้าผู้ช่วย) ไม่ลอย: เปิดตลอด ไม่มีปุ่มปิด */
  inline?: boolean;
};

/** แผงแชต (dialog ไม่เป็น modal) อยู่ใน DOM ตลอดเพื่อให้ aria-controls ชี้ได้ ซ่อนด้วย hidden */
export function ChatPanel({ chat, store, meta, today, open, onClose, inline }: Props) {
  const [, setVer] = useState(0);
  useEffect(() => chat.subscribe(() => setVer((v) => v + 1)), [chat]);
  const [text, setText] = useState("");
  const [chips, setChips] = useState(() => meta.chat_followups_th.slice(0, 3));
  const [waitGen, setWaitGen] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const b = useBusy();
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // ส่งเฉพาะข้อมูลของรายการที่กำลังใช้ (ชุดเดียวกับ /api/analyze) ไม่ส่งประวัติแชต
  const payload = buildPayload(store.active(), store.state.profile, today, Object.keys(meta.conditions));
  const key = payload && JSON.stringify(payload);
  const keyNow = useRef(key);
  keyNow.current = key;
  // undefined = ประวัติจากการเปิดหน้าครั้งก่อน (ผลตรวจที่คุยกันไม่อยู่แล้ว)
  const seen = useRef<string | null | undefined>(chat.msgs.length ? undefined : key);
  useEffect(() => {
    if (seen.current !== key) chat.note(CHANGED);
    seen.current = key;
  }, [key]);

  useEffect(() => {
    if (!open || (inline && !open.n)) return; // หน้าผู้ช่วย: ไม่ดึงโฟกัสตอนเปิดหน้าเฉย ๆ
    if (open.prefill) setText(open.prefill);
    input.current?.focus();
  }, [open?.n]);

  useEffect(() => {
    const l = log.current;
    if (l) l.scrollTop = l.scrollHeight;
  }, [chat.msgs.length]);

  const send = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    void b.run(async () => {
      setText("");
      chat.add({ r: "u", t: q });
      const cg = chat.gen;
      setWaitGen(cg);
      const sentKey = key;
      const lastA = [...chat.msgs].reverse().find((m) => m.r === "a");
      const herbIds = new Set(meta.herbs.map((h) => h.id));
      const ctx = lastA?.r === "a" ? [...new Set(lastA.cites.map((c) => c.herb_id))].filter((id) => herbIds.has(id)).slice(0, 5) : [];
      try {
        const a = await ask({ ...(payload ?? {}), question: q, context_herbs: ctx });
        if (cg !== chat.gen) return; // ล้างประวัติไปแล้ว ไม่แสดงคำตอบค้าง
        // เซิร์ฟเวอร์คำนวณจากข้อมูลที่ส่งไป: เก่าเฉพาะเมื่อผู้ใช้แก้ข้อมูลระหว่างรอคำตอบ
        const old = sentKey !== null && sentKey !== keyNow.current;
        const m = toMsg({ r: "a", t: a.text_th, src: a.source, cites: a.cites, old });
        if (!m) throw new ApiError("server");
        chat.add(m);
        if (Array.isArray(a.follow_ups)) setChips(a.follow_ups.filter((x) => typeof x === "string").slice(0, 3));
      } catch (e) {
        if (cg !== chat.gen) return;
        chat.add({ r: "e", t: `ถามไม่สำเร็จ: ${errText(e)}` });
      } finally {
        setWaitGen(null);
        input.current?.focus();
      }
    });
  };

  const clear = () => {
    chat.clear();
    setChips(meta.chat_followups_th.slice(0, 3));
    setStatus("ล้างประวัติแชตแล้ว");
    input.current?.focus();
  };
  const waiting = waitGen !== null && waitGen === chat.gen;

  return (
    <section id="chatPanel" class={inline ? "inline" : undefined} role={inline ? "region" : "dialog"} aria-label="ผู้ช่วย AI (ต้นแบบ)" hidden={!inline && !open}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <header>
        <h2>ผู้ช่วย AI (ต้นแบบ)</h2>
        <span class="row-actions">
          <button type="button" aria-label="ล้างประวัติแชต" onClick={clear}>ล้างประวัติ</button>
          {!inline && <button type="button" aria-label="ปิดผู้ช่วย AI" onClick={onClose}>ปิด</button>}
        </span>
      </header>
      <p class="chat-notice">
        {NOTICE} <ScopeChip coverage={meta.coverage} herbsInBook={meta.coverage.herbs_in_book} />
      </p>
      <div ref={log} class="chat-log" role="log" aria-live="polite" aria-label="บทสนทนา" aria-busy={waiting}>
        {chat.msgs.map((m, i) => <Msg key={i} m={m} />)}
        {waiting && <div class="cmsg a wait">กำลังค้นข้อมูล…</div>}
      </div>
      {chips.length > 0 && (
        <div class="chat-chips" role="group" aria-label="คำถามแนะนำ">
          {chips.map((c) => <button key={c} type="button" onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      <form class="chat-form" noValidate onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label for="chatInput" class="sr-only">พิมพ์คำถามถึงผู้ช่วย AI</label>
        <input ref={input} type="text" id="chatInput" maxLength={300} placeholder="ถามต่อจากผลตรวจ…" autoComplete="off"
          value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="primary" aria-label="ส่งคำถาม" aria-disabled={b.busy}>ส่ง</button>
      </form>
      <p class="sr-only" role="status">{status}</p>
    </section>
  );
}
