import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { downloadJSON } from "../download";
import type { Analysis } from "../hooks/useAnalysis";
import { useStore } from "../hooks/useStore";
import { MAX_IMPORT_BYTES, type TrackerStore } from "../model/tracker";
import type { Meta } from "../types";
import { FeedbackCard } from "./FeedbackCard";
import { Glossary } from "./Glossary";
import { PharmacistSummary } from "./PharmacistSummary";
import { ProfileForm } from "./ProfileForm";

type Msg = { ok: boolean; text: string } | null;

export function MyData({ store, meta, today, analysis: a, onClearAll }: {
  store: TrackerStore; meta: Meta; today: string; analysis: Analysis; onClearAll?: () => void;
}) {
  useStore(store);
  const [formKey, setFormKey] = useState(0); // ล้าง state ของฟอร์มหลังนำเข้า/ลบ
  const [msg, setMsg] = useState<Msg>(null);
  const [confirming, setConfirming] = useState(false);
  const delBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  // เปิดกล่องยืนยันแล้วโฟกัสที่ ยกเลิก (ไม่ใช่ปุ่มลบ); ยกเลิกแล้วคืนโฟกัสให้ปุ่ม ลบข้อมูลทั้งหมด
  useLayoutEffect(() => {
    if (confirming) cancelBtn.current?.focus();
    else if (wasConfirming.current) delBtn.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const herbName = (id: string) => meta.herbs.find((h) => h.id === id)?.name_th ?? meta.formulas?.find((f) => f.id === id)?.name_th ?? id;
  const flags = a.current && a.result ? a.result.flags : [];

  const importFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!f) return;
    const fail = (m: string) => setMsg({ ok: false, text: `นำเข้าไม่สำเร็จ: ${m} (ข้อมูลเดิมไม่เปลี่ยน)` });
    if (f.size > MAX_IMPORT_BYTES) return fail("ไฟล์ใหญ่เกิน 256 KB");
    let text: string;
    try { text = await f.text(); } catch { return fail("อ่านไฟล์ไม่ได้"); }
    const p = store.state.profile;
    const hasData = store.state.items.length > 0 || p.age !== null || p.pregnant !== null || p.breastfeeding !== null || p.conditions.length > 0;
    if (hasData && !confirm("นำเข้าแล้วข้อมูลเดิมจะถูกแทนที่ทั้งหมด ทำต่อไหม")) return;
    const r = store.importJSON(text);
    if (!r.ok) return fail(r.message);
    setFormKey((k) => k + 1);
    setMsg({ ok: true, text: "นำเข้าข้อมูลแล้ว" });
  };

  const clear = () => {
    const ok = store.clearAll();
    onClearAll?.(); // ล้างประวัติแชต (sessionStorage hg_chat_v1 + ในหน่วยความจำ) ด้วย
    setConfirming(false);
    setFormKey((k) => k + 1);
    setMsg(ok ? { ok: true, text: "ลบข้อมูลทั้งหมดแล้ว" }
      : { ok: false, text: "ลบในเครื่องไม่สำเร็จ ข้อมูลเดิมอาจกลับมาเมื่อเปิดหน้านี้ใหม่ ลองอีกครั้งหรือล้างข้อมูลเว็บไซต์ในเบราว์เซอร์" });
  };

  return (
    <section class="my-data" aria-labelledby="mydata-h">
      <h2 id="mydata-h" class="noprint">ข้อมูลของฉัน</h2>
      <div class="noprint card privacy-card">
        <p><strong>ข้อมูลอยู่ในเครื่องของคุณเท่านั้น</strong> <span class="meta">ไม่ถูกส่งไปเก็บที่เซิร์ฟเวอร์ (ส่งไปตรวจแล้วไม่เก็บ)</span></p>
        <p class="meta">กรอกเท่าที่จำเป็นต่อการตรวจ ห้ามใส่ชื่อจริง เลขประจำตัว หรือข้อมูลที่ระบุตัวตนได้</p>
      </div>
      <div class="noprint">
        <ProfileForm key={formKey} store={store} conditions={meta.conditions} />
      </div>

      <PharmacistSummary analysis={a} meta={meta} profile={store.state.profile} />

      <section class="noprint card" aria-labelledby="backup-h">
        <h3 id="backup-h">สำรอง ย้ายเครื่อง หรือลบข้อมูล</h3>
        <div class="data-row">
          <button type="button" class="wide-sm" onClick={() => downloadJSON(`herbguard-${today}.json`, store.exportJSON())}>ส่งออกข้อมูลเป็นไฟล์</button>
          <p class="meta">ดาวน์โหลดเป็นไฟล์ไว้สำรองหรือย้ายไปเครื่องอื่น</p>
        </div>
        <div class="data-row">
          <label class="file-btn" for="import-file">
            นำเข้าข้อมูลจากไฟล์
            <input id="import-file" class="sr-only" type="file" accept=".json,application/json" onChange={(e) => void importFile(e.currentTarget)} />
          </label>
          <p class="meta">ถ้าไฟล์มีส่วนที่ผิดจะไม่นำเข้าเลย และข้อมูลเดิมจะถูกแทนที่ทั้งหมด</p>
        </div>
        <div class="data-row danger-zone">
          {!confirming ? (
            <button ref={delBtn} type="button" onClick={() => setConfirming(true)}>ลบข้อมูลทั้งหมด</button>
          ) : (
            <div class="confirm-del" role="group" aria-label="ยืนยันการลบ">
              <p>ลบรายการ ประวัติ และข้อมูลสุขภาพทั้งหมดในเครื่องนี้ ย้อนกลับไม่ได้</p>
              <div class="row-actions">
                <button type="button" class="danger" onClick={clear}>ยืนยันลบข้อมูลทั้งหมด</button>
                <button ref={cancelBtn} type="button" onClick={() => setConfirming(false)}>ยกเลิก</button>
              </div>
            </div>
          )}
        </div>
        {msg && (msg.ok ? <p role="status">{msg.text}</p> : <p class="err" role="alert">{msg.text}</p>)}
      </section>

      <details class="opt-box noprint card">
        <summary>อธิบายชั้นหลักฐาน (A/B/C)</summary>
        <Glossary />
      </details>
      <details class="opt-box noprint card">
        <summary>ช่วยเราปรับปรุง (ทดลองใช้)</summary>
        {/* ไม่ remount ตามผล: การ์ดล้างเฉพาะคำตอบต่อคำเตือนเมื่อชุดคำเตือนของผลปัจจุบันเปลี่ยน */}
        <FeedbackCard flags={flags} current={a.current && !!a.result} herbName={herbName} />
      </details>
    </section>
  );
}
