import { useEffect, useRef, useState } from "preact/hooks";
import type { TrackerStore } from "../model/tracker";
import type { DiaryStore } from "../model/diary";
import { addDays, dayNumber, validateStart } from "../model/dates";
import type { Meta } from "../types";
import { ParseBox } from "./ParseBox";
import { pick as srv, t } from "../i18n";

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
  const herbs = meta.herbs.filter((h) => !needle || h.name_th.toLowerCase().includes(needle) || (h.name_en ?? "").toLowerCase().includes(needle) || h.id.toLowerCase().includes(needle));
  const formulas = (meta.formulas ?? []).filter((f) => !needle || f.name_th.toLowerCase().includes(needle) || (f.name_en ?? "").toLowerCase().includes(needle) || f.id.toLowerCase().includes(needle));
  const drugs = meta.drugs.filter((d) => !needle || d.toLowerCase().includes(needle));
  const typed = q.trim();
  const canType = typed.length > 0 && !meta.drugs.some((d) => d.toLowerCase() === typed.toLowerCase());

  const submit = (e: Event) => {
    e.preventDefault();
    setItemErr(""); setDateErr("");
    if (!pick) return setItemErr(t("เลือกสมุนไพรหรือยาก่อน", "Choose a herb or medicine first"));
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
      <h2 id="sheet-h">{t("เพิ่มสมุนไพรหรือยา", "Add a herb or medicine")}</h2>
      <ParseBox meta={meta} store={store} today={today} onDone={(labels) => { onAdded?.(labels); onClose(); }} />
      <p class="meta or-line">{t("หรือเลือกจากรายการ", "Or choose from the list")}</p>
      <form onSubmit={submit} noValidate>
        <label for="sheet-q">{t("ค้นหา หรือพิมพ์ชื่อยา", "Search, or type a medicine name")}</label>
        <input id="sheet-q" ref={first} type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <div role="group" aria-label={t("รายการที่เลือกได้", "Items you can choose")} class="pick-list">
          {herbs.length > 0 && <p class="pick-h">{t("สมุนไพร", "Herbs")}</p>}
          {herbs.map((h) => <PickBtn key={`h-${h.id}`} on={pick?.kind === "herb" && pick.ref === h.id} text={`${srv(h.name_th, h.name_en)} (${t("สมุนไพร", "herb")})`} onPick={() => setPick({ kind: "herb", ref: h.id, label: h.name_th })} />)}
          {formulas.length > 0 && <p class="pick-h">{t("ตำรับยาสมุนไพร", "Herbal formulas")}</p>}
          {formulas.map((f) => <PickBtn key={`f-${f.id}`} on={pick?.kind === "formula" && pick.ref === f.id} text={`${srv(f.name_th, f.name_en)} (${t("ตำรับ", "formula")})`} onPick={() => setPick({ kind: "formula", ref: f.id, label: f.name_th })} />)}
          {drugs.length > 0 && <p class="pick-h">{t("ยา", "Medicines")}</p>}
          {drugs.map((d) => <PickBtn key={`d-${d}`} on={pick?.kind === "drug" && pick.ref === d} text={`${d} (${t("ยา", "medicine")})`} onPick={() => setPick({ kind: "drug", ref: d, label: d })} />)}
          {canType && <PickBtn on={pick?.kind === "drug" && pick.ref === typed} text={t(`ใช้ชื่อยา “${typed}” ที่พิมพ์เอง`, `Use the medicine name “${typed}” that I typed`)} onPick={() => setPick({ kind: "drug", ref: typed, label: typed })} />}
        </div>
        {pick && <p>{`${t("เลือกแล้ว", "Selected")}: ${pick.label}`}</p>}
        {pick?.kind === "formula" && <p class="meta">{(() => { const f = meta.formulas?.find((x) => x.id === pick.ref); return f && srv(f.note_th, f.note_en); })()}</p>}
        {itemErr && <p class="err" role="alert">{itemErr}</p>}
        <label for="sheet-date">{t("เริ่มใช้ครั้งแรกเมื่อไหร่", "When did you first start using it?")}</label>
        <div class="quick-dates" role="group" aria-label={t("เลือกวันเริ่มใช้แบบเร็ว", "Quick start-date choices")}>
          {([[t("เพิ่งเริ่มวันนี้", "Just started today"), 0], [t("1 สัปดาห์ก่อน", "1 week ago"), 7], [t("1 เดือนก่อน", "1 month ago"), 30]] as const).map(([label, n]) => {
            const v = addDays(today, -n) ?? today;
            return <button type="button" key={n} aria-pressed={date === v} onClick={() => { setDate(v); setDateErr(""); }}>{label}</button>;
          })}
        </div>
        <input id="sheet-date" type="date" max={today} value={date} aria-invalid={!!dateErr} aria-describedby={dateErr ? "sheet-date-err" : undefined}
          onInput={(e) => { setDate(e.currentTarget.value); setDateErr(""); }} />
        {dateErr && <p class="err" role="alert" id="sheet-date-err">{dateErr}</p>}
        {diary && validateStart(date, today) === null && dayNumber(date, today) > 1 && (
          <>
          <label class="check-line">
            <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.currentTarget.checked)} />
            <span>{t(`บันทึกว่าใช้ทุกวันตั้งแต่วันที่เริ่ม (รวม ${dayNumber(date, today)} วัน)`, `Log it as taken every day since the start date (${dayNumber(date, today)} days in total)`)}</span>
          </label>
          </>
        )}
        <div class="row-actions form-actions">
          <button type="submit" class="primary">{t("เพิ่ม", "Add")}</button>
          <button type="button" onClick={onClose}>{t("ปิด", "Close")}</button>
        </div>
      </form>
    </div>
  );
}

function PickBtn({ on, text, onPick }: { on: boolean; text: string; onPick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onPick}>{text}</button>;
}
