import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, ask, briefAi, parseText, routeAi } from "../api";
import { toMsg } from "../chat/chatStore";
import { Msg } from "../chat/ChatPanel";
import type { Analysis } from "../hooks/useAnalysis";
import { useBusy } from "../hooks/useBusy";
import { AssistantLog, type AMsg } from "../model/assistantLog";
import { buildBrief, toFacts, type Brief } from "../model/brief";
import { startForDay, thaiDate } from "../model/dates";
import type { DiaryStore } from "../model/diary";
import { MOODS } from "../model/diary";
import { buildPayload, groupFlags, isKnownSeverity, notCheckedLabels } from "../model/panel";
import { hhmm, type ReminderStore } from "../model/reminder";
import type { TrackerStore } from "../model/tracker";
import { NOT_CHECKED, NO_FLAG, NO_FLAG_NOTE } from "../texts";
import type { BriefOut, Meta, ParseProposal } from "../types";
import { ScopeChip } from "./ScopeChip";
import { SeverityBadge } from "./SeverityBadge";

export type GoTo = "now" | "diary" | "mine";
const PAGE_NAME: Record<GoTo, string> = { now: "ช่วงนี้", diary: "บันทึก", mine: "ข้อมูลของฉัน" };
const AI_DOWN = "ตอนนี้ใช้ AI ไม่ได้ ลองใหม่อีกครั้ง หรือใช้ปุ่มในหน้าอื่นแทนได้";
const SERVER = new ApiError("server").thaiMessage;
const CHIPS_WITH_ITEMS = ["สรุปวันนี้", "ตรวจให้หน่อย", "กินครบแล้ว", "ทำไมถึงขึ้นคำเตือน"];
const CHIPS_EMPTY = ["เพิ่มขิงกับยา warfarin", "ขิงมีข้อควรระวังอะไร"];

