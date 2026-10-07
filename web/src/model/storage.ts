import type { KeyValueStorage } from "./tracker";

/** localStorage ถ้าใช้ได้ ไม่งั้น null (private mode / ถูกบล็อก) */
export function getLocalStorage(): KeyValueStorage | null {
  try {
    const s = window.localStorage;
    const k = "__hg_probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
