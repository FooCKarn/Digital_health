import { useEffect, useRef, useState } from "preact/hooks";
import type { TrackerStore } from "../model/tracker";
import { validateStart } from "../model/dates";
import type { Meta } from "../types";
import { ParseBox } from "./ParseBox";

type Pick = { kind: "herb" | "drug"; ref: string; label: string };

/** onAdded: ชื่อรายการที่เพิ่มสำเร็จ (ให้หน้าแม่ประกาศ) */
export function AddSheet({ meta, store, today, onClose, onAdded }: { meta: Meta; store: TrackerStore; today: string; onClose: () => void; onAdded?: (labels: string[]) => void }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [date, setDate] = useState(today);
  const [itemErr, setItemErr] = useState("");
  const [dateErr, setDateErr] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const needle = q.trim().toLowerCase();
  const herbs = meta.herbs.filter((h) => !needle || h.name_th.toLowerCase().includes(needle) || h.id.toLowerCase().includes(needle));
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
    if (r.ok) { onAdded?.([pick.label]); onClose(); } else setItemErr(r.message);
  };

  return (
    <div class="sheet" role="dialog" aria-labelledby="sheet-h" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <h2 id="sheet-h">เพิ่มสมุนไพรหรือยา</h2>
      <form onSubmit={submit} noValidate>
        <label for="sheet-q">ค้นหา หรือพิมพ์ชื่อยา</label>
        <input id="sheet-q" ref={first} type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <p class="meta">พิมพ์ชื่อยาที่ไม่มีในรายการได้ ถ้าไม่รู้จักชื่อนั้นจะขึ้นว่า ยังไม่มีข้อมูลตรวจ</p>
        <div role="group" aria-label="รายการที่เลือกได้" class="pick-list">
          {herbs.map((h) => <PickBtn key={`h-${h.id}`} on={pick?.kind === "herb" && pick.ref === h.id} text={`${h.name_th} (สมุนไพร)`} onPick={() => setPick({ kind: "herb", ref: h.id, label: h.name_th })} />)}
          {drugs.map((d) => <PickBtn key={`d-${d}`} on={pick?.kind === "drug" && pick.ref === d} text={`${d} (ยา)`} onPick={() => setPick({ kind: "drug", ref: d, label: d })} />)}
          {canType && <PickBtn on={pick?.kind === "drug" && pick.ref === typed} text={`ใช้ชื่อยา “${typed}” ที่พิมพ์เอง`} onPick={() => setPick({ kind: "drug", ref: typed, label: typed })} />}
        </div>
        {pick && <p>{`เลือกแล้ว: ${pick.label}`}</p>}
        {itemErr && <p class="err" role="alert">{itemErr}</p>}
        <label for="sheet-date">วันที่เริ่มใช้</label>
        <input id="sheet-date" type="date" max={today} value={date} aria-invalid={!!dateErr} aria-describedby={dateErr ? "sheet-date-err" : undefined}
          onInput={(e) => { setDate(e.currentTarget.value); setDateErr(""); }} />
        {dateErr && <p class="err" role="alert" id="sheet-date-err">{dateErr}</p>}
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
