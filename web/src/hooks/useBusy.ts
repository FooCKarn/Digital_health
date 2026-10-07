import { useRef, useState } from "preact/hooks";

/** ปุ่มที่กำลังทำงานต้องไม่ถูกกดซ้ำ: ใช้ ref กันคลิกซ้ำก่อน re-render, state ไว้ตั้ง aria-disabled */
export function useBusy() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await fn(); } finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}
