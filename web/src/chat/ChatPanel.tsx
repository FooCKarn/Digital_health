import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, ask } from "../api";
import { Evidence } from "../components/FlagCard";
import { ScopeChip } from "../components/ScopeChip";
import { useBusy } from "../hooks/useBusy";
import { buildPayload } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { Meta } from "../types";
import { toMsg, type ChatMsg, type ChatStore } from "./chatStore";
import { t, tMap } from "../i18n";

// ข้อความตายตัว
const notice = () => t("ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · ตอบจากฐานข้อมูลของเครื่องมือนี้ก่อน ถ้าไม่มีจะค้นเว็บภายนอกพร้อมแหล่งอ้างอิง · ห้ามพิมพ์ข้อมูลส่วนตัว", "Not a diagnosis · data is a draft · answers come from this tool's database first, and if it has none, from an outside web search with sources · do not type personal information");
// หน้าใหม่ตรวจซ้ำอัตโนมัติ (ไม่มีปุ่ม ตรวจ) จึงไม่ใช้ถ้อยคำเดิม "กดตรวจใหม่"
const staleLine = () => t("ผลตรวจกำลังอัปเดตหลังคุณแก้ข้อมูล ถามอีกครั้งเมื่อผลใหม่ขึ้น จะได้คำตอบที่ตรงกับข้อมูลล่าสุด", "The result is updating after your edit. Ask again once the new result shows, so the answer matches your latest data.");
const changed = () => t("ผลตรวจเปลี่ยนแล้ว คำตอบก่อนหน้าอาจไม่ตรงกับข้อมูลปัจจุบัน", "The result has changed. Earlier answers may not match your current data any more.");
const SRC_LABEL: Record<string, string> = tMap<string>(
  { database: "ข้อความจากฐานข้อมูล", web: "ค้นจากเว็บภายนอก (ทีมยังไม่ได้ตรวจ)", llm: "AI เรียบเรียงจากข้อความที่ค้นได้", refusal: "ตอบไม่ได้ / ไม่มีข้อมูล", emergency: "ข้อควรทราบเร่งด่วน" },
  { database: "Text from the database", web: "From an outside web search (not checked by the team)", llm: "Reworded by the AI from the text it found", refusal: "Cannot answer / no information", emergency: "Urgent safety note" },
);

/** ข้อความไทยตายตัว ไม่แสดงรหัสภายใน: ใช้ข้อความเซิร์ฟเวอร์เฉพาะ 400/503 ที่เป็นภาษาไทย (ApiError กรองแล้ว) */
function errText(e: unknown): string {
  if (e instanceof ApiError && (e.kind === "bad_request" || e.kind === "unavailable") && e.thaiMessage !== new ApiError("server").thaiMessage) return e.thaiMessage;
  if (e instanceof ApiError && e.kind === "bad_request") return t("คำถามหรือข้อมูลไม่ถูกต้อง", "The question or data is not valid");
  return t("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง", "Couldn't connect. Try again.");
}

export function Msg({ m }: { m: ChatMsg }) {
  if (m.r !== "a") return m.r === "e" ? <div class="cmsg err" role="alert">{m.t}</div> : <div class={`cmsg ${m.r}`}>{m.t}</div>;
  const em = m.src === "emergency";
  return (
    <div class={em ? "cmsg a emerg" : "cmsg a"} role={em ? "alert" : undefined}>
      <span class="src">{SRC_LABEL[m.src] ?? t("ผู้ช่วย AI", "AI assistant")}</span>
      {m.t}
      {m.old && <span class="stl">{staleLine()}</span>}
      {m.web && m.web.length > 0 && (
        <span class="web-sources">
          {t("แหล่งอ้างอิง:", "Sources:")}{" "}
          {m.web.map((w, i) => <a key={i} href={w.url} target="_blank" rel="noopener noreferrer nofollow">{w.title}</a>)}
        </span>
      )}
      {m.cites.filter((c) => c.evidence_quote).slice(0, 6).map((c, i) => (
        <Evidence key={i} summary={`${t("ดูหลักฐาน", "See the evidence")}: ${c.herb_name_th}`} quote={c.evidence_quote!} page={c.source_page} pdfPage={c.pdf_page} doc={c.source_doc_th}>
          <p class="meta">{`${t("รหัสรายการ", "Item code")} ${c.item_id} · ${c.verified ? t("ตรวจแล้ว", "Checked") : t("ร่าง: ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ", "Draft: not yet reviewed by experts")}`}</p>
        </Evidence>
      ))}
    </div>
  );
}

