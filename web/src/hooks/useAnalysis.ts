import { useEffect, useRef, useState } from "preact/hooks";
import { analyze, ApiError } from "../api";
import { buildPayload } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { AnalyzeResult, Summary } from "../types";

export interface Analysis {
  status: "idle" | "loading" | "ok" | "error";
  result: AnalyzeResult | null;
  summary: Summary | null;
  stale: boolean;
  error: string | null;
  retry(): void;
}

const DEBOUNCE_MS = 300;
const FIXED = new ApiError("network").thaiMessage;
type State = Omit<Analysis, "retry">;

/** ตรวจอัตโนมัติเมื่อรายการ/โปรไฟล์เปลี่ยน ผลที่ตอบกลับหลังข้อมูลเปลี่ยนไปแล้วถูกทิ้ง (ตัวนับรุ่น gen) */
export function useAnalysis(store: TrackerStore, today: string, knownConditions?: string[]): Analysis {
  const [, setVer] = useState(0);
  useEffect(() => store.subscribe(() => setVer((v) => v + 1)), [store]);
  const [state, setState] = useState<State>({ status: "idle", result: null, summary: null, stale: false, error: null });
  const [attempt, setAttempt] = useState(0);
  const gen = useRef(0);

  const payload = buildPayload(store.active(), store.state.profile, today, knownConditions);
  const key = payload && JSON.stringify(payload); // เทียบด้วยเนื้อหา: แก้ชื่อเฉยๆ ไม่ต้องตรวจใหม่

  useEffect(() => {
    const my = ++gen.current;
    if (!key) {
      setState({ status: "idle", result: null, summary: null, stale: false, error: null });
      return;
    }
    setState((s) => ({ ...s, status: "loading", error: null }));
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const d = await analyze(JSON.parse(key), ctrl.signal);
        if (my !== gen.current) return;
        setState({ status: "ok", result: d.result, summary: d.summary, stale: false, error: null });
      } catch (e) {
        // คำขอที่ถูกยกเลิก/ถูกแทนที่ ไม่ใช่ข้อผิดพลาดของผู้ใช้
        if (my !== gen.current || ctrl.signal.aborted) return;
        const error = e instanceof ApiError ? e.thaiMessage : FIXED;
        setState((s) => ({ ...s, status: "error", stale: s.result !== null, error }));
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [key, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
