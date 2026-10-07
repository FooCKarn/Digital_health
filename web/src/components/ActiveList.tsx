import { useRef } from "preact/hooks";
import type { Analysis } from "../hooks/useAnalysis";
import { dayNumber } from "../model/dates";
import { rowView, unsentRefs } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
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
                  <div class="meta">{`${i.kind === "herb" ? "สมุนไพร" : "ยา"} · วันที่ ${dayNumber(i.start_date, today)}`}</div>
                </div>
                {v === "pending" ? <span class="pending">กำลังตรวจ…</span>
                  : v === "see_panel" ? <span class="see-panel">ดูธงในแผงด้านบน</span>
                  : v === "drug_unsplit" ? <span class="see-panel">ผลตรวจไม่ได้แยกผลรายยา</span>
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
                <div class="row-actions">
                  <button type="button" aria-label={`หยุดใช้ ${i.label}`} onClick={() => done(() => store.stopItem(i.id))}>หยุดใช้</button>
                  <button type="button" aria-label={`ลบ ${i.label}`} onClick={() => confirm(`ลบ ${i.label} ออกถาวร (รวมประวัติ)?`) && done(() => { store.removeItem(i.id); diary?.dropTaken(i.id); })}>ลบ</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
    <span class="weekdots" role="img" aria-label={`${label} กดบันทึกว่าใช้ ${w.took} จาก ${w.days} วันล่าสุด`}>
      {dots.map((on, k) => <i key={k} data-on={on ? "1" : "0"} />)}
    </span>
  );
}
