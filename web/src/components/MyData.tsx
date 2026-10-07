import { useState } from "preact/hooks";
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

export function MyData({ store, meta, today, analysis: a }: { store: TrackerStore; meta: Meta; today: string; analysis: Analysis }) {
  useStore(store);
  const [formKey, setFormKey] = useState(0); // ล้าง state ของฟอร์มหลังนำเข้า/ลบ
  const [msg, setMsg] = useState<Msg>(null);
  const [confirming, setConfirming] = useState(false);
  const herbName = (id: string) => meta.herbs.find((h) => h.id === id)?.name_th ?? id;
  const flags = a.current && a.result ? a.result.flags : [];

  const importFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!f) return;
    const fail = (m: string) => setMsg({ ok: false, text: `นำเข้าไม่สำเร็จ: ${m} (ข้อมูลเดิมไม่เปลี่ยน)` });
    if (f.size > MAX_IMPORT_BYTES) return fail("ไฟล์ใหญ่เกิน 256 KB");
    let text: string;
    try { text = await f.text(); } catch { return fail("อ่านไฟล์ไม่ได้"); }
    if (store.state.items.length > 0 && !confirm("นำเข้าจะแทนที่ข้อมูลเดิมทั้งหมด ดำเนินการต่อ?")) return;
    const r = store.importJSON(text);
    if (!r.ok) return fail(r.message);
    setFormKey((k) => k + 1);
    setMsg({ ok: true, text: "นำเข้าข้อมูลแล้ว" });
  };

  const clear = () => {
    store.clearAll();
    setConfirming(false);
    setFormKey((k) => k + 1);
    setMsg({ ok: true, text: "ลบข้อมูลทั้งหมดแล้ว" });
  };

  return (
    <section class="my-data" aria-labelledby="mydata-h">
      <h2 id="mydata-h" class="noprint">ข้อมูลของฉัน</h2>
      <div class="noprint">
        <p class="meta">ข้อมูลอยู่ในเครื่องของคุณเท่านั้น ไม่ถูกส่งไปเก็บที่เซิร์ฟเวอร์ (ส่งไปตรวจแล้วไม่เก็บ)</p>
        {!store.persistent && <p class="warn">ข้อมูลจะหายเมื่อปิดหน้านี้ (เบราว์เซอร์ไม่อนุญาตให้บันทึก) ส่งออกไฟล์ไว้ถ้าต้องการเก็บ</p>}
        {store.recovered && <p class="warn">ข้อมูลที่บันทึกไว้เสียหาย เริ่มใหม่ให้แล้ว</p>}
        <p class="meta">กรอกเท่าที่จำเป็นต่อการตรวจ ห้ามใส่ชื่อจริง เลขประจำตัว หรือข้อมูลที่ระบุตัวตนได้</p>
        <ProfileForm key={formKey} store={store} conditions={meta.conditions} />
      </div>

      <PharmacistSummary analysis={a} meta={meta} profile={store.state.profile} />

      <section class="noprint" aria-labelledby="backup-h">
        <h3 id="backup-h">สำรอง ย้ายเครื่อง หรือลบข้อมูล</h3>
        <p class="row-actions">
          <button type="button" onClick={() => downloadJSON(`herbguard-${today}.json`, store.exportJSON())}>ส่งออกข้อมูล (JSON)</button>
        </p>
        <label for="import-file">นำเข้าข้อมูลจากไฟล์ JSON</label>
        <input id="import-file" type="file" accept=".json,application/json" onChange={(e) => void importFile(e.currentTarget)} />
        <p class="meta">ไฟล์ต้องถูกต้องทั้งไฟล์ ไม่นำเข้าบางส่วน และจะแทนที่ข้อมูลเดิม</p>
        {!confirming ? (
          <p><button type="button" onClick={() => setConfirming(true)}>ลบข้อมูลทั้งหมด</button></p>
        ) : (
          <div class="warn" role="group" aria-label="ยืนยันการลบ">
            <p>ลบรายการ ประวัติ และข้อมูลสุขภาพทั้งหมดในเครื่องนี้ ย้อนกลับไม่ได้</p>
            <p class="row-actions">
              <button type="button" onClick={clear}>ยืนยันลบข้อมูลทั้งหมด</button>
              <button type="button" onClick={() => setConfirming(false)}>ยกเลิก</button>
            </p>
          </div>
        )}
        {msg && (msg.ok ? <p role="status">{msg.text}</p> : <p class="err" role="alert">{msg.text}</p>)}
      </section>

      <details class="opt-box noprint">
        <summary>เพิ่มเติม: อธิบายชั้นหลักฐาน · ช่วยเราปรับปรุง</summary>
        <Glossary />
        <FeedbackCard flags={flags} herbName={herbName} />
      </details>
    </section>
  );
}
