import { useEffect, useRef, useState } from "preact/hooks";
import type { TrackerStore } from "../model/tracker";
import type { DiaryStore } from "../model/diary";
import { addDays, dayNumber, validateStart } from "../model/dates";
import type { Meta } from "../types";
import { ParseBox } from "./ParseBox";

type Pick = { kind: "herb" | "drug" | "formula"; ref: string; label: string };

/** onAdded: ชื่อรายการที่เพิ่มสำเร็จ (ให้หน้าแม่ประกาศ) */
export function AddSheet({ meta, store, today, diary, onClose, onAdded }: { meta: Meta; store: TrackerStore; today: string; diary?: DiaryStore; onClose: () => void; onAdded?: (labels: string[]) => void }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [date, setDate] = useState(today);
  const [itemErr, setItemErr] = useState("");
  const [dateErr, setDateErr] = useState("");
  const [backfill, setBackfill] = useState(true);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const needle = q.trim().toLowerCase();
  const herbs = meta.herbs.filter((h) => !needle || h.name_th.toLowerCase().includes(needle) || h.id.toLowerCase().includes(needle));
  const formulas = (meta.formulas ?? []).filter((f) => !needle || f.name_th.toLowerCase().includes(needle) || f.id.toLowerCase().includes(needle));
  const drugs = meta.drugs.filter((d) => !needle || d.toLowerCase().includes(needle));
  const typed = q.trim();
  const canType = typed.length > 0 && !meta.drugs.some((d) => d.toLowerCase() === typed.toLowerCase());

  const submit = (e: Event) => {
    e.preventDefault();
    setItemErr(""); setDateErr("");
    if (!pick) return setItemErr("เลือกสมุนไพรหรือยาก่อน");
    const de = validateStart(date, today);
    if (de) return setDateErr(de);
    const r = store.addItem({ ...pick, start_date: date });
    if (r.ok) {
      if (diary && backfill && dayNumber(date, today) > 1) diary.markRange(r.item.id, date, today);
      onAdded?.([pick.label]); onClose();
    } else setItemErr(r.message);
  };

  return (
    <div class="sheet" role="dialog" aria-labelledby="sheet-h" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <h2 id="sheet-h">เพิ่มสมุนไพรหรือยา</h2>
      <form onSubmit={submit} noValidate>
        <label for="sheet-q">ค้นหา หรือพิมพ์ชื่อยา</label>
        <input id="sheet-q" ref={first} type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <p class="meta">พิมพ์ชื่อยาที่ไม่มีในรายการได้ ถ้าไม่รู้จักชื่อนั้นจะขึ้นว่า ยังไม่มีข้อมูลตรวจ</p>
        <div role="group" aria-label="รายการที่เลือกได้" class="pick-list">
          {herbs.length > 0 && <p class="pick-h">สมุนไพร</p>}
          {herbs.map((h) => <PickBtn key={`h-${h.id}`} on={pick?.kind === "herb" && pick.ref === h.id} text={`${h.name_th} (สมุนไพร)`} onPick={() => setPick({ kind: "herb", ref: h.id, label: h.name_th })} />)}
          {formulas.length > 0 && <p class="pick-h">ตำรับยาสมุนไพร</p>}
          {formulas.map((f) => <PickBtn key={`f-${f.id}`} on={pick?.kind === "formula" && pick.ref === f.id} text={`${f.name_th} (ตำรับ)`} onPick={() => setPick({ kind: "formula", ref: f.id, label: f.name_th })} />)}
          {drugs.length > 0 && <p class="pick-h">ยา</p>}
          {drugs.map((d) => <PickBtn key={`d-${d}`} on={pick?.kind === "drug" && pick.ref === d} text={`${d} (ยา)`} onPick={() => setPick({ kind: "drug", ref: d, label: d })} />)}
          {canType && <PickBtn on={pick?.kind === "drug" && pick.ref === typed} text={`ใช้ชื่อยา “${typed}” ที่พิมพ์เอง`} onPick={() => setPick({ kind: "drug", ref: typed, label: typed })} />}
        </div>
        {pick && <p>{`เลือกแล้ว: ${pick.label}`}</p>}
        {pick?.kind === "formula" && <p class="meta">{meta.formulas?.find((f) => f.id === pick.ref)?.note_th}</p>}
        {itemErr && <p class="err" role="alert">{itemErr}</p>}
        <label for="sheet-date">เริ่มใช้ครั้งแรกเมื่อไหร่</label>
        <p class="meta" id="sheet-date-help">ถ้าใช้มาก่อนแล้ว ให้เลือกวันที่เริ่มใช้จริง ระบบนับจำนวนวันที่ใช้จากวันนี้ ไม่ใช่จากวันที่กดเพิ่ม</p>
        <div class="quick-dates" role="group" aria-label="เลือกวันเริ่มใช้แบบเร็ว">
          {([["เพิ่งเริ่มวันนี้", 0], ["1 สัปดาห์ก่อน", 7], ["1 เดือนก่อน", 30]] as const).map(([t, n]) => {
            const v = addDays(today, -n) ?? today;
            return <button type="button" key={t} aria-pressed={date === v} onClick={() => { setDate(v); setDateErr(""); }}>{t}</button>;
          })}
        </div>
        <input id="sheet-date" type="date" max={today} value={date} aria-invalid={!!dateErr} aria-describedby={dateErr ? "sheet-date-err" : "sheet-date-help"}
          onInput={(e) => { setDate(e.currentTarget.value); setDateErr(""); }} />
        {dateErr && <p class="err" role="alert" id="sheet-date-err">{dateErr}</p>}
        {diary && validateStart(date, today) === null && dayNumber(date, today) > 1 && (
          <label class="check-line">
            <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.currentTarget.checked)} />
            {`ใช้ทุกวันตั้งแต่วันที่เริ่ม (ติ๊กว่าใช้แล้วให้ ${dayNumber(date, today)} วัน แก้ทีหลังได้ในปฏิทิน)`}
          </label>
        )}
        <div class="row-actions">
          <button type="submit" class="primary">เพิ่ม</button>
          <button type="button" onClick={onClose}>ปิด</button>
        </div>
      </form>
      <ParseBox meta={meta} store={store} today={today} onDone={(labels) => { onAdded?.(labels); onClose(); }} />
    </div>
  );
}

function PickBtn({ on, text, onPick }: { on: boolean; text: string; onPick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onPick}>{text}</button>;
}
