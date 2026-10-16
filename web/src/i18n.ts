import { useEffect, useRef, useState } from "preact/hooks";
import { getLocalStorage } from "./model/storage";

export type Lang = "th" | "en";

const LANG_KEY = "hg_lang_v1";
const listeners = new Set<() => void>();

function load(): Lang {
  try {
    return getLocalStorage()?.getItem(LANG_KEY) === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

let current: Lang = load();

export const getLang = (): Lang => current;

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  try { getLocalStorage()?.setItem(LANG_KEY, next); } catch { /* จำภาษาไม่ได้ ก็ยังสลับในหน้านี้ได้ */ }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((f) => f());
}

/** ข้อความสองภาษา: t("ไทย", "English") คืนภาษาที่เลือกอยู่ ณ ตอน render */
export const t = (th: string, en: string): string => (current === "en" ? en : th);

/** ข้อความจากเซิร์ฟเวอร์: โหมดอังกฤษใช้ฟิลด์ *_en ถ้ามี ไม่มีก็แสดงภาษาไทยเดิม */
export function pick<T extends string | null | undefined>(th: T, en?: string | null): T | string {
  return current === "en" && en ? en : th;
}

/** ตารางข้อความสองภาษา: อ่านค่าตอนไหนก็ได้ภาษาตามที่เลือก ณ ตอนนั้น */
export function tMap<K extends string>(th: Record<K, string>, en: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(th) as K[]) Object.defineProperty(out, k, { enumerable: true, get: () => t(th[k], en[k]) });
  return out;
}

/** ให้คอมโพเนนต์ render ใหม่เมื่อสลับภาษา */
export function useLang(): Lang {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return current;
}

/** สลับภาษาแล้วเรียก fn (เช่นล้างข้อความแจ้งผลที่ค้างอยู่ เพราะเก็บเป็นข้อความภาษาเดิมไว้ในสถานะ) */
export function useOnLangChange(fn: () => void): void {
  const lang = useLang();
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } fn(); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
}
