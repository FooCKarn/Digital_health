import { useEffect, useState } from "preact/hooks";
import type { TrackerStore } from "../model/tracker";

/** render ใหม่เมื่อข้อมูลใน store เปลี่ยน */
export function useStore(store: TrackerStore): void {
  const [, setVer] = useState(0);
  useEffect(() => store.subscribe(() => setVer((v) => v + 1)), [store]);
}
