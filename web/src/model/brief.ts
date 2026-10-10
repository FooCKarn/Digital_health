import { dayNumber } from "./dates";
import { groupFlags } from "./panel";
import type { TrackerItem } from "./tracker";
import type { AnalyzeResult } from "../types";

/**
 * สรุปประจำวัน: คำนวณจากข้อมูลในเครื่องและผลตรวจปัจจุบันเท่านั้น (ฟังก์ชันล้วน ไม่เรียก AI ไม่แปลผลสุขภาพ)
 * ทุกข้อความที่หน้าจอแสดงมาจากตัวเลขและชื่อรายการเหล่านี้ ไม่มีข้อเท็จจริงทางการแพทย์เพิ่ม
 */
export interface Brief {
  itemCount: number;
  untaken: { id: string; label: string }[];
  takenCount: number;
  /** null = ยังไม่มีผลตรวจที่ตรงกับข้อมูลปัจจุบัน */
  warnings: { total: number; avoid: number } | null;
  notChecked: string[];
  noEntryToday: boolean;
  longestUse: { label: string; days: number } | null;
}

export function buildBrief(input: {
  items: TrackerItem[];
  isTaken: (id: string) => boolean;
  hasEntryToday: boolean;
  today: string;
  result: AnalyzeResult | null;
  resultCurrent: boolean;
  notCheckedLabels: string[];
}): Brief {
  const { items, isTaken, today } = input;
  const untaken = items.filter((i) => !isTaken(i.id)).map((i) => ({ id: i.id, label: i.label }));
  const warnings = input.result && input.resultCurrent
    ? { total: input.result.flags.length, avoid: groupFlags(input.result).avoid.length }
    : null;
  let longest: Brief["longestUse"] = null;
  for (const i of items) {
    const d = dayNumber(i.start_date, today);
    if (d >= 2 && (!longest || d > longest.days)) longest = { label: i.label, days: d };
  }
  return {
    itemCount: items.length, untaken, takenCount: items.length - untaken.length, warnings,
    notChecked: warnings ? input.notCheckedLabels : [], noEntryToday: !input.hasEntryToday, longestUse: longest,
  };
}
