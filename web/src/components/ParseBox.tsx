import { useState } from "preact/hooks";
import { parseText } from "../api";
import { useBusy } from "../hooks/useBusy";
import { startForDay } from "../model/dates";
import type { TrackerStore } from "../model/tracker";
import type { Meta, ParseProposal } from "../types";

const FIXED = "ใช้ AI ไม่ได้ในขณะนี้ กรอกเองได้ตามปกติ";

type Row = { key: string; kind: "herb" | "drug"; ref: string; label: string; day?: number };

/** ข้อความอิสระ → ข้อเสนอจาก AI → ผู้ใช้ติ๊กยืนยันก่อนจึงเพิ่ม (CLAUDE.md ข้อ 4a) ไม่เพิ่มเองเด็ดขาด */
export function ParseBox({ meta, store, today, onDone }: { meta: Meta; store: TrackerStore; today: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [prop, setProp] = useState<ParseProposal | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<string[]>([]);
  const parse = useBusy();
  // ป้องกันซ้อน: รหัสสมุนไพรที่ไม่อยู่ใน meta ไม่ถูกแสดง/เพิ่ม และนับรวมใน "ตัดทิ้ง"
  const okHerbs = prop ? prop.herbs.filter((h) => meta.herbs.some((x) => x.id === h.id)) : [];
  const dropped = prop ? prop.dropped + (prop.herbs.length - okHerbs.length) : 0;
  const rows: Row[] = prop ? [
    ...okHerbs.map((h): Row => ({ key: `h-${h.id}`, kind: "herb", ref: h.id, label: meta.herbs.find((x) => x.id === h.id)?.name_th ?? h.id, day: h.days_in_use })),
    ...prop.drugs.map((d): Row => { const k = meta.drugs.find((x) => x.toLowerCase() === d.toLowerCase()) ?? d; return { key: `d-${k}`, kind: "drug", ref: k, label: k }; }),
  ] : [];
  const chosen = rows.filter((r) => ticked[r.key]);

  const send = () => parse.run(async () => {
    setProp(null); setTicked({}); setErrs([]);
    if (!text.trim()) return setMsg("พิมพ์ข้อความก่อน");
    setMsg("กำลังแปลง…");
    try {
      setProp(await parseText(text.trim()));
      setMsg("AI เสนอรายการต่อไปนี้ โปรดเทียบกับข้อความที่พิมพ์ แล้วติ๊กรายการที่ต้องการก่อนกดยืนยัน (ยังไม่มีอะไรถูกเพิ่ม)");
    } catch {
      setMsg(FIXED);
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
    if (!bad.length) onDone();
  };

  return (
    <section class="parse-box" aria-labelledby="parse-h">
      <h3 id="parse-h">ตัวเลือก: ให้ AI แยกรายการจากข้อความ</h3>
      <label for="parse-text">พิมพ์ข้อความ เช่น ใช้ขิงมา 3 วัน และกินยา warfarin</label>
      <textarea id="parse-text" rows={3} maxLength={2000} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <button type="button" aria-disabled={parse.busy} onClick={send}>แยกรายการด้วย AI</button>
      {msg && <p role="status">{msg}</p>}
      {prop && (
        <div>
          {rows.length > 0 && (
            <ul class="proposal">
              {rows.map((r) => (
                <li key={r.key}>
                  <label>
                    <input type="checkbox" checked={!!ticked[r.key]} onChange={(e) => setTicked({ ...ticked, [r.key]: e.currentTarget.checked })} />
                    {` ${r.label} (${r.kind === "herb" ? "สมุนไพร" : "ยา"}${r.day ? ` · วันที่ ${r.day}` : ""})`}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {prop.unmatched.length > 0 && <p class="warn">{`ไม่พบในฐานข้อมูล/ไม่แน่ใจ (ไม่ถูกเสนอให้เพิ่ม): ${prop.unmatched.join(", ")}`}</p>}
          {dropped > 0 && <p class="warn">{`AI ส่งรายการที่ระบบไม่รู้จักกลับมา ${dropped} รายการ (ตัดทิ้งแล้ว) โปรดเทียบกับข้อความที่พิมพ์`}</p>}
          {rows.length > 0 && <button type="button" class="primary" aria-disabled={chosen.length === 0} onClick={confirmAll}>{`ยืนยันเพิ่ม ${chosen.length} รายการ`}</button>}
          {errs.map((e) => <p class="err" role="alert" key={e}>{e}</p>)}
        </div>
      )}
    </section>
  );
}