const errText = (e: unknown): string =>
  e instanceof ApiError && e.thaiMessage !== SERVER ? e.thaiMessage : "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง";

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
  const say = (t: string, extra: Partial<Extract<AMsg, { k: "text" }>> = {}) => log.add({ k: "text", t, ...extra });

  const run = async (q: string) => {
    log.add({ k: "u", t: q });
    let route: Awaited<ReturnType<typeof routeAi>> = { tool: "ask", item_ids: [], time: "", page: "", mood: 0 };
    try { route = await routeAi(q, items.map((i) => ({ id: i.id, label: i.label }))); } catch { /* เลือกเครื่องมือไม่ได้ = ถือเป็นคำถามธรรมดา */ }
    try {
      switch (route.tool) {
        case "show_brief": log.add({ k: "brief", b: brief() }); return;
        case "show_check": return showCheck();
        case "mark_taken": case "mark_not_taken": return mark(route.item_ids, route.tool === "mark_taken");
        case "add_items": return addItems(q);
        case "set_reminder": return setReminder(route.time);
        case "go_to": {
          const to = (["now", "diary", "mine"] as const).find((x) => x === route.page);
          if (!to) return answer(q);
          go(to); say(`เปิดหน้า ${PAGE_NAME[to]} แล้ว`); return;
        }
        case "log_mood": return logMood(route.mood);
        default: return answer(q);
      }
    } catch (e) {
      say(`ทำไม่สำเร็จ: ${errText(e)}`, { tone: "err" });
    }
  };

  const answer = async (q: string) => {
    const payload = buildPayload(items, store.state.profile, today, Object.keys(meta.conditions));
    const ans = await ask({ ...(payload ?? {}), question: q, context_herbs: [] });
    const m = toMsg({ r: "a", t: ans.text_th, src: ans.source, cites: ans.cites });
    if (!m) throw new ApiError("server");
    log.add({ k: "answer", m });
  };

  const showCheck = () => {
    if (items.length === 0) return say("ยังไม่มีรายการที่ใช้อยู่ บอกชื่อสมุนไพรหรือยาที่ใช้ได้เลย เช่น “เพิ่มขิงกับยา warfarin”");
    if (!r || !a.current) return say("กำลังตรวจอยู่ ลองส่งอีกครั้งในอีกสักครู่");
    const none = r.flags.length === 0 && r.aggregates.length === 0;
    const g = groupFlags(r);
    log.add({
      k: "check", none, headline: none ? NO_FLAG : a.summary?.headline_th ?? `พบคำเตือน ${r.flags.length} รายการ`,
      items: [...r.aggregates.map((x) => ({ severity: x.severity, text: x.message_th })), ...[...g.avoid, ...g.caution, ...g.info, ...g.other].map((f) => ({ severity: f.severity, text: f.message_th }))],
      scope: `สมุนไพร ${r.coverage.herbs_in_db} จาก ${meta.coverage.herbs_in_book} ชนิด · ${r.coverage.drug_classes_in_db} กลุ่มยา`,
    });
  };

  const mark = (ids: string[], want: boolean) => {
    const hit = ids.map((id) => items.find((i) => i.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (hit.length === 0) return say("ยังไม่เข้าใจว่าจะบันทึกรายการไหน ลองพิมพ์ชื่อรายการ เช่น “กินขิงแล้ว” หรือ “กินครบแล้ว”");
    const changed = hit.filter((i) => diary.isTaken(i.id, today) !== want);
    for (const i of changed) diary.toggleTaken(i.id, today);
    const names = hit.map((i) => i.label).join(", ");
    log.add({
      k: "done", t: changed.length === 0 ? `${names} ${want ? "บันทึกว่าใช้" : "ยังไม่ได้ใช้"}อยู่แล้ววันนี้` : `บันทึกแล้ว: ${want ? "ใช้" : "ไม่ได้ใช้"} ${names} วันนี้`,
      undo: changed.length === 0 ? null : () => { for (const i of changed) diary.toggleTaken(i.id, today); say("เลิกทำแล้ว"); },
    });
  };

  const addItems = async (q: string) => {
    try {
      log.add({ k: "proposal", p: await parseText(q), state: "open" });
    } catch (e) {
      say(`${errText(e)} เพิ่มเองได้ที่หน้า ช่วงนี้`, { tone: "err", go: { label: "ไปหน้า ช่วงนี้", to: "now" } });
    }
  };

  const setReminder = (time: string) => {
    if (!reminder) return say("ตั้งเตือนที่นี่ไม่ได้");
    const prev = reminder.state.time;
    if (time === "off") {
      reminder.setTime(null);
      return log.add({ k: "done", t: "ปิดเตือนแล้ว", undo: prev ? () => { reminder.setTime(prev); say(`เปิดเตือน ${prev} คืนแล้ว`); } : null });
    }
    if (!reminder.setTime(time)) return say("เวลาไม่ถูกต้อง ลองพิมพ์ เช่น “เตือน 20:00”");
    if (hhmm(new Date()) >= time) reminder.markFired(today); // เวลาที่ตั้งผ่านไปแล้ววันนี้: เริ่มเตือนพรุ่งนี้
    try { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission(); } catch { /* ใช้แบนเนอร์ในหน้าแทน */ }
    log.add({
      k: "done", t: `ตั้งเตือนทุกวันเวลา ${time} แล้ว (ทำงานเมื่อเปิดหน้าเว็บนี้ค้างไว้ในเบราว์เซอร์ เก็บเวลาในเครื่องนี้เท่านั้น)`,
      undo: () => { reminder.setTime(prev); say(prev ? `คืนเวลาเตือนเดิม ${prev} แล้ว` : "ปิดเตือนแล้ว"); },
    });
  };

  const logMood = (mood: number) => {
    const old = diary.entryOn(today);
    const res = diary.saveEntry({ date: today, mood, symptom: old?.symptom ?? null, sys: old?.sys ?? null, dia: old?.dia ?? null, glucose: old?.glucose ?? null, weight: old?.weight ?? null });
    if (!res.ok) return say(res.message, { tone: "err" });
    const m = MOODS[mood - 1];
    log.add({
      k: "done", t: `บันทึกความรู้สึกวันนี้แล้ว: ${m.th} (${mood} จาก 5)`,
      undo: () => { if (old) { const { id: _id, ...rest } = old; diary.saveEntry(rest); } else diary.removeEntry(today); say("เลิกทำแล้ว"); },
    });
  };

  const send = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    void b.run(async () => { setText(""); await run(q); input.current?.focus(); });
  };

  const chips = items.length ? CHIPS_WITH_ITEMS : CHIPS_EMPTY;
  return (
    <section class="assistant" aria-labelledby="asst-h">
      <header class="asst-head">
        <h2 id="asst-h">ผู้ช่วย</h2>
        <p class="meta">
          <ScopeChip coverage={r?.coverage ?? meta.coverage} herbsInBook={meta.coverage.herbs_in_book} /> ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · ตอบจากฐานข้อมูลของเครื่องมือนี้เท่านั้น · ห้ามพิมพ์ข้อมูลส่วนตัว
        </p>
      </header>

      <div class="asst-log" role="log" aria-live="polite" aria-label="บทสนทนากับผู้ช่วย" aria-busy={b.busy}>
        {log.msgs.length === 0 && (
          <div class="asst-empty">
            <p><strong>ถามหรือสั่งผู้ช่วยได้เลย</strong></p>
            <p class="meta">เช่น สรุปวันนี้ · ตรวจให้หน่อย · กินขิงแล้ว · ตั้งเตือน 20:00 · วันนี้รู้สึกดี · ขิงมีข้อควรระวังอะไร</p>
          </div>
        )}
        {log.msgs.map((m, i) => <Bubble key={i} m={m} i={i} {...{ log, store, meta, today, go }} />)}
        {b.busy && <div class="cmsg a wait" role="status">กำลังทำงาน…</div>}
        <div ref={end} />
      </div>

      <div class="asst-chips" role="group" aria-label="ตัวอย่างคำสั่ง">
        {chips.map((c) => <button key={c} type="button" aria-disabled={b.busy} onClick={() => send(c)}>{c}</button>)}
      </div>
      <form class="asst-form" noValidate onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label for="asst-in" class="sr-only">พิมพ์ข้อความถึงผู้ช่วย</label>
        <input ref={input} id="asst-in" type="text" maxLength={300} autoComplete="off" placeholder="พิมพ์ข้อความ…" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="primary" aria-label="ส่งข้อความ" aria-disabled={b.busy}>ส่ง</button>
      </form>
      <p class="meta asst-foot">ข้อความที่พิมพ์ส่งไปประมวลผลเมื่อกดส่งเท่านั้น ข้อมูลบันทึกสุขภาพ (ความรู้สึก อาการ ค่าที่วัด) ไม่ถูกส่ง{" "}
        {log.msgs.length > 0 && <button type="button" class="link-btn" onClick={() => log.clear()}>ล้างบทสนทนา</button>}
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
        {m.undo && <div><button type="button" onClick={() => { const u = m.undo!; log.patch(i, { ...m, undo: null }); u(); }}>เลิกทำ</button></div>}
      </div>
    );
    case "brief": return <BriefCard b={m.b} today={today} go={go} />;
    case "check": return (
      <div class="cmsg a card-msg">
        <strong>{m.headline}</strong>
        {m.none && <p class="meta">{NO_FLAG_NOTE}</p>}
        <ul class="asst-flags">
          {m.items.map((x, k) => (
            <li key={k}>{isKnownSeverity(x.severity) ? <SeverityBadge kind={x.severity} /> : <span class="chip">{`ระดับ ${x.severity}`}</span>} <span>{x.text}</span></li>
          ))}
        </ul>
        <p class="meta">{m.scope} · ไม่ใช่การวินิจฉัย ข้อมูลยังเป็นร่าง</p>
        <button type="button" onClick={() => go("now")}>ดูรายละเอียดและที่มา</button>
      </div>
    );
    case "proposal": return <ProposalCard p={m.p} state={m.state} meta={meta} store={store} today={today} onDone={(t) => { log.patch(i, { ...m, state: "done" }); log.add({ k: "text", t }); }} />;
  }
}

