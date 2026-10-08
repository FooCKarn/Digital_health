import type { DiaryState } from "./diary";
import type { TrackerItem } from "./tracker";

/** รายการที่ "ใช้อยู่" ในวันนั้น: เริ่มก่อนหรือตรงวันนั้น และยังไม่หยุด (หรือหยุดหลัง/ตรงวันนั้น) */
export function itemsOn(items: TrackerItem[], date: string): TrackerItem[] {
  return items.filter((i) => i.start_date <= date && (i.end_date === null || date <= i.end_date));
}

export interface DayInfo {
  date: string;
  mood: number | null;
  hasEntry: boolean;
  active: number; // จำนวนรายการที่ใช้อยู่ในวันนั้น
  taken: number; // จำนวนที่ผู้ใช้กดบันทึกว่าใช้
}

/** ข้อมูลสรุปต่อวันสำหรับปฏิทิน ใช้แค่ที่ผู้ใช้บันทึกเอง ไม่แปลผล ไม่ให้คะแนน */
export function dayInfo(items: TrackerItem[], d: DiaryState, date: string): DayInfo {
  const act = itemsOn(items, date);
  const e = d.entries.find((x) => x.date === date);
  return {
    date,
    mood: e?.mood ?? null,
    hasEntry: !!e,
    active: act.length,
    taken: act.filter((i) => (d.taken[i.id] ?? []).includes(date)).length,
  };
}

/** นับในเดือน (ใช้ข้อความสรุปใต้ปฏิทิน) */
export function monthTotals(items: TrackerItem[], d: DiaryState, dates: string[]): { entryDays: number; takenMarks: number } {
  const inMonth = new Set(dates);
  return {
    entryDays: d.entries.filter((e) => inMonth.has(e.date)).length,
    takenMarks: items.reduce((n, i) => n + (d.taken[i.id] ?? []).filter((x) => inMonth.has(x)).length, 0),
  };
}
