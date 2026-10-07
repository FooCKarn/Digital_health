import type { AnalyzePayload, AnalyzeResult, Flag } from "../types";
import { dayNumber } from "./dates";
import type { Profile, TrackerItem } from "./tracker";

export type { AnalyzePayload };

// ขีดจำกัดตรงกับเซิร์ฟเวอร์ (เกินแล้วได้ 400)
const MAX_HERBS = 50;
const MAX_DRUGS = 30;
const MAX_DAYS = 365;
const MAX_DRUG_LEN = 100;

/** null = ไม่มีสมุนไพร (ห้ามเรียก API) */
export function buildPayload(active: TrackerItem[], profile: Profile, todayISOStr: string, knownConditions?: string[]): AnalyzePayload | null {
  const days = new Map<string, number>();
  for (const i of active) {
    if (i.kind !== "herb") continue;
    const d = Math.min(Math.max(dayNumber(i.start_date, todayISOStr) || 1, 1), MAX_DAYS);
    days.set(i.ref, Math.max(days.get(i.ref) ?? 0, d)); // id ซ้ำ = เก็บค่าวันที่มากกว่า
  }
  if (days.size === 0) return null;
  const herbs = [...days].slice(0, MAX_HERBS).map(([id, days_in_use]) => ({ id, days_in_use }));
  const drugs = active
    .filter((i) => i.kind === "drug")
    .map((i) => i.ref.trim())
    .filter((d) => d.length >= 1 && d.length <= MAX_DRUG_LEN)
    .slice(0, MAX_DRUGS);
  const p: AnalyzePayload["profile"] = {
    conditions: knownConditions ? profile.conditions.filter((c) => knownConditions.includes(c)) : [...profile.conditions],
  };
  if (profile.age !== null) p.age = profile.age;
  if (profile.pregnant !== null) p.pregnant = profile.pregnant === "yes";
  if (profile.breastfeeding !== null) p.breastfeeding = profile.breastfeeding === "yes";
  return { herbs, drugs, profile: p };
}

export type ItemStatus = "flagged" | "no_flag" | "no_data";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * ข้อควรระวังสำหรับ UI: ผลตรวจไม่บอกว่ายาแต่ละตัวอยู่กลุ่มไหน (และห้ามเดาฝั่งเบราว์เซอร์)
 * ดังนั้น 'no_flag' ของแถวยาแปลว่า "ไม่ใช่ชื่อที่ระบบไม่รู้จัก" เท่านั้น
 * ห้ามแสดงว่า "ยานี้ไม่มีธง" ธงเกี่ยวกับยาอยู่ในแผงธงตามสมุนไพร
 */
export function itemStatus(item: TrackerItem, result: AnalyzeResult): ItemStatus {
  const unknown = result.coverage.unknown_inputs.map(norm);
  if (unknown.includes(norm(item.ref))) return "no_data";
  if (item.kind === "herb" && result.flags.some((f) => f.herb_id === item.ref)) return "flagged";
  return "no_flag";
}

export interface PanelGroups { avoid: Flag[]; caution: Flag[]; info: Flag[] }

/** ตาม severity ของ engine เท่านั้น เรียงตามลำดับเดิม */
export function groupFlags(result: AnalyzeResult): PanelGroups {
  const g: PanelGroups = { avoid: [], caution: [], info: [] };
  for (const f of result.flags) g[f.severity]?.push(f);
  return g;
}

export function notCheckedLabels(result: AnalyzeResult, labels: Record<string, string>): string[] {
  return result.coverage.not_checked.map((c) => labels[c] ?? c);
}
