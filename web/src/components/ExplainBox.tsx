import { useState } from "preact/hooks";
import { explain } from "../api";
import type { Analysis } from "../hooks/useAnalysis";
import { useBusy } from "../hooks/useBusy";
import { buildPayload } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { Explanation } from "../types";

const FIXED = "ตอนนี้ใช้ AI ไม่ได้ ข้อความคำเตือนด้านบนยังอ่านได้เหมือนเดิม";
const LABEL = {
  llm: "AI เรียบเรียงจากผลตรวจนี้ (ผ่านตัวตรวจข้อความแล้ว)",
  template: "ข้อความสำรองจากฐานข้อมูล (AI ไม่ได้ใช้หรือข้อความไม่ผ่านการตรวจ)",
};

/** ตัวเลือก: AI เรียบเรียงภาษาจากผลตรวจปัจจุบัน แสดงเฉพาะเมื่อผลที่เห็นตรงกับข้อมูลปัจจุบัน */
export function ExplainBox({ store, today, known, analysis }: { store: TrackerStore; today: string; known: string[]; analysis: Analysis }) {
  const [got, setGot] = useState<{ key: string; ex: Explanation } | null>(null);
  const [err, setErr] = useState<{ key: string; msg: string } | null>(null);
  const b = useBusy();
  const payload = buildPayload(store.active(), store.state.profile, today, known);
  if (!analysis.current || !payload) return null;
  const key = JSON.stringify(payload);

  const go = () => b.run(async () => {
    setErr(null);
    try {
      const { explanation } = await explain(payload);
      setGot({ key, ex: explanation });
    } catch {
      setErr({ key, msg: FIXED });
    }
  });
  const ex = got?.key === key ? got.ex : null; // คำอธิบายของข้อมูลเก่าไม่แสดง

  return (
    <section class="explain-box">
      <button type="button" aria-disabled={b.busy} onClick={go}>ให้ AI อธิบายผลเป็นภาษาง่าย ๆ (ไม่บังคับ)</button>
      {b.busy && <span role="status">กำลังเรียบเรียง…</span>}
      {err?.key === key && <p class="err" role="alert">{err.msg}</p>}
      {ex && (
        <div class="explanation">
          <p class="chip">{LABEL[ex.source] ?? LABEL.template}</p>
          <p>{ex.summary_th}</p>
          <ul>{ex.items.map((i) => <li key={i.flag_id}>{i.text_th}</li>)}</ul>
          <p class="meta">{ex.disclaimer_th}</p>
        </div>
      )}
    </section>
  );
}
