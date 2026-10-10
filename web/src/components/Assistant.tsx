import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { ApiError, briefAi, intentAi } from "../api";
import { useBusy } from "../hooks/useBusy";
import { hhmm, type ReminderStore } from "../model/reminder";
import { todayISO } from "../model/dates";
import type { BriefOut, IntentOut } from "../types";
import type { Analysis } from "../hooks/useAnalysis";
import { useDiary } from "../hooks/useDiary";
import { buildBrief, toFacts } from "../model/brief";
import { thaiDate } from "../model/dates";
import { notCheckedLabels } from "../model/panel";
import type { DiaryStore } from "../model/diary";
import type { TrackerStore } from "../model/tracker";
import { NOT_CHECKED, NO_FLAG, NO_FLAG_NOTE } from "../texts";
import type { Meta } from "../types";
import { ScopeChip } from "./ScopeChip";

export type GoTo = "now" | "diary" | "mine";

/**
 * หน้าผู้ช่วย: สรุปประจำวันที่คำนวณจากข้อมูลในเครื่อง (ไม่ใช้ AI ตัดสินหรือเขียน) + ทางลัด
 * ส่วนแชต AI อยู่ใต้หน้านี้ (ตอบจากฐานข้อมูลของเครื่องมือเท่านั้น ตามกติกาเดิม)
 */
export function Assistant({ store, diary, meta, today, analysis: a, go, ask, reminder, children }: {
  store: TrackerStore; diary: DiaryStore; meta: Meta; today: string; analysis: Analysis; go: (to: GoTo) => void; ask: (q: string) => void;
  reminder?: ReminderStore; children?: ComponentChildren;
}) {
  useDiary(diary);
  const items = store.active();
  const r = a.result;
  const b = buildBrief({
    items, isTaken: (id) => diary.isTaken(id, today), hasEntryToday: !!diary.entryOn(today), today,
    result: r, resultCurrent: a.current, notCheckedLabels: r ? notCheckedLabels(r, NOT_CHECKED) : [],
  });
  const none = b.warnings !== null && b.warnings.total === 0 && !!r && r.aggregates.length === 0;

  return (
    <section class="assistant" aria-labelledby="brief-h">
      <div class="card brief">
        <h2 id="brief-h">สรุปวันนี้</h2>
        <p class="meta">{thaiDate(today)}</p>
        {b.itemCount === 0 ? (
          <p>ยังไม่มีรายการที่ใช้อยู่ เพิ่มสมุนไพรหรือยาที่หน้า ช่วงนี้ แล้วผู้ช่วยจะสรุปให้ทุกวัน</p>
        ) : (
          <ul class="brief-list">
            <li>
              <strong>การใช้วันนี้</strong>
              <span>{b.untaken.length === 0 ? `กดว่าใช้แล้วครบทั้ง ${b.itemCount} รายการ` : `ใช้แล้ว ${b.takenCount} จาก ${b.itemCount} รายการ`}</span>
              {b.untaken.length > 0 && (
                <span class="brief-actions">
                  {b.untaken.map((x) => (
                    <button type="button" key={x.id} aria-label={`บันทึกว่าใช้ ${x.label} วันนี้`} onClick={() => diary.toggleTaken(x.id, today)}>{`บันทึกว่าใช้ ${x.label}`}</button>
                  ))}
                </span>
              )}
            </li>
            <li>
              <strong>ผลตรวจ</strong>
              {b.warnings === null ? <span>กำลังตรวจ หรือยังไม่มีผลล่าสุด</span>
                : none ? <span>{`${NO_FLAG} · ${NO_FLAG_NOTE}`}</span>
                : <span>{`พบคำเตือน ${b.warnings.total} รายการ${b.warnings.avoid > 0 ? ` (ควรหลีกเลี่ยง ${b.warnings.avoid})` : ""}`}</span>}
              <span class="brief-actions">
                <button type="button" onClick={() => go("now")}>ดูผลตรวจ</button>
                {b.warnings !== null && b.warnings.total > 0 && <button type="button" onClick={() => ask("ทำไมถึงขึ้นคำเตือน")}>ถามผู้ช่วยเรื่องคำเตือน</button>}
              </span>
            </li>
            {b.notChecked.length > 0 && (
              <li>
                <strong>ยังไม่ได้ตรวจเงื่อนไข</strong>
                <span>{`${b.notChecked.join(", ")} (ยังไม่ได้กรอก)`}</span>
                <span class="brief-actions"><button type="button" onClick={() => go("mine")}>ไปกรอกข้อมูลสุขภาพ</button></span>
              </li>
            )}
            <li>
              <strong>บันทึกสุขภาพ</strong>
              <span>{b.noEntryToday ? "วันนี้ยังไม่ได้จดบันทึก" : "จดบันทึกวันนี้แล้ว"}</span>
              <span class="brief-actions"><button type="button" onClick={() => go("diary")}>{b.noEntryToday ? "จดบันทึกวันนี้" : "ดูปฏิทิน"}</button></span>
            </li>
            {b.longestUse && <li><strong>ใช้มานานสุด</strong><span>{`${b.longestUse.label} ใช้มา ${b.longestUse.days} วัน`}</span></li>}
          </ul>
        )}
        {b.itemCount > 0 && <AiBrief facts={toFacts(b)} />}
        <p class="meta brief-scope">
          <ScopeChip coverage={r?.coverage ?? meta.coverage} herbsInBook={meta.coverage.herbs_in_book} /> สรุปนี้คำนวณจากข้อมูลในเครื่องของคุณ ไม่ใช่การวินิจฉัย {meta.disclaimer_th}
        </p>
      </div>

      <div class="assistant-side">
      <IntentBox store={store} diary={diary} today={today} />
      {reminder && <ReminderCard reminder={reminder} />}
      <div class="card shortcuts">
        <h3>ทางลัด</h3>
        <div class="brief-actions">
          <button type="button" onClick={() => go("now")}>เพิ่มสมุนไพรหรือยา</button>
          <button type="button" onClick={() => go("diary")}>ดูปฏิทินและบันทึก</button>
          <button type="button" onClick={() => go("mine")}>ใบสรุปสำหรับเภสัชกร</button>
          <button type="button" onClick={() => ask("ควรถามเภสัชกรว่าอะไร")}>ควรถามเภสัชกรอะไร</button>
        </div>
      </div>
      {children}
      </div>
    </section>
  );
}

