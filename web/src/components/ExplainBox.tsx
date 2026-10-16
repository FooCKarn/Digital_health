import { useState } from "preact/hooks";
import { explain } from "../api";
import type { Analysis } from "../hooks/useAnalysis";
import { useBusy } from "../hooks/useBusy";
import { buildPayload } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { Explanation } from "../types";
import { getLang, pick, t, tMap, useOnLangChange } from "../i18n";

const fixed = () => t("ตอนนี้ใช้ AI ไม่ได้ ข้อความคำเตือนด้านบนยังอ่านได้เหมือนเดิม", "The AI isn't available right now. The warnings above still work as before.");
const LABEL = tMap<string>(
  { llm: "AI เรียบเรียงจากผลตรวจนี้ (ผ่านตัวตรวจข้อความแล้ว)", template: "ข้อความสำรองจากฐานข้อมูล (AI ไม่ได้ใช้หรือข้อความไม่ผ่านการตรวจ)" },
  { llm: "Reworded by the AI from this result (passed the text checker)", template: "Fallback text from the database (the AI was not used, or its text did not pass the checker)" },
);

/** ตัวเลือก: AI เรียบเรียงภาษาจากผลตรวจปัจจุบัน แสดงเฉพาะเมื่อผลที่เห็นตรงกับข้อมูลปัจจุบัน */
export function ExplainBox({ store, today, known, analysis }: { store: TrackerStore; today: string; known: string[]; analysis: Analysis }) {
  const [got, setGot] = useState<{ key: string; ex: Explanation } | null>(null);
  const [err, setErr] = useState<{ key: string; msg: string } | null>(null);
  useOnLangChange(() => { setErr(null); });
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
      setErr({ key, msg: fixed() });
    }
  });
  const ex = got?.key === key ? got.ex : null; // คำอธิบายของข้อมูลเก่าไม่แสดง

  return (
    <section class="explain-box">
      <button type="button" aria-disabled={b.busy} onClick={go}>{t("ให้ AI อธิบายผลเป็นภาษาง่าย ๆ (ไม่บังคับ)", "Have the AI explain the result in plain language (optional)")}</button>
      {b.busy && <span role="status">{t("กำลังเรียบเรียง…", "Writing it up…")}</span>}
      {err?.key === key && <p class="err" role="alert">{err.msg}</p>}
      {ex && (
        <div class="explanation">
          <p class="chip">{LABEL[ex.source] ?? LABEL.template}</p>
          {getLang() === "en" && !ex.summary_en && <p class="meta">This explanation is only available in Thai.</p>}
          <p>{pick(ex.summary_th, ex.summary_en)}</p>
          <ul>{ex.items.map((i) => <li key={i.flag_id}>{pick(i.text_th, i.text_en)}</li>)}</ul>
          <p class="meta">{pick(ex.disclaimer_th, ex.disclaimer_en)}</p>
        </div>
      )}
    </section>
  );
}
