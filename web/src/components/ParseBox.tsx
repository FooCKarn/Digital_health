import { useRef, useState } from "preact/hooks";
import { parseText } from "../api";
import { useBusy } from "../hooks/useBusy";
import { startForDay } from "../model/dates";
import type { TrackerStore } from "../model/tracker";
import type { Meta, ParseProposal } from "../types";
import { t, useOnLangChange } from "../i18n";
import { entryName } from "../texts";

const fixed = () => t("ตอนนี้ใช้ AI ไม่ได้ กรอกเองได้เหมือนเดิม", "The AI isn't available right now. You can still enter items yourself.");

type Row = { key: string; kind: "herb" | "drug"; ref: string; label: string; day?: number };

/** ข้อความอิสระ → ข้อเสนอจาก AI → ผู้ใช้ติ๊กยืนยันก่อนจึงเพิ่ม ไม่เพิ่มเองเด็ดขาด */
export function ParseBox({ meta, store, today, onDone }: { meta: Meta; store: TrackerStore; today: string; onDone: (labels: string[]) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  useOnLangChange(() => { setMsg(""); });
  const [prop, setProp] = useState<ParseProposal | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<string[]>([]);
  const parse = useBusy();
  const box = useRef<HTMLTextAreaElement>(null);
  // ป้องกันซ้อน: รหัสสมุนไพรที่ไม่อยู่ใน meta ไม่ถูกแสดง/เพิ่ม และนับรวมใน "ตัดทิ้ง"
  const okHerbs = prop ? prop.herbs.filter((h) => meta.herbs.some((x) => x.id === h.id)) : [];
  const dropped = prop ? prop.dropped + (prop.herbs.length - okHerbs.length) : 0;
  const rows: Row[] = prop ? [
    ...okHerbs.map((h): Row => ({ key: `h-${h.id}`, kind: "herb", ref: h.id, label: entryName(meta, h.id), day: h.days_in_use })),
    ...prop.drugs.map((d): Row => { const k = meta.drugs.find((x) => x.toLowerCase() === d.toLowerCase()) ?? d; return { key: `d-${k}`, kind: "drug", ref: k, label: k }; }),
  ] : [];
  const chosen = rows.filter((r) => ticked[r.key]);

  const send = () => parse.run(async () => {
    setProp(null); setTicked({}); setErrs([]);
    if (!text.trim()) { setMsg(t("พิมพ์ข้อความก่อน", "Type some text first")); box.current?.focus(); return; }
    setMsg(t("กำลังแปลง…", "Working on it…"));
    try {
      setProp(await parseText(text.trim()));
      setMsg(t("AI แยกได้ตามนี้ ลองเทียบกับที่พิมพ์ แล้วติ๊กอันที่ใช่ก่อนกดยืนยัน (ยังไม่มีอะไรถูกเพิ่ม)", "The AI picked out these items. Check them against what you typed and tick the right ones before confirming. Nothing has been added yet."));
    } catch {
      setMsg(fixed());
    }
  });

  const confirmAll = () => {
    if (!chosen.length) return;
    const bad: string[] = [];
    const left = { ...ticked };
    for (const r of chosen) {
      const start = (r.day && startForDay(Math.min(Math.max(r.day, 1), 365), today)) || today;
      const res = store.addItem({ kind: r.kind, ref: r.ref, label: r.label, start_date: start });
      if (res.ok) left[r.key] = false; else bad.push(`${r.label}: ${res.message}`);
    }
    setTicked(left); // รายการที่เพิ่มสำเร็จแล้วไม่ถูกส่งซ้ำเมื่อลองใหม่
    setErrs(bad);
    if (!bad.length) onDone(chosen.map((r) => r.label));
  };

  return (
    <section class="parse-box" aria-labelledby="parse-h">
      <h3 id="parse-h">{t("ให้ AI ช่วยแยกรายการจากข้อความ (ไม่บังคับ)", "Let the AI pick items out of your text (optional)")}</h3>
      <label for="parse-text">{t("พิมพ์ข้อความ เช่น ใช้ขิงมา 3 วัน และกินยา warfarin", "Type a sentence, for example: I have used ginger for 3 days and I take warfarin")}</label>
      <textarea ref={box} id="parse-text" rows={3} maxLength={1000} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <button type="button" aria-disabled={parse.busy} onClick={send}>{t("แยกรายการด้วย AI", "Pick out items with AI")}</button>
      {msg && <p role="status">{msg}</p>}
      {prop && (
        <div>
          {rows.length > 0 && (
            <ul class="proposal">
              {rows.map((r) => (
                <li key={r.key}>
                  <label>
                    <input type="checkbox" checked={!!ticked[r.key]} onChange={(e) => setTicked({ ...ticked, [r.key]: e.currentTarget.checked })} />
                    {` ${r.label} (${r.kind === "herb" ? t("สมุนไพร", "herb") : t("ยา", "medicine")}${r.day ? ` · ${t(`วันที่ ${r.day}`, `day ${r.day}`)}` : ""})`}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {prop.unmatched.length > 0 && <p class="warn">{`${t("ไม่พบในฐานข้อมูล/ไม่แน่ใจ (ไม่ถูกเสนอให้เพิ่ม)", "Not in the database or unsure (not suggested for adding)")}: ${prop.unmatched.join(", ")}`}</p>}
          {dropped > 0 && <p class="warn">{t(`AI ส่งชื่อที่ไม่อยู่ในฐานข้อมูลมา ${dropped} รายการ ตัดออกแล้ว ลองเทียบกับที่พิมพ์ดู`, `The AI returned ${dropped} ${dropped === 1 ? "name" : "names"} that are not in the database and ${dropped === 1 ? "it was" : "they were"} removed. Compare with what you typed.`)}</p>}
          {rows.length > 0 && <button type="button" class="primary" aria-disabled={chosen.length === 0} onClick={confirmAll}>{t(`ยืนยันเพิ่ม ${chosen.length} รายการ`, `Confirm adding ${chosen.length} ${chosen.length === 1 ? "item" : "items"}`)}</button>}
          {errs.map((e) => <p class="err" role="alert" key={e}>{e}</p>)}
        </div>
      )}
    </section>
  );
}
