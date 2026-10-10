import { useRef, useState } from "preact/hooks";
import type { Analysis } from "../hooks/useAnalysis";
import { dayNumber, thaiDate } from "../model/dates";
import { rowView, unsentRefs } from "../model/panel";
import { kindLabel, type TrackerStore } from "../model/tracker";
import { SeverityBadge } from "./SeverityBadge";
import type { DiaryStore } from "../model/diary";
import { useDiary } from "../hooks/useDiary";
import { takenInWindow } from "../model/diary";

export function ActiveList({ store, today, analysis: a, diary }: { store: TrackerStore; today: string; analysis: Analysis; diary?: DiaryStore }) {
  useDiary(diary);
  const items = store.active();
  const unsent = unsentRefs(items);
  const view = { result: a.result, summary: a.summary, current: a.current, loading: a.status === "loading" };
  // แถวที่หยุดใช้/ลบหายไปพร้อมปุ่มที่มีโฟกัส: ย้ายโฟกัสไปหัวข้อรายการ ไม่ให้หลุดไปที่ body
  const head = useRef<HTMLHeadingElement>(null);
  const done = (fn: () => unknown) => { fn(); head.current?.focus(); };
  return (
    <section class="active-list" aria-labelledby="active-h">
      <h2 id="active-h" ref={head} tabIndex={-1}>กำลังใช้อยู่</h2>
      {items.length === 0 ? <div class="empty-note"><p>ยังไม่มีรายการ</p><p class="meta">กด “+ เพิ่ม” เพื่อเริ่มติดตามสมุนไพรหรือยาที่คุณใช้</p></div> : (
        <ul>
          {items.map((i) => {
            const v = rowView(i, view, unsent);
            return (
              <li key={i.id} class="active-row">
                <div>
                  <strong>{i.label}</strong>
                  <div class="meta">{`${kindLabel(i.kind)} · เริ่มใช้ ${thaiDate(i.start_date)} (ใช้มา ${dayNumber(i.start_date, today)} วัน)`}</div>
                </div>
                {v === "pending" ? <span class="pending">กำลังตรวจ…</span>
                  : v === "see_panel" ? <span class="see-panel">ดูธงในแผงด้านบน</span>
                  : v === "drug_unsplit" ? <span class="see-panel">ผลตรวจไม่ได้แยกรายตัวยา</span>
                  : <SeverityBadge kind={v} />}
                {diary && (
                  <div class="checkin">
                    <button type="button" class="check-btn" aria-pressed={diary.isTaken(i.id, today)} aria-label={`ใช้แล้ววันนี้ ${i.label}`}
                      onClick={() => diary.toggleTaken(i.id, today)}>
                      ใช้แล้ววันนี้
                    </button>
                    <WeekDots diary={diary} id={i.id} start={i.start_date} today={today} label={i.label} />
                  </div>
                )}
                {diary && <DoseNote diary={diary} id={i.id} label={i.label} />}
                <StartEditor store={store} diary={diary} item={i} today={today} />
                <div class="row-actions">
                  <button type="button" aria-label={`หยุดใช้ ${i.label}`} onClick={() => done(() => store.stopItem(i.id))}>หยุดใช้</button>
                  <button type="button" aria-label={`ลบ ${i.label}`} onClick={() => confirm(`ลบ ${i.label} ออกถาวร (รวมประวัติ)?`) && done(() => { store.removeItem(i.id); diary?.dropTaken(i.id); })}>ลบ</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {diary && items.length > 0 && <p class="meta legend">จุดเรียงตามวัน (ซ้ายเก่าสุด ขวาคือวันนี้) จุดทึบคือวันที่กด “ใช้แล้ว” จุดโปร่งคือวันที่ยังไม่ได้กด</p>}
    </section>
  );
}

/** แก้วันเริ่มใช้ที่กรอกผิด; เลือกติ๊กว่าใช้ทุกวันย้อนหลังได้ */
function StartEditor({ store, diary, item, today }: { store: TrackerStore; diary?: DiaryStore; item: { id: string; label: string; start_date: string }; today: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(item.start_date);
  const [fill, setFill] = useState(true);
  const [err, setErr] = useState("");
  if (!open) return <button type="button" class="link-btn" aria-label={`แก้วันเริ่มใช้ ${item.label}`} onClick={() => setOpen(true)}>แก้วันเริ่มใช้</button>;
  const save = () => {
    const r = store.setStartDate(item.id, date);
    if (!r.ok) return setErr(r.message);
    if (diary && fill && dayNumber(date, today) > 1) diary.markRange(item.id, date, today);
    setOpen(false);
  };
  return (
    <div class="start-editor">
      <label for={`se-${item.id}`}>{`เริ่มใช้ ${item.label} เมื่อ`}</label>
      <input id={`se-${item.id}`} type="date" max={today} value={date} onInput={(e) => { setDate(e.currentTarget.value); setErr(""); }} />
      {diary && <label class="check-line"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.currentTarget.checked)} />ติ๊กว่าใช้ทุกวันตั้งแต่วันที่เริ่ม</label>}
      {err && <p class="err" role="alert">{err}</p>}
      <div class="row-actions">
        <button type="button" class="primary" onClick={save}>บันทึกวันเริ่ม</button>
        <button type="button" onClick={() => { setOpen(false); setDate(item.start_date); setErr(""); }}>ยกเลิก</button>
      </div>
    </div>
  );
}

function WeekDots({ diary, id, start, today, label }: { diary: DiaryStore; id: string; start: string; today: string; label: string }) {
  const w = takenInWindow(diary.state.taken[id] ?? [], start, today);
  if (w.days === 0) return null;
  const dots = Array.from({ length: w.days }, (_, k) => {
    const back = w.days - 1 - k; // วันที่เก่าสุดอยู่ซ้าย
    const t = new Date(today + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - back);
    return diary.isTaken(id, t.toISOString().slice(0, 10));
  });
  return (
    <span class="weekline">
      <span class="weekdots" role="img" aria-label={`${label} กดบันทึกว่าใช้ ${w.took} จาก ${w.days} วันล่าสุด`}>
        {dots.map((on, k) => <i key={k} data-on={on ? "1" : "0"} />)}
      </span>
      <span class="meta" aria-hidden="true">{`${w.days} วันล่าสุด ใช้ ${w.took} วัน`}</span>
    </span>
  );
}

/** ขนาดที่ใช้: จดไว้เอง ระบบไม่ตรวจและไม่นำไปคิดความเสี่ยง */
function DoseNote({ diary, id, label }: { diary: DiaryStore; id: string; label: string }) {
  const [err, setErr] = useState("");
  return (
    <div class="dose-note">
      <label for={`dose-${id}`}>{`ขนาดที่ใช้ ${label} (จดไว้ดูเอง)`}</label>
      <input id={`dose-${id}`} type="text" maxLength={60} placeholder="เช่น 1 แคปซูล เช้า-เย็น" defaultValue={diary.doseOf(id)}
        onBlur={(e) => { const r = diary.setDose(id, e.currentTarget.value); setErr(r.ok ? "" : r.message); }} />
      {err && <p class="err" role="alert">{err}</p>}
      <p class="meta">จดไว้ให้เภสัชกรดูได้ ระบบยังไม่นำขนาดไปคิดธงเตือน</p>
    </div>
  );
}
