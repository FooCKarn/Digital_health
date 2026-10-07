import { useEffect, useState } from "preact/hooks";
import type { DiaryStore } from "../model/diary";

/** render ใหม่เมื่อบันทึกสุขภาพเปลี่ยน (ไม่มี diary = ไม่ทำอะไร) */
export function useDiary(diary?: DiaryStore): void {
  const [, setVer] = useState(0);
  useEffect(() => diary?.subscribe(() => setVer((v) => v + 1)), [diary]);
}
