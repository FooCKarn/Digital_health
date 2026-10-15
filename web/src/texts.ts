import { t, tMap, getLang } from "./i18n";
import type { Meta } from "./types";

/** วลีหลักฐานจากหนังสือ: โหมดอังกฤษแสดงคำแปลพร้อมต้นฉบับไทยกำกับ (ไว้ตรวจเทียบกับเล่ม) */
export const quoteText = (th: string, en?: string | null): string => (getLang() === "en" && en ? `${en} (Thai original: ${th})` : th);

/** ชื่อรายการที่ใช้อยู่ตามภาษาที่เลือก: สมุนไพร/ตำรับอ่านชื่อจากรหัส (ชื่อที่เก็บไว้ตอนเพิ่มเป็นภาษาตอนนั้น) ยาใช้ชื่อที่ผู้ใช้เลือก/พิมพ์ */
let labelMeta: Meta | null = null;
export const setLabelMeta = (m: Meta | null) => { labelMeta = m; };
export const itemLabel = (i: { kind: string; ref: string; label: string }): string => (i.kind !== "drug" && labelMeta ? entryName(labelMeta, i.ref) : i.label);

/** ชื่อโรค/สภาวะตามภาษาที่เลือก (ไม่มีคำแปลก็ใช้ภาษาไทย) */
export const conditionLabels = (m: Meta): Record<string, string> => (getLang() === "en" && m.conditions_en ? m.conditions_en : m.conditions);
/** ชื่อสมุนไพรหรือตำรับตามรหัส ตามภาษาที่เลือก */
export function entryName(m: Meta, id: string): string {
  const e = m.herbs.find((h) => h.id === id) ?? m.formulas?.find((f) => f.id === id);
  return e ? (getLang() === "en" && e.name_en ? e.name_en : e.name_th) : id;
}

// ข้อความตายตัวที่ใช้หลายหน้า (ห้ามสื่อว่าไม่มีความเสี่ยง)
export const noFlag = () => t("ไม่พบคำเตือนในฐานข้อมูลนี้", "No warning found in this database");
export const noFlagNote = () => t("นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร", "That doesn't mean it's suitable to use. Ask a pharmacist.");
export const NOT_CHECKED = tMap<string>(
  { pregnancy: "การตั้งครรภ์", breastfeeding: "การให้นมบุตร", age: "อายุ" },
  { pregnancy: "Pregnancy", breastfeeding: "Breastfeeding", age: "Age" },
);
export const pharmacist = () => t(
  "แนะนำให้ปรึกษาเภสัชกรก่อนใช้ (มียากลุ่มที่ทีมกำหนดให้เภสัชกรทบทวน) · ดูใบสรุปเภสัชกรในหน้า ข้อมูลของฉัน",
  "Ask a pharmacist before use (some drug classes are marked for pharmacist review) · see the pharmacist summary in My data",
);
// ประโยคบอกว่าควรทำอะไรต่อ: ตายตัวตามระดับ ไม่ใช่ข้อมูลทางการแพทย์ใหม่ ไม่ผ่าน LLM
export const NEXT_STEP = tMap<string>(
  { avoid: "อย่าเริ่มหรือหยุดใช้เองโดยไม่ถามผู้สั่งยา ปรึกษาแพทย์หรือเภสัชกรก่อน", caution: "แจ้งเภสัชกรหรือแพทย์ก่อนใช้" },
  { avoid: "Do not start or stop anything on your own without asking whoever prescribed your medicine. Talk to a doctor or pharmacist first.", caution: "Tell your pharmacist or doctor before using." },
);
// ชื่อกฎแบบอ่านง่าย; รหัสกฎยังแสดงเป็นข้อความเล็กในส่วนที่มา
export const RULE_PLAIN = tMap<string>(
  { R1: "ข้อห้ามตามเงื่อนไขของคุณ", R2: "ใช้ร่วมกับยา", R3: "หลายรายการเสี่ยงด้านเดียวกัน", R4: "ใช้นานเกินกำหนด" },
  { R1: "Contraindication for your conditions", R2: "Used together with a medicine", R3: "Several items with the same kind of risk", R4: "Used longer than the limit" },
);
export const TIER_PLAIN = tMap<string>({ A: "หนังสือระบุไว้โดยตรง" }, { A: "Stated directly in the book" });