function BriefCard({ b, today, go }: { b: Brief; today: string; go: (to: GoTo) => void }) {
  const [out, setOut] = useState<BriefOut | null>(null);
  const [err, setErr] = useState("");
  const busy = useBusy();
  const facts = toFacts(b);
  const none = b.warnings !== null && b.warnings.total === 0;
  const ai = () => busy.run(async () => { setErr(""); try { setOut(await briefAi(facts)); } catch { setErr(AI_DOWN); } });
  return (
    <div class="cmsg a card-msg">
      <strong>{`สรุปวันนี้ · ${thaiDate(today)}`}</strong>
      {b.itemCount === 0 ? <p>ยังไม่มีรายการที่ใช้อยู่</p> : (
        <ul class="brief-list">
          <li><span>การใช้วันนี้</span> {b.untaken.length === 0 ? `กดว่าใช้แล้วครบ ${b.itemCount} รายการ` : `ใช้แล้ว ${b.takenCount} จาก ${b.itemCount} รายการ ยังไม่ได้กด: ${b.untaken.map((x) => x.label).join(", ")}`}</li>
          <li><span>ผลตรวจ</span> {b.warnings === null ? "ยังไม่มีผลล่าสุด" : none ? `${NO_FLAG} (${NO_FLAG_NOTE})` : `พบคำเตือน ${b.warnings.total} รายการ${b.warnings.avoid ? ` (ควรหลีกเลี่ยง ${b.warnings.avoid})` : ""}`}</li>
          {b.notChecked.length > 0 && <li><span>ยังไม่ได้ตรวจเงื่อนไข</span> {b.notChecked.join(", ")} (ยังไม่ได้กรอก)</li>}
          <li><span>บันทึกสุขภาพ</span> {b.noEntryToday ? "วันนี้ยังไม่ได้จดบันทึก" : "จดบันทึกวันนี้แล้ว"}</li>
          {b.longestUse && <li><span>ใช้มานานสุด</span> {`${b.longestUse.label} ใช้มา ${b.longestUse.days} วัน`}</li>}
        </ul>
      )}
      <p class="meta">คำนวณจากข้อมูลในเครื่องคุณ ไม่ใช่การวินิจฉัย</p>
      {b.itemCount > 0 && <button type="button" aria-disabled={busy.busy} onClick={ai}>ให้ AI เรียบเรียงสรุปนี้ (ไม่บังคับ)</button>}
      {err && <p class="err" role="alert">{err}</p>}
      {out && <div class="explanation"><p class="chip">{out.source === "llm" ? "AI เรียบเรียงจากข้อมูลด้านบน (ผ่านตัวตรวจข้อความแล้ว)" : "ข้อความสำรองจากข้อมูลด้านบน"}</p><p>{out.summary_th}</p></div>}
      <button type="button" onClick={() => go("diary")}>ไปหน้าบันทึก</button>
    </div>
  );
}

