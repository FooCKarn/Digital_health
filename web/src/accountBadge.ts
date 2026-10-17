import { useEffect, useState } from "preact/hooks";

// ชื่อผู้ใช้ที่เข้าสู่ระบบอยู่ สำหรับแสดงที่หัวเว็บ: หัวเว็บอยู่นอกหน้าหลักที่สร้างตัวซิงก์ จึงส่งผ่านที่เก็บเล็กๆ นี้
export type AccountBadge = { handle: string; logout: () => void } | null;

let current: AccountBadge = null;
const listeners = new Set<() => void>();

export function setAccountBadge(next: AccountBadge) {
  if (next?.handle === current?.handle && !!next === !!current) { current = next; return; }
  current = next;
  listeners.forEach((f) => f());
}

export function useAccountBadge(): AccountBadge {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return current;
}
