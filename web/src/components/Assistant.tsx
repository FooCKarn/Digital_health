import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, ask, briefAi, parseText, routeAi } from "../api";
import { toMsg } from "../chat/chatStore";
import { Msg } from "../chat/ChatPanel";
import type { Analysis } from "../hooks/useAnalysis";
import { useBusy } from "../hooks/useBusy";
import { AssistantLog, type AMsg } from "../model/assistantLog";
import { buildBrief, toFacts, type Brief } from "../model/brief";
import { addDays, startForDay, thaiDate } from "../model/dates";
import type { DiaryStore } from "../model/diary";
import { MOODS } from "../model/diary";
import { buildPayload, groupFlags, isKnownSeverity, notCheckedLabels } from "../model/panel";
import { hhmm, type ReminderStore } from "../model/reminder";
import type { TrackerStore } from "../model/tracker";
import { NOT_CHECKED, entryName, itemLabel, noFlag, noFlagNote } from "../texts";
import type { BriefOut, Meta, ParseProposal } from "../types";
import { ScopeChip } from "./ScopeChip";
import { SeverityBadge } from "./SeverityBadge";
import { getLang, pick, t } from "../i18n";

export type GoTo = "now" | "diary" | "mine";
const pageName = (to: GoTo) => ({ now: t("ช่วงนี้", "This period"), diary: t("บันทึก", "Diary"), mine: t("ข้อมูลของฉัน", "My data") })[to];
const aiDown = () => t("ตอนนี้ใช้ AI ไม่ได้ ลองใหม่อีกครั้ง หรือใช้ปุ่มในหน้าอื่นแทนได้", "The AI isn't available right now. Try again, or use the buttons on the other tabs.");
// ชิปแสดงตามภาษาที่เลือก แต่ส่งคำสั่งไทยตามเดิม (ตัวจับคำสั่งและตัวจำแนกคำถามของเซิร์ฟเวอร์เข้าใจภาษาไทย)
const chip = (th: string, en: string) => ({ th, label: t(th, en) });
const chipsWithItems = () => [chip("สรุปวันนี้", "Summarize today"), chip("ตรวจให้หน่อย", "Check my items"), chip("กินครบแล้ว", "I took everything"), chip("ทำไมถึงขึ้นคำเตือน", "Why is there a warning")];
const chipsEmpty = () => [chip("เพิ่มขิงกับยา warfarin", "Add ginger and warfarin"), chip("ขิงมีข้อควรระวังอะไร", "What should I watch out for with ginger")];

const errText = (e: unknown): string =>
  e instanceof ApiError && e.thaiMessage !== new ApiError("server").thaiMessage ? e.thaiMessage : t("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง", "Couldn't connect. Try again.");

const emptyHint = () => t("ยังไม่มีรายการที่ใช้อยู่ บอกชื่อสมุนไพรหรือยาที่ใช้ได้เลย เช่น “เพิ่มขิงกับยา warfarin”", "No items in use yet. Tell me the herbs or medicines you use, for example “add ginger and warfarin”.");

/**
 * หน้าผู้ช่วย = แชตเดียว: AI "เลือกเครื่องมือ" ให้ข้อความของคุณ (ผลที่ตรวจแล้วจากเซิร์ฟเวอร์) แล้วหน้าเว็บลงมือเอง
 * ข้อความตอบมาจากโค้ดหน้าเว็บหรือตัวตอบที่มีตัวตรวจเดิม (ถามตอบ/แยกรายการ) ไม่ใช่ข้อความที่ AI เขียนขึ้นเอง
 * การกระทำที่แก้ข้อมูล (บันทึกว่าใช้ ความรู้สึก เวลาเตือน) มีปุ่มเลิกทำ; การเพิ่มรายการต้องกดยืนยันก่อน
 */