type Row = { key: string; kind: "herb" | "drug"; ref: string; label: string; day?: number };

/** ข้อเสนอเพิ่มรายการจาก AI: ต้องกดยืนยันก่อนจึงเพิ่ม (CLAUDE.md ข้อ 4a) */
function ProposalCard({ p, state, meta, store, today, onDone }: { p: ParseProposal; state: "open" | "done"; meta: Meta; store: TrackerStore; today: string; onDone: (t: string) => void }) {
  const okHerbs = p.herbs.filter((h) => meta.herbs.some((x) => x.id === h.id));
  const dropped = p.dropped + (p.herbs.length - okHerbs.length);
  const rows: Row[] = [
    ...okHerbs.map((h): Row => ({ key: `h-${h.id}`, kind: "herb", ref: h.id, label: meta.herbs.find((x) => x.id === h.id)?.name_th ?? h.id, day: h.days_in_use })),
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
    if (added.length) onDone(`เพิ่ม ${added.join(", ")} แล้ว${bad.length ? ` (เพิ่มไม่ได้: ${bad.join("; ")})` : ""} ผลตรวจจะอัปเดตเอง ถ้าใช้มาก่อนวันนี้ แก้วันเริ่มได้ที่หน้า ช่วงนี้`);
  };
  return (
    <div class="cmsg a card-msg">
      {rows.length === 0 ? <p>AI ไม่พบสมุนไพรหรือยาในข้อความ ลองพิมพ์ชื่อให้ชัดขึ้น</p> : (
        <>
          <p>{state === "open" ? "AI แยกได้ตามนี้ เทียบกับที่พิมพ์ แล้วเอาติ๊กออกจากอันที่ไม่ใช่ ก่อนกดเพิ่ม (ยังไม่มีอะไรถูกเพิ่ม)" : "ข้อเสนอนี้ใช้ไปแล้ว"}</p>
          <ul class="proposal">
            {rows.map((r) => (
              <li key={r.key}>
                <label><input type="checkbox" disabled={state === "done"} checked={!off[r.key]} onChange={(e) => setOff({ ...off, [r.key]: !e.currentTarget.checked })} />
                  {` ${r.label} (${r.kind === "herb" ? "สมุนไพร" : "ยา"}${r.day ? ` · ใช้มา ${r.day} วัน` : ""})`}</label>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.unmatched.length > 0 && <p class="warn">{`ไม่พบในฐานข้อมูล/ไม่แน่ใจ (ไม่ถูกเสนอให้เพิ่ม): ${p.unmatched.join(", ")}`}</p>}
      {dropped > 0 && <p class="warn">{`AI ส่งชื่อที่ไม่อยู่ในฐานข้อมูลมา ${dropped} รายการ ตัดออกแล้ว`}</p>}
      {state === "open" && rows.length > 0 && <button type="button" class="primary" aria-disabled={chosen.length === 0} onClick={confirm}>{`เพิ่ม ${chosen.length} รายการ`}</button>}
      {errs.map((e) => <p class="err" role="alert" key={e}>{e}</p>)}
    </div>
  );
}
