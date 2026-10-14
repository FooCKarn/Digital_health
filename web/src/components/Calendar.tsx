import { useEffect, useRef, useState } from "preact/hooks";
import { dayInfo, monthTotals } from "../model/calendar";
import { addDays, displayYear, monthGrid, monthName, shiftMonth, thaiDate, weekday, weekdayName } from "../model/dates";
import { MOODS, type DiaryState } from "../model/diary";
import type { TrackerItem } from "../model/tracker";
import { t } from "../i18n";

const shortDays = () => t(["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].join(","), "Su,Mo,Tu,We,Th,Fr,Sa").split(",");
const MAX_PIPS = 4;

type Props = { items: TrackerItem[]; diary: DiaryState; today: string; selected: string; onSelect: (iso: string) => void };

/** ปฏิทินรายเดือน: ช่องแสดงสิ่งที่ผู้ใช้จดเองเท่านั้น (ความรู้สึก + จุดว่ากดใช้แล้วกี่รายการ) ไม่ให้คะแนน ไม่แปลผล */
export function Calendar({ items, diary, today, selected, onSelect }: Props) {
  const [view, setView] = useState<[number, number]>(() => [+selected.slice(0, 4), +selected.slice(5, 7)]);
  const [focus, setFocus] = useState(selected);
  const kbd = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const [y, m] = view;
  const weeks = monthGrid(y, m);
  const [ty, tm] = [+today.slice(0, 4), +today.slice(5, 7)];
  const atCurrent = y === ty && m === tm;
  const monthDates = weeks.flat().filter((x): x is string => !!x && x <= today);
  const totals = monthTotals(items, diary, monthDates);

  useEffect(() => {
    if (!kbd.current) return;
    kbd.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, view]);

  const go = (delta: number) => {
    const [ny, nm] = shiftMonth(y, m, delta);
    if (ny * 12 + nm > ty * 12 + tm) return;
    setView([ny, nm]);
    const p = (n: number) => String(n).padStart(2, "0");
    const f = `${ny}-${p(nm)}-01`;
    setFocus(f > today ? today : f);
  };
  const moveTo = (iso: string | null) => {
    if (!iso || iso > today) return;
    kbd.current = true;
    setFocus(iso);
    setView([+iso.slice(0, 4), +iso.slice(5, 7)]);
  };
  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); moveTo(addDays(focus, step[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const [ny, nm] = shiftMonth(+focus.slice(0, 4), +focus.slice(5, 7), e.key === "PageUp" ? -1 : 1);
      const p = (n: number) => String(n).padStart(2, "0");
      const day = Math.min(+focus.slice(8, 10), new Date(Date.UTC(ny, nm, 0)).getUTCDate());
      const target = `${ny}-${p(nm)}-${p(day)}`;
      moveTo(target > today ? today : target);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      moveTo(addDays(focus, e.key === "Home" ? -weekday(focus) : 6 - weekday(focus)));
    }
  };

  const label = (iso: string) => {
    const i = dayInfo(items, diary, iso);
    const parts = [t(`${weekdayName(weekday(iso))}ที่ ${thaiDate(iso)}`, `${weekdayName(weekday(iso))}, ${thaiDate(iso)}`)];
    if (iso === today) parts.push(t("วันนี้", "today"));
    if (i.mood !== null) parts.push(t(`ความรู้สึก ${MOODS[i.mood - 1].th}`, `mood: ${MOODS[i.mood - 1].en}`));
    else if (i.hasEntry) parts.push(t("มีบันทึก", "has an entry"));
    if (i.active > 0) parts.push(t(`กดบันทึกว่าใช้ ${i.taken} จาก ${i.active} รายการ`, `marked ${i.taken} of ${i.active} items as taken`));
    return parts.join(" · ");
  };

  return (
    <div class="cal">
      <div class="cal-head">
        <button type="button" class="cal-nav" aria-label={t("เดือนก่อนหน้า", "Previous month")} onClick={() => go(-1)}><span aria-hidden="true">‹</span></button>
        <h3 class="cal-title" aria-live="polite">{`${monthName(m)} ${displayYear(y)}`}</h3>
        <button type="button" class="cal-nav" aria-label={t("เดือนถัดไป", "Next month")} aria-disabled={atCurrent} disabled={atCurrent} onClick={() => go(1)}><span aria-hidden="true">›</span></button>
      </div>
      <div class="cal-grid" role="grid" aria-label={`${t("ปฏิทิน", "Calendar")} ${monthName(m)} ${displayYear(y)}`} ref={grid} onKeyDown={onKey}>
        <div role="row" class="cal-row cal-dow">
          {shortDays().map((s, i) => <div key={i} role="columnheader" aria-label={weekdayName(i)} class="cal-dow-c">{s}</div>)}
        </div>
        {weeks.map((w, wi) => (
          <div role="row" class="cal-row" key={wi}>
            {w.map((iso, ci) => {
              if (!iso) return <div role="gridcell" class="cal-c cal-empty" key={ci} aria-hidden="true" />;
              const info = dayInfo(items, diary, iso);
              const future = iso > today;
              const pips = future ? 0 : Math.min(info.active, MAX_PIPS);
              return (
                <div role="gridcell" class="cal-c" key={ci}>
                  <button type="button" data-date={iso} class="cal-day" disabled={future} tabIndex={iso === focus ? 0 : -1}
                    aria-label={label(iso)} aria-pressed={iso === selected} aria-current={iso === today ? "date" : undefined}
                    data-today={iso === today ? "1" : undefined} data-mood={info.mood ?? undefined}
                    onClick={() => { setFocus(iso); onSelect(iso); }}>
                    <span class="cal-n">{+iso.slice(8, 10)}</span>
                    {info.mood !== null ? <span class="cal-mood" aria-hidden="true">{info.mood}</span> : info.hasEntry ? <span class="cal-mood" aria-hidden="true">•</span> : null}
                    {pips > 0 && (
                      <span class="cal-pips" aria-hidden="true">
                        {Array.from({ length: pips }, (_, k) => <i key={k} data-on={k < info.taken ? "1" : "0"} />)}
                        {info.active > MAX_PIPS && <b>+</b>}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p class="cal-legend meta">
        <span>{t("เลข 1-5 คือความรู้สึกที่จดไว้", "Numbers 1-5 are the mood you logged")}</span> <span>{t("จุดทึบ = ใช้แล้ว จุดโปร่ง = ยังไม่ได้ติ๊ก", "Filled dot = taken, empty dot = not ticked yet")}</span>
      </p>
      <p class="meta cal-sum">{t(`เดือนนี้: จดบันทึก ${totals.entryDays} วัน · กดบันทึกว่าใช้ ${totals.takenMarks} ครั้ง`, `This month: ${totals.entryDays} days logged · ${totals.takenMarks} doses marked as taken`)}</p>
      {!atCurrent && <button type="button" class="cal-today" onClick={() => { setView([ty, tm]); moveTo(today); onSelect(today); }}>{t("กลับไปวันนี้", "Back to today")}</button>}
    </div>
  );
}