const AI_DOWN = "ตอนนี้ใช้ AI ไม่ได้ สรุปด้านบนยังอ่านได้เหมือนเดิม";
const SRC: Record<BriefOut["source"], string> = {
  llm: "AI เรียบเรียงจากข้อมูลด้านบน (ผ่านตัวตรวจข้อความแล้ว)",
  template: "ข้อความสำรองจากข้อมูลด้านบน (AI ไม่ได้ใช้หรือข้อความไม่ผ่านการตรวจ)",
};

/** ตัวเลือก: ให้ AI เรียบเรียงสรุปด้านบนเป็นภาษาง่าย ส่งเฉพาะตัวเลขและชื่อรายการที่คุณเพิ่มเอง เมื่อกดเท่านั้น */
function AiBrief({ facts }: { facts: import("../types").BriefFacts }) {
  const [got, setGot] = useState<{ key: string; out: BriefOut } | null>(null);
  const [err, setErr] = useState("");
  const b = useBusy();
  const key = JSON.stringify(facts);
  const go = () => b.run(async () => {
    setErr("");
    try { setGot({ key, out: await briefAi(facts) }); } catch { setErr(AI_DOWN); }
  });
  const out = got?.key === key ? got.out : null; // สรุปของข้อมูลเก่าไม่แสดง
  return (
    <div class="ai-brief">
      <button type="button" aria-disabled={b.busy} onClick={go}>ให้ AI เรียบเรียงสรุปวันนี้ (ไม่บังคับ)</button>
      {b.busy && <span role="status"> กำลังเรียบเรียง…</span>}
      {err && <p class="err" role="alert">{err}</p>}
      {out && <div class="explanation"><p class="chip">{SRC[out.source]}</p><p>{out.summary_th}</p></div>}
    </div>
  );
}