export function Assistant({ store, diary, meta, today, analysis: a, go, reminder, log }: {
  store: TrackerStore; diary: DiaryStore; meta: Meta; today: string; analysis: Analysis; go: (to: GoTo) => void;
  reminder?: ReminderStore; log: AssistantLog;
}) {
  const [, setV] = useState(0);
  useEffect(() => log.subscribe(() => setV((v) => v + 1)), [log]);
  useEffect(() => diary.subscribe(() => setV((v) => v + 1)), [diary]);
  const [text, setText] = useState("");
  const b = useBusy();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [log.msgs.length]);

  const items = store.active();
  const r = a.result;

  const brief = (): Brief => buildBrief({
    items, isTaken: (id) => diary.isTaken(id, today), hasEntryToday: !!diary.entryOn(today), today,
    result: r, resultCurrent: a.current, notCheckedLabels: r ? notCheckedLabels(r, NOT_CHECKED) : [],
  });
  const say = (msg: string, extra: Partial<Extract<AMsg, { k: "text" }>> = {}) => log.add({ k: "text", t: msg, ...extra });

  const run = async (q: string, shown?: string) => {
    log.add({ k: "u", t: shown ?? q });
    let route: Awaited<ReturnType<typeof routeAi>> = { tool: "ask", item_ids: [], time: "", page: "", mood: 0 };
    try { route = await routeAi(q, items.map((i) => ({ id: i.id, label: itemLabel(i) }))); } catch { /* เลือกเครื่องมือไม่ได้ = ถือเป็นคำถามธรรมดา */ }
    try {
      switch (route.tool) {
        case "show_brief": log.add({ k: "brief", b: brief() }); return;
        case "show_check": return showCheck();
        case "mark_taken": case "mark_not_taken": return mark(route.item_ids, route.tool === "mark_taken", route.days ?? 0);
        case "add_items": return addItems(q);
        case "set_reminder": return setReminder(route.time);
        case "go_to": {
          const to = (["now", "diary", "mine"] as const).find((x) => x === route.page);
          if (!to) return answer(q);
          go(to); say(t(`เปิดหน้า ${pageName(to)} แล้ว`, `Opened ${pageName(to)}`)); return;
        }
        case "log_mood": return logMood(route.mood);
        default: return answer(q);
      }
    } catch (e) {
      say(`${t("ทำไม่สำเร็จ", "That didn't work")}: ${errText(e)}`, { tone: "err" });
    }
  };

  const answer = async (q: string) => {
    const payload = buildPayload(items, store.state.profile, today, Object.keys(meta.conditions));
    const ans = await ask({ ...(payload ?? {}), question: q, context_herbs: [] });
    const m = toMsg({ r: "a", t: ans.text_th, te: ans.text_en, src: ans.source, cites: ans.cites, web: ans.web_sources });
    if (!m) throw new ApiError("server");
    log.add({ k: "answer", m });
  };

  const showCheck = () => {
    if (items.length === 0) return say(emptyHint());
    if (!r || !a.current) return say(t("กำลังตรวจอยู่ ลองส่งอีกครั้งในอีกสักครู่", "Still checking. Try again in a moment."));
    const none = r.flags.length === 0 && r.aggregates.length === 0;
    const g = groupFlags(r);
    log.add({
      k: "check", none, headline: none ? noFlag() : (a.summary ? pick(a.summary.headline_th, a.summary.headline_en) : undefined) ?? t(`พบคำเตือน ${r.flags.length} รายการ`, `${r.flags.length} ${r.flags.length === 1 ? "warning" : "warnings"} found`),
      items: [...r.aggregates.map((x) => ({ severity: x.severity, text: pick(x.message_th, x.message_en) })), ...[...g.avoid, ...g.caution, ...g.info, ...g.other].map((f) => ({ severity: f.severity, text: pick(f.message_th, f.message_en) }))],
      scope: t(`สมุนไพร ${r.coverage.herbs_in_db} จาก ${meta.coverage.herbs_in_book} ชนิด · ${r.coverage.drug_classes_in_db} กลุ่มยา`, `${r.coverage.herbs_in_db} of ${meta.coverage.herbs_in_book} herbs · ${r.coverage.drug_classes_in_db} drug classes`),
    });
  };

  const mark = (ids: string[], want: boolean, days = 0) => {
    if (items.length === 0) return say(emptyHint());
    const hit = ids.map((id) => items.find((i) => i.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (hit.length === 0) return say(t("ยังไม่เข้าใจว่าจะบันทึกรายการไหน ลองพิมพ์ชื่อรายการ เช่น “กินขิงแล้ว” หรือ “กินครบแล้ว”", "I'm not sure which item to log. Try typing its name, like “I took ginger” or “I took everything”."));
    const names = hit.map((i) => itemLabel(i)).join(", ");
    if (want && days >= 2) return markRange(hit, names, days);
    const changed = hit.filter((i) => diary.isTaken(i.id, today) !== want);
    for (const i of changed) diary.toggleTaken(i.id, today);
    log.add({
      k: "done", t: changed.length === 0 ? t(`${names} ${want ? "บันทึกว่าใช้" : "ยังไม่ได้ใช้"}อยู่แล้ววันนี้`, `${names} ${want ? "is already logged as taken" : "is already logged as not taken"} today`) : t(`บันทึกแล้ว: ${want ? "ใช้" : "ไม่ได้ใช้"} ${names} วันนี้`, `Logged: ${want ? "took" : "did not take"} ${names} today`),
      undo: changed.length === 0 ? null : () => { for (const i of changed) diary.toggleTaken(i.id, today); say(t("เลิกทำแล้ว", "Undone")); },
    });
  };

  /** "กินขิงมาสัปดาห์นึงแล้ว": ลงบันทึกว่าใช้ทุกวันในช่วง days วันที่ผ่านมา (รวมวันนี้) ไม่แตะวันที่ติ๊กไว้แล้ว เลิกทำได้ */
  const markRange = (hit: typeof items, names: string, days: number) => {
    const first = addDays(today, -(days - 1));
    if (!first) return say(t("วันที่ไม่ถูกต้อง", "Invalid date"), { tone: "err" });
    const added: { id: string; dates: string[] }[] = hit.map((i) => {
      const dates = Array.from({ length: days }, (_, k) => addDays(today, -k)).filter((d): d is string => !!d && !diary.isTaken(i.id, d));
      return { id: i.id, dates };
    });
    for (const i of hit) diary.markRange(i.id, first, today);
    const n = added.reduce((s, x) => s + x.dates.length, 0);
    log.add({
      k: "done",
      t: n === 0 ? t(`${names} บันทึกว่าใช้ครบ ${days} วันที่ผ่านมาอยู่แล้ว`, `${names} is already logged as taken for the past ${days} days`) : t(`บันทึกแล้ว: ใช้ ${names} ย้อนหลัง ${days} วัน (${thaiDate(first)} ถึงวันนี้) ดูได้ที่ปฏิทินหน้าบันทึก`, `Logged: took ${names} for the past ${days} days (${thaiDate(first)} to today). See it in the calendar on the Diary tab.`),
      undo: n === 0 ? null : () => { for (const x of added) for (const d of x.dates) if (diary.isTaken(x.id, d)) diary.toggleTaken(x.id, d); say(t("เลิกทำแล้ว", "Undone")); },
    });
  };

  const addItems = async (q: string) => {
    try {
      log.add({ k: "proposal", p: await parseText(q), state: "open" });
    } catch (e) {
      say(`${errText(e)} ${t("เพิ่มเองได้ที่หน้า ช่วงนี้", "You can add items yourself in the This period tab.")}`, { tone: "err", go: { label: t("ไปหน้า ช่วงนี้", "Go to This period"), to: "now" } });
    }
  };

  const setReminder = (time: string) => {
    if (!reminder) return say(t("ตั้งเตือนที่นี่ไม่ได้", "Reminders cannot be set here"));
    const prev = reminder.state.time;
    if (time === "off") {
      reminder.setTime(null);
      return log.add({ k: "done", t: t("ปิดเตือนแล้ว", "Reminder turned off"), undo: prev ? () => { reminder.setTime(prev); say(t(`เปิดเตือน ${prev} คืนแล้ว`, `Reminder at ${prev} restored`)); } : null });
    }
    if (!reminder.setTime(time)) return say(t("เวลาไม่ถูกต้อง ลองพิมพ์ เช่น “เตือน 20:00”", "That time doesn't look right. Try something like “remind me at 20:00”."));
    if (hhmm(new Date()) >= time) reminder.markFired(today); // เวลาที่ตั้งผ่านไปแล้ววันนี้: เริ่มเตือนพรุ่งนี้
    try { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission(); } catch { /* ใช้แบนเนอร์ในหน้าแทน */ }
    log.add({
      k: "done", t: t(`ตั้งเตือนทุกวันเวลา ${time} แล้ว (ทำงานเมื่อเปิดหน้าเว็บนี้ค้างไว้ในเบราว์เซอร์ เก็บเวลาในเครื่องนี้เท่านั้น)`, `Daily reminder set for ${time} (it works only while this page stays open in your browser, and the time is stored on this device only)`),
      undo: () => { reminder.setTime(prev); say(prev ? t(`คืนเวลาเตือนเดิม ${prev} แล้ว`, `Previous reminder time ${prev} restored`) : t("ปิดเตือนแล้ว", "Reminder turned off")); },
    });
  };

  const logMood = (mood: number) => {
    const old = diary.entryOn(today);
    const res = diary.saveEntry({ date: today, mood, symptom: old?.symptom ?? null, sys: old?.sys ?? null, dia: old?.dia ?? null, glucose: old?.glucose ?? null, weight: old?.weight ?? null });
    if (!res.ok) return say(res.message, { tone: "err" });
    const m = MOODS[mood - 1];
    log.add({
      k: "done", t: t(`บันทึกความรู้สึกวันนี้แล้ว: ${m.th} (${mood} จาก 5)`, `Logged how you feel today: ${m.en} (${mood} out of 5)`),
      undo: () => { if (old) { const { id: _id, ...rest } = old; diary.saveEntry(rest); } else diary.removeEntry(today); say(t("เลิกทำแล้ว", "Undone")); },
    });
  };

  const send = (raw: string, shown?: string) => {
    const q = raw.trim();
    if (!q) return;
    void b.run(async () => { setText(""); await run(q, shown); input.current?.focus(); });
  };

  const chips = items.length ? chipsWithItems() : chipsEmpty();
  return (
    <section class="assistant" aria-labelledby="asst-h">
      <header class="asst-head">
        <h2 id="asst-h">{t("ผู้ช่วย", "Assistant")}</h2>
        <p class="meta">
          <ScopeChip coverage={r?.coverage ?? meta.coverage} herbsInBook={meta.coverage.herbs_in_book} /> {t("ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · ตอบจากฐานข้อมูลของเครื่องมือนี้ก่อน ถ้าไม่มีจะค้นเว็บภายนอกพร้อมแหล่งอ้างอิง · ห้ามพิมพ์ข้อมูลส่วนตัว", "Not a diagnosis · data is a draft · answers come from this tool's database first, and if it has none, from an outside web search with sources · do not type personal information")}
        </p>
      </header>

      <div class="asst-log" role="log" aria-live="polite" aria-label={t("บทสนทนากับผู้ช่วย", "Conversation with the assistant")} aria-busy={b.busy}>
        {log.msgs.length === 0 && (
          <div class="asst-empty">
            <p><strong>{t("ถามหรือสั่งผู้ช่วยได้เลย", "Ask or tell the assistant anything")}</strong></p>
            <p class="meta">{t("เช่น สรุปวันนี้ · ตรวจให้หน่อย · กินขิงแล้ว · ตั้งเตือน 20:00 · วันนี้รู้สึกดี · ขิงมีข้อควรระวังอะไร", "For example: summarize today · check my items · I took ginger · remind me at 20:00 · I feel good today · what should I watch out for with ginger")}</p>
          </div>
        )}
        {log.msgs.map((m, i) => <Bubble key={i} m={m} i={i} {...{ log, store, meta, today, go }} />)}
        {b.busy && <div class="cmsg a wait" role="status">{t("กำลังทำงาน…", "Working…")}</div>}
        <div ref={end} />
      </div>

      <div class="asst-chips" role="group" aria-label={t("ตัวอย่างคำสั่ง", "Example commands")}>
        {chips.map((c) => <button key={c.th} type="button" aria-disabled={b.busy} onClick={() => send(c.th, c.label)}>{c.label}</button>)}
      </div>
      <form class="asst-form" noValidate onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label for="asst-in" class="sr-only">{t("พิมพ์ข้อความถึงผู้ช่วย", "Type a message to the assistant")}</label>
        <input ref={input} id="asst-in" type="text" maxLength={300} autoComplete="off" placeholder={t("พิมพ์ข้อความ…", "Type a message…")} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="primary" aria-label={t("ส่งข้อความ", "Send message")} aria-disabled={b.busy}>{t("ส่ง", "Send")}</button>
      </form>
      <p class="meta asst-foot">{t("ข้อความที่พิมพ์ส่งไปประมวลผลเมื่อกดส่งเท่านั้น (ถ้าฐานข้อมูลไม่มีคำตอบ จะส่งเฉพาะข้อความคำถามไปค้นเว็บภายนอก) ข้อมูลบันทึกสุขภาพ (ความรู้สึก อาการ ค่าที่วัด) และรายการที่ใช้ไม่ถูกส่งไปค้น", "What you type is processed only when you press send (if the database has no answer, only the question text is sent to an outside web search). Your health diary (mood, symptoms, measurements) and your list of items are not sent to the search.")}{" "}
        {log.msgs.length > 0 && <button type="button" class="link-btn" onClick={() => log.clear()}>{t("ล้างบทสนทนา", "Clear conversation")}</button>}
      </p>
    </section>
  );
}

function Bubble({ m, i, log, store, meta, today, go }: {
  m: AMsg; i: number; log: AssistantLog; store: TrackerStore; meta: Meta; today: string; go: (to: GoTo) => void;
}) {
  switch (m.k) {
    case "u": return <div class="cmsg u">{m.t}</div>;
    case "text": return (
      <div class={m.tone === "err" ? "cmsg err" : "cmsg a"} role={m.tone === "err" ? "alert" : undefined}>
        {m.t}
        {m.go && <div><button type="button" onClick={() => go(m.go!.to)}>{m.go.label}</button></div>}
      </div>
    );
    case "answer": return <Msg m={m.m} />;
    case "done": return (
      <div class="cmsg a">
        {m.t}
        {m.undo && <div><button type="button" onClick={() => { const u = m.undo!; log.patch(i, { ...m, undo: null }); u(); }}>{t("เลิกทำ", "Undo")}</button></div>}
      </div>
    );
    case "brief": return <BriefCard b={m.b} today={today} go={go} />;
    case "check": return (
      <div class="cmsg a card-msg">
        <strong>{m.headline}</strong>
        {m.none && <p class="meta">{noFlagNote()}</p>}
        <ul class="asst-flags">
          {m.items.map((x, k) => (
            <li key={k}>{isKnownSeverity(x.severity) ? <SeverityBadge kind={x.severity} /> : <span class="chip">{t(`ระดับ ${x.severity}`, `Level ${x.severity}`)}</span>} <span>{x.text}</span></li>
          ))}
        </ul>
        <p class="meta">{m.scope} · {t("ไม่ใช่การวินิจฉัย ข้อมูลยังเป็นร่าง", "Not a diagnosis. The data is a draft.")}</p>
        <button type="button" onClick={() => go("now")}>{t("ดูรายละเอียดและที่มา", "See details and sources")}</button>
      </div>
    );
    case "proposal": return <ProposalCard p={m.p} state={m.state} meta={meta} store={store} today={today} onDone={(msg) => { log.patch(i, { ...m, state: "done" }); log.add({ k: "text", t: msg }); }} />;
  }
}

function BriefCard({ b, today, go }: { b: Brief; today: string; go: (to: GoTo) => void }) {
  const [out, setOut] = useState<BriefOut | null>(null);
  const [err, setErr] = useState("");
  const busy = useBusy();
  const facts = toFacts(b);
  const none = b.warnings !== null && b.warnings.total === 0;
  const ai = () => busy.run(async () => { setErr(""); try { setOut(await briefAi(facts)); } catch { setErr(aiDown()); } });
  return (
    <div class="cmsg a card-msg">
      <strong>{`${t("สรุปวันนี้", "Today's summary")} · ${thaiDate(today)}`}</strong>
      {b.itemCount === 0 ? <p>{t("ยังไม่มีรายการที่ใช้อยู่", "No items in use yet")}</p> : (
        <ul class="brief-list">
          <li><span>{t("การใช้วันนี้", "Today's doses")}</span> {b.untaken.length === 0 ? t(`กดว่าใช้แล้วครบ ${b.itemCount} รายการ`, `All ${b.itemCount} items marked as taken`) : t(`ใช้แล้ว ${b.takenCount} จาก ${b.itemCount} รายการ ยังไม่ได้กด: ${b.untaken.map((x) => x.label).join(", ")}`, `${b.takenCount} of ${b.itemCount} items taken. Not yet marked: ${b.untaken.map((x) => x.label).join(", ")}`)}</li>
          <li><span>{t("ผลตรวจ", "Check result")}</span> {b.warnings === null ? t("ยังไม่มีผลล่าสุด", "No latest result yet") : none ? `${noFlag()} (${noFlagNote()})` : t(`พบคำเตือน ${b.warnings.total} รายการ${b.warnings.avoid ? ` (ควรหลีกเลี่ยง ${b.warnings.avoid})` : ""}`, `${b.warnings.total} ${b.warnings.total === 1 ? "warning" : "warnings"} found${b.warnings.avoid ? ` (${b.warnings.avoid} to avoid)` : ""}`)}</li>
          {b.notChecked.length > 0 && <li><span>{t("ยังไม่ได้ตรวจเงื่อนไข", "Conditions not checked")}</span> {b.notChecked.join(", ")} {t("(ยังไม่ได้กรอก)", "(left blank)")}</li>}
          <li><span>{t("บันทึกสุขภาพ", "Health diary")}</span> {b.noEntryToday ? t("วันนี้ยังไม่ได้จดบันทึก", "Nothing logged today") : t("จดบันทึกวันนี้แล้ว", "Logged today")}</li>
          {b.longestUse && <li><span>{t("ใช้มานานสุด", "Longest in use")}</span> {t(`${b.longestUse.label} ใช้มา ${b.longestUse.days} วัน`, `${b.longestUse.label}, ${b.longestUse.days} days`)}</li>}
        </ul>
      )}
      <p class="meta">{t("คำนวณจากข้อมูลในเครื่องคุณ ไม่ใช่การวินิจฉัย", "Calculated from the data on your device. Not a diagnosis.")}</p>
      {b.itemCount > 0 && <button type="button" aria-disabled={busy.busy} onClick={ai}>{t("ให้ AI เรียบเรียงสรุปนี้ (ไม่บังคับ)", "Have the AI reword this summary (optional)")}</button>}
      {err && <p class="err" role="alert">{err}</p>}
      {out && <div class="explanation"><p class="chip">{out.source === "llm" ? t("AI เรียบเรียงจากข้อมูลด้านบน (ผ่านตัวตรวจข้อความแล้ว)", "Reworded by the AI from the data above (passed the text checker)") : t("ข้อความสำรองจากข้อมูลด้านบน", "Fallback text from the data above")}</p>{getLang() === "en" && !out.summary_en && <p class="meta">This summary is only available in Thai.</p>}<p>{pick(out.summary_th, out.summary_en)}</p></div>}
      <button type="button" onClick={() => go("diary")}>{t("ไปหน้าบันทึก", "Go to Diary")}</button>
    </div>
  );
}

type Row = { key: string; kind: "herb" | "drug"; ref: string; label: string; day?: number };

/** ข้อเสนอเพิ่มรายการจาก AI: ต้องกดยืนยันก่อนจึงเพิ่ม */
function ProposalCard({ p, state, meta, store, today, onDone }: { p: ParseProposal; state: "open" | "done"; meta: Meta; store: TrackerStore; today: string; onDone: (msg: string) => void }) {
  const okHerbs = p.herbs.filter((h) => meta.herbs.some((x) => x.id === h.id));
  const dropped = p.dropped + (p.herbs.length - okHerbs.length);
  const rows: Row[] = [
    ...okHerbs.map((h): Row => ({ key: `h-${h.id}`, kind: "herb", ref: h.id, label: entryName(meta, h.id), day: h.days_in_use })),
    ...p.drugs.map((d): Row => { const k = meta.drugs.find((x) => x.toLowerCase() === d.toLowerCase()) ?? d; return { key: `d-${k}`, kind: "drug", ref: k, label: k }; }),
  ];
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<string[]>([]);
  const chosen = rows.filter((r) => !off[r.key]);
  const confirm = () => {
    const bad: string[] = [], added: string[] = [];
    for (const r of chosen) {
      const start = (r.day && startForDay(Math.min(Math.max(r.day, 1), 365), today)) || today;
      const res = store.addItem({ kind: r.kind, ref: r.ref, label: r.label, start_date: start });
      if (res.ok) added.push(r.label); else bad.push(`${r.label}: ${res.message}`);
    }
    setErrs(bad);
    if (added.length) onDone(t(`เพิ่ม ${added.join(", ")} แล้ว${bad.length ? ` (เพิ่มไม่ได้: ${bad.join("; ")})` : ""} ผลตรวจจะอัปเดตเอง ถ้าใช้มาก่อนวันนี้ แก้วันเริ่มได้ที่หน้า ช่วงนี้`, `Added ${added.join(", ")}${bad.length ? ` (could not add: ${bad.join("; ")})` : ""}. The check updates by itself. If you started before today, change the start date in the This period tab.`));
  };
  return (
    <div class="cmsg a card-msg">
      {rows.length === 0 ? <p>{t("AI ไม่พบสมุนไพรหรือยาในข้อความ ลองพิมพ์ชื่อให้ชัดขึ้น", "The AI didn't find any herbs or medicines in your message. Try typing the names more clearly.")}</p> : (
        <>
          <p>{state === "open" ? t("AI แยกได้ตามนี้ เทียบกับที่พิมพ์ แล้วเอาติ๊กออกจากอันที่ไม่ใช่ ก่อนกดเพิ่ม (ยังไม่มีอะไรถูกเพิ่ม)", "The AI picked out these items. Check them against what you typed and untick any that are wrong before pressing Add. Nothing has been added yet.") : t("ข้อเสนอนี้ใช้ไปแล้ว", "This suggestion has been used")}</p>
          <ul class="proposal">
            {rows.map((r) => (
              <li key={r.key}>
                <label><input type="checkbox" disabled={state === "done"} checked={!off[r.key]} onChange={(e) => setOff({ ...off, [r.key]: !e.currentTarget.checked })} />
                  {` ${r.label} (${r.kind === "herb" ? t("สมุนไพร", "herb") : t("ยา", "medicine")}${r.day ? ` · ${t(`ใช้มา ${r.day} วัน`, `in use for ${r.day} days`)}` : ""})`}</label>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.unmatched.length > 0 && <p class="warn">{`${t("ไม่พบในฐานข้อมูล/ไม่แน่ใจ (ไม่ถูกเสนอให้เพิ่ม)", "Not in the database or unsure (not suggested for adding)")}: ${p.unmatched.join(", ")}`}</p>}
      {dropped > 0 && <p class="warn">{t(`AI ส่งชื่อที่ไม่อยู่ในฐานข้อมูลมา ${dropped} รายการ ตัดออกแล้ว`, `The AI returned ${dropped} ${dropped === 1 ? "name" : "names"} that are not in the database. ${dropped === 1 ? "It was" : "They were"} removed.`)}</p>}
      {state === "open" && rows.length > 0 && <button type="button" class="primary" aria-disabled={chosen.length === 0} onClick={confirm}>{t(`เพิ่ม ${chosen.length} รายการ`, `Add ${chosen.length} ${chosen.length === 1 ? "item" : "items"}`)}</button>}
      {errs.map((e) => <p class="err" role="alert" key={e}>{e}</p>)}
    </div>
  );
}