export type OpenRequest = { n: number; prefill?: string } | null;

type Props = {
  chat: ChatStore; store: TrackerStore; meta: Meta; today: string;
  open: OpenRequest; onClose(): void;
};

/** แผงแชต (dialog ไม่เป็น modal) อยู่ใน DOM ตลอดเพื่อให้ aria-controls ชี้ได้ ซ่อนด้วย hidden */
export function ChatPanel({ chat, store, meta, today, open, onClose }: Props) {
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
    if (seen.current !== key) chat.note(changed());
    seen.current = key;
  }, [key]);

  useEffect(() => {
    if (!open) return;
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
        const m = toMsg({ r: "a", t: a.text_th, src: a.source, cites: a.cites, old, web: a.web_sources });
        if (!m) throw new ApiError("server");
        chat.add(m);
        if (Array.isArray(a.follow_ups)) setChips(a.follow_ups.filter((x) => typeof x === "string").slice(0, 3));
      } catch (e) {
        if (cg !== chat.gen) return;
        chat.add({ r: "e", t: `${t("ถามไม่สำเร็จ", "Couldn't ask")}: ${errText(e)}` });
      } finally {
        setWaitGen(null);
        input.current?.focus();
      }
    });
  };

  const clear = () => {
    chat.clear();
    setChips(meta.chat_followups_th.slice(0, 3));
    setStatus(t("ล้างประวัติแชตแล้ว", "Chat history cleared"));
    input.current?.focus();
  };
  const waiting = waitGen !== null && waitGen === chat.gen;

  return (
    <section id="chatPanel" role="dialog" aria-label={t("ผู้ช่วย AI (ต้นแบบ)", "AI assistant (prototype)")} hidden={!open}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <header>
        <h2>{t("ผู้ช่วย AI (ต้นแบบ)", "AI assistant (prototype)")}</h2>
        <span class="row-actions">
          <button type="button" aria-label={t("ล้างประวัติแชต", "Clear chat history")} onClick={clear}>{t("ล้างประวัติ", "Clear chat")}</button>
          <button type="button" aria-label={t("ปิดผู้ช่วย AI", "Close AI assistant")} onClick={onClose}>{t("ปิด", "Close")}</button>
        </span>
      </header>
      <p class="chat-notice">
        {notice()} <ScopeChip coverage={meta.coverage} herbsInBook={meta.coverage.herbs_in_book} />
      </p>
      <div ref={log} class="chat-log" role="log" aria-live="polite" aria-label={t("บทสนทนา", "Conversation")} aria-busy={waiting}>
        {chat.msgs.map((m, i) => <Msg key={i} m={m} />)}
        {waiting && <div class="cmsg a wait">{t("กำลังค้นข้อมูล…", "Looking it up…")}</div>}
      </div>
      {chips.length > 0 && (
        <div class="chat-chips" role="group" aria-label={t("คำถามแนะนำ", "Suggested questions")}>
          {chips.map((c) => <button key={c} type="button" onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      <form class="chat-form" noValidate onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label for="chatInput" class="sr-only">{t("พิมพ์คำถามถึงผู้ช่วย AI", "Type a question for the AI assistant")}</label>
        <input ref={input} type="text" id="chatInput" maxLength={300} placeholder={t("ถามต่อจากผลตรวจ…", "Ask a follow-up about the result…")} autoComplete="off"
          value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="primary" aria-label={t("ส่งคำถาม", "Send question")} aria-disabled={b.busy}>{t("ส่ง", "Send")}</button>
      </form>
      <p class="sr-only" role="status">{status}</p>
    </section>
  );
}
