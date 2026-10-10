import type { AnalyzePayload, AnalyzeResult, Flag, Severity, Summary } from "../types";
import { dayNumber } from "./dates";
import { isHerbish, type Profile, type TrackerItem } from "./tracker";

export type { AnalyzePayload };

// ขีดจำกัดตรงกับเซิร์ฟเวอร์ (เกินแล้วได้ 400)
const MAX_HERBS = 50;
const MAX_DRUGS = 30;
const MAX_DAYS = 365;
const MAX_DRUG_LEN = 100;

const MAX_HERB_LEN = 50;
const key = (i: TrackerItem) => `${i.kind}:${i.ref}`;

/** เลือกรายการที่ส่งได้จริงตามขีดจำกัดเซิร์ฟเวอร์ (ตามลำดับในรายการ) */
function select(active: TrackerItem[]) {
  const herbRefs: string[] = [];
  for (const i of active) {
    if (isHerbish(i.kind) && i.ref.length >= 1 && i.ref.length <= MAX_HERB_LEN && !herbRefs.includes(i.ref) && herbRefs.length < MAX_HERBS) herbRefs.push(i.ref);
  }
  const drugs: string[] = [];
  for (const i of active) {
    const d = i.ref.trim();
    if (i.kind === "drug" && d.length >= 1 && d.length <= MAX_DRUG_LEN && drugs.length < MAX_DRUGS) drugs.push(d);
  }
  return { herbRefs, drugs };
}

/** รายการ (kind:ref) ที่ไม่ได้ถูกส่งไปตรวจ จึงต้องแสดงเป็น no_data ไม่ใช่ no_flag */
export function unsentRefs(active: TrackerItem[]): Set<string> {
  const { herbRefs, drugs } = select(active);
  const out = new Set<string>();
  for (const i of active) {
    const sent = isHerbish(i.kind) ? herbRefs.includes(i.ref) : drugs.includes(i.ref.trim());
    if (!sent) out.add(key(i));
  }
  return out;
}

/** null = ไม่มีสมุนไพร (ห้ามเรียก API) โรคที่ไม่อยู่ใน knownConditions ถูกตัด (ไม่ใช่รายการในแผง) */
export function buildPayload(active: TrackerItem[], profile: Profile, todayISOStr: string, knownConditions?: string[]): AnalyzePayload | null {
  const { herbRefs, drugs } = select(active);
  if (herbRefs.length === 0) return null;
  const herbs = herbRefs.map((id) => {
    let best = 0;
    for (const i of active) {
      if (isHerbish(i.kind) && i.ref === id) best = Math.max(best, Math.min(Math.max(dayNumber(i.start_date, todayISOStr) || 1, 1), MAX_DAYS)); // id ซ้ำ = เก็บค่าวันที่มากกว่า
    }
    return { id, days_in_use: best };
  });
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
 * ห้ามแสดงว่า "ยานี้ไม่มีคำเตือน" คำเตือนเกี่ยวกับยาอยู่ในแผงคำเตือนตามสมุนไพร
 */
export function itemStatus(item: TrackerItem, result: AnalyzeResult, unsent?: Set<string>): ItemStatus {
  if (unsent?.has(key(item))) return "no_data"; // ไม่ได้ส่งไปตรวจ
  const unknown = result.coverage.unknown_inputs.map(norm);
  if (unknown.includes(norm(item.ref))) return "no_data";
  if (isHerbish(item.kind) && result.flags.some((f) => f.herb_id === item.ref)) return "flagged";
  return "no_flag";
}

/** ระดับที่ engine ใช้ เรียงจากรุนแรงสุด (แหล่งเดียวของลำดับ) */
export const SEVERITIES: readonly Severity[] = ["avoid", "caution", "info"];
export const isKnownSeverity = (s: string): s is Severity => (SEVERITIES as readonly string[]).includes(s);

export interface PanelGroups { avoid: Flag[]; caution: Flag[]; info: Flag[]; other: Flag[] }

/** ตาม severity ของ engine เท่านั้น เรียงตามลำดับเดิม */
export function groupFlags(result: AnalyzeResult): PanelGroups {
  const g: PanelGroups = { avoid: [], caution: [], info: [], other: [] };
  // severity แปลกถูกแสดงในกลุ่ม other ไม่ตัดทิ้งและไม่จัดกลุ่มใหม่
  for (const f of result.flags) (isKnownSeverity(f.severity) ? g[f.severity] : g.other).push(f);
  return g;
}

/** สิ่งที่แถวในรายการแสดง: pending = กำลังตรวจ, see_panel = ดูคำเตือนในแผง (ยา/ระดับแปลก), drug_unsplit = ยาเมื่อผลไม่มีคำเตือนเลย */
export type RowView = Severity | "no_flag" | "no_data" | "pending" | "see_panel" | "drug_unsplit";

/**
 * ใช้ผลตรวจได้เฉพาะเมื่อผลนั้นตรงกับข้อมูลปัจจุบัน (current) เท่านั้น
 * ผลเก่า (ระหว่างตรวจใหม่หรือหลังตรวจล้มเหลว) ห้ามแสดงเป็นสถานะของแถว
 */
export function rowView(item: TrackerItem, a: { result: AnalyzeResult | null; summary: Summary | null; current: boolean; loading: boolean }, unsent: Set<string>): RowView {
  if (unsent.has(key(item))) return "no_data";
  const { result: r, summary: s } = a;
  if (!a.current || !r || !s) return a.loading ? "pending" : "no_data";
  const covered = isHerbish(item.kind) ? s.herbs.some((h) => h.id === item.ref) : s.drugs_as_entered.includes(item.ref.trim());
  if (!covered) return "no_data";
  const st = itemStatus(item, r, unsent);
  if (st === "no_data") return "no_data";
  // ผลตรวจไม่บอกว่ายาแต่ละตัวมีคำเตือนไหม จึงห้ามแสดงว่า "ยานี้ไม่พบคำเตือน"
  // ผลไม่มีคำเตือนเลย = แผงว่าง ไม่ชี้ไปแผง แต่บอกตามจริงว่าผลไม่ได้แยกรายยา (ไม่ได้แปลว่ายานี้ไม่มีคำเตือน)
  if (item.kind === "drug") return r.flags.length ? "see_panel" : "drug_unsplit";
  if (st === "no_flag") return "no_flag";
  return SEVERITIES.find((k) => r.flags.some((f) => f.herb_id === item.ref && f.severity === k)) ?? "see_panel";
}

/** โรคในโปรไฟล์ที่ไม่อยู่ในรหัสของระบบ ไม่ถูกส่งไปตรวจ (ต้องบอกผู้ใช้ว่าไม่ได้ตรวจ) */
export function unknownConditions(profile: Profile, knownConditions: string[]): string[] {
  return profile.conditions.filter((c) => !knownConditions.includes(c));
}

export function notCheckedLabels(result: AnalyzeResult, labels: Record<string, string>): string[] {
  return result.coverage.not_checked.map((c) => labels[c] ?? c);
}