/** พิมพ์สั้น ๆ เช่น "กินขิงแล้ว" หรือ "กินครบแล้ว" -> AI แปลงเป็นคำสั่ง หน้าเว็บบันทึกให้ทันที เลิกทำได้ (AI ไม่ได้เขียนอะไรลงข้อมูลเอง) */
function IntentBox({ store, diary, today }: { store: TrackerStore; diary: DiaryStore; today: string }) {
  const items = store.active();
  const [text, setText] = useState("");
  const [done, setDone] = useState<{ msg: string; undo: (() => void) | null } | null>(null);
  const b = useBusy();
  if (items.length === 0) return null;

  const send = (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    void b.run(async () => {
      setDone(null);
      try {
        const intent: IntentOut = await intentAi(t, items.map((i) => ({ id: i.id, label: i.label })));
        const hit = intent.item_ids.map((id) => items.find((i) => i.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
        if (intent.action === "none" || hit.length === 0) {
          setDone({ msg: "ผู้ช่วยยังไม่เข้าใจว่าจะบันทึกอะไร ลองพิมพ์ชื่อรายการ เช่น “กินขิงแล้ว” หรือ “กินครบแล้ว” หรือกดปุ่มบันทึกในสรุปวันนี้", undo: null });
          return;
        }
        const want = intent.action === "taken";
        const changed = hit.filter((i) => diary.isTaken(i.id, today) !== want);
        for (const i of changed) diary.toggleTaken(i.id, today);
        const names = hit.map((i) => i.label).join(", ");
        setText("");
        setDone({
          msg: changed.length === 0 ? `${names} ${want ? "บันทึกว่าใช้" : "ยังไม่ได้ใช้"}อยู่แล้ววันนี้` : `บันทึกแล้ว: ${want ? "ใช้" : "ไม่ได้ใช้"} ${names} วันนี้`,
          undo: changed.length === 0 ? null : () => { for (const i of changed) diary.toggleTaken(i.id, today); setDone({ msg: "เลิกทำแล้ว", undo: null }); },
        });
      } catch (e2) {
        setDone({ msg: e2 instanceof ApiError && e2.thaiMessage !== new ApiError("server").thaiMessage ? e2.thaiMessage : "ตอนนี้ใช้ AI ไม่ได้ กดปุ่มบันทึกในสรุปวันนี้แทนได้", undo: null });
      }
    });
  };
  return (
    <div class="card intent-box">
      <h3>บอกผู้ช่วยให้บันทึก</h3>
      <form onSubmit={send} noValidate>
        <label for="intent-q" class="sr-only">พิมพ์สิ่งที่ต้องการบันทึก</label>
        <input id="intent-q" type="text" maxLength={200} placeholder="เช่น กินขิงแล้ว หรือ กินครบแล้ว" autoComplete="off" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" aria-disabled={b.busy}>ส่งให้ผู้ช่วย</button>
      </form>
      <p class="meta">AI อ่านข้อความนี้เพื่อแปลงเป็นการกดบันทึกการใช้วันนี้ ข้อความที่พิมพ์ส่งไปประมวลผลเมื่อกดส่งเท่านั้น บันทึกให้ทันที ถ้าผิดกด “เลิกทำ”</p>
      <p role="status" class="intent-done">{done?.msg}{done?.undo && <button type="button" onClick={done.undo}>เลิกทำ</button>}</p>
    </div>
  );
}

/** เตือนให้บันทึกการใช้: เก็บเวลาในเครื่อง ทำงานตอนเปิดหน้านี้ค้างไว้เท่านั้น */
function ReminderCard({ reminder }: { reminder: ReminderStore }) {
  const [, setV] = useState(0);
  const [time, setTime] = useState(reminder.state.time ?? "20:00");
  const [note, setNote] = useState("");
  const on = reminder.state.time !== null;
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const toggle = async () => {
    if (on) { reminder.setTime(null); setNote(""); setV((v) => v + 1); return; }
    if (!reminder.setTime(time)) return setNote("รูปแบบเวลาไม่ถูกต้อง");
    if (hhmm(new Date()) >= time) reminder.markFired(todayISO()); // เวลาที่ตั้งผ่านไปแล้ววันนี้: เริ่มเตือนพรุ่งนี้ ไม่เด้งทันที
    if (perm === "default") {
      try { await Notification.requestPermission(); } catch { /* ใช้แบนเนอร์ในหน้าแทน */ }
    }
    setNote(typeof Notification !== "undefined" && Notification.permission === "granted"
      ? "เปิดเตือนแล้ว จะมีการแจ้งเตือนจากเบราว์เซอร์"
      : "เปิดเตือนแล้ว เบราว์เซอร์ไม่ได้อนุญาตการแจ้งเตือน จะแสดงข้อความในหน้านี้แทน");
    setV((v) => v + 1);
  };
  return (
    <div class="card reminder">
      <h3>เตือนให้บันทึกการใช้</h3>
      <div class="reminder-row">
        <label for="rem-time">เวลา</label>
        <input id="rem-time" type="time" value={time} disabled={on} onInput={(e) => setTime(e.currentTarget.value)} />
        <button type="button" aria-pressed={on} onClick={toggle}>{on ? `ปิดเตือน (${reminder.state.time})` : "เปิดเตือน"}</button>
      </div>
      <p class="meta">ใช้ได้เฉพาะตอนที่เปิดหน้าเว็บนี้ค้างไว้ในเบราว์เซอร์ ไม่มีเซิร์ฟเวอร์ส่งแจ้งเตือน และข้อความแจ้งเตือนไม่แสดงชื่อยา เวลาที่ตั้งเก็บในเครื่องนี้เท่านั้น</p>
      <p role="status">{note}</p>
    </div>
  );
}
