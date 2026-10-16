import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { downloadJSON } from "../download";
import type { Analysis } from "../hooks/useAnalysis";
import { useStore } from "../hooks/useStore";
import { MAX_IMPORT_BYTES, type TrackerStore } from "../model/tracker";
import type { Meta } from "../types";
import { FeedbackCard } from "./FeedbackCard";
import type { CloudSync } from "../model/cloud";
import { AccountCard } from "./AccountCard";
import { Glossary } from "./Glossary";
import { PharmacistSummary } from "./PharmacistSummary";
import { ProfileForm } from "./ProfileForm";
import { t, useOnLangChange } from "../i18n";
import { conditionLabels, entryName } from "../texts";

type Msg = { ok: boolean; text: string } | null;

export function MyData({ store, meta, today, analysis: a, onClearAll, cloud }: {
  store: TrackerStore; meta: Meta; today: string; analysis: Analysis; onClearAll?: () => void; cloud?: CloudSync;
}) {
  useStore(store);
  const [formKey, setFormKey] = useState(0); // ล้าง state ของฟอร์มหลังนำเข้า/ลบ
  const [msg, setMsg] = useState<Msg>(null);
  useOnLangChange(() => { setMsg(null); });
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
  const herbName = (id: string) => entryName(meta, id);
  const flags = a.current && a.result ? a.result.flags : [];

  const importFile = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!f) return;
    const fail = (m: string) => setMsg({ ok: false, text: t(`นำเข้าไม่สำเร็จ: ${m} (ข้อมูลเดิมไม่เปลี่ยน)`, `Import failed: ${m} (your existing data is unchanged)`) });
    if (f.size > MAX_IMPORT_BYTES) return fail(t("ไฟล์ใหญ่เกิน 256 KB", "The file is larger than 256 KB"));
    let text: string;
    try { text = await f.text(); } catch { return fail(t("อ่านไฟล์ไม่ได้", "Couldn't read the file")); }
    const p = store.state.profile;
    const hasData = store.state.items.length > 0 || p.age !== null || p.pregnant !== null || p.breastfeeding !== null || p.conditions.length > 0;
    if (hasData && !confirm(t("นำเข้าแล้วข้อมูลเดิมจะถูกแทนที่ทั้งหมด ทำต่อไหม", "Importing will replace all of your existing data. Continue?"))) return;
    const r = store.importJSON(text);
    if (!r.ok) return fail(r.message);
    setFormKey((k) => k + 1);
    setMsg({ ok: true, text: t("นำเข้าข้อมูลแล้ว", "Data imported") });
  };

  const clear = () => {
    const ok = store.clearAll();
    onClearAll?.(); // ล้างประวัติแชต (sessionStorage hg_chat_v1 + ในหน่วยความจำ) ด้วย
    setConfirming(false);
    setFormKey((k) => k + 1);
    setMsg(ok ? { ok: true, text: t("ลบข้อมูลทั้งหมดแล้ว", "All data deleted") }
      : { ok: false, text: t("ลบในเครื่องไม่สำเร็จ ข้อมูลเดิมอาจกลับมาเมื่อเปิดหน้านี้ใหม่ ลองอีกครั้งหรือล้างข้อมูลเว็บไซต์ในเบราว์เซอร์", "Could not delete on this device. Your old data may come back when you reopen this page. Try again, or clear the site data in your browser.") });
  };

  return (
    <section class="my-data" aria-labelledby="mydata-h">
      <h2 id="mydata-h" class="noprint">{t("ข้อมูลของฉัน", "My data")}</h2>
      <div class="noprint card privacy-card">
        {cloud?.handle ? (
          <p><strong>{t("ข้อมูลซิงก์ไปคลาวด์ในบัญชีของคุณ", "Your data is synced to the cloud in your account")}</strong> <span class="meta">{t("เครื่องนี้ยังเก็บสำเนาไว้ ใช้ข้อมูลสมมติเท่านั้น", "This device keeps a copy too. Use made-up data only.")}</span></p>
        ) : (
          <p><strong>{t("ข้อมูลอยู่ในเครื่องของคุณเท่านั้น", "Your data stays on your device only")}</strong> <span class="meta">{t("ไม่ถูกส่งไปเก็บที่เซิร์ฟเวอร์ (ส่งไปตรวจแล้วไม่เก็บ)", "It is not stored on a server (it is sent for checking and not kept)")}</span></p>
        )}
        <p class="meta">{t("กรอกเท่าที่จำเป็นต่อการตรวจ ห้ามใส่ชื่อจริง เลขประจำตัว หรือข้อมูลที่ระบุตัวตนได้", "Enter only what is needed for the check. Do not enter your real name, ID number or anything that identifies you.")}</p>
      </div>
      <div class="noprint">
        <ProfileForm key={formKey} store={store} conditions={conditionLabels(meta)} />
      </div>

      <PharmacistSummary analysis={a} meta={meta} profile={store.state.profile} />

      <section class="noprint card" aria-labelledby="backup-h">
        <h3 id="backup-h">{t("สำรอง ย้ายเครื่อง หรือลบข้อมูล", "Back up, move or delete your data")}</h3>
        <div class="data-row">
          <button type="button" class="wide-sm" onClick={() => downloadJSON(`herbguard-${today}.json`, store.exportJSON())}>{t("ส่งออกข้อมูลเป็นไฟล์", "Export data as a file")}</button>
        </div>
        <div class="data-row">
          <label class="file-btn" for="import-file">
            {t("นำเข้าข้อมูลจากไฟล์", "Import data from a file")}
            <input id="import-file" class="sr-only" type="file" accept=".json,application/json" onChange={(e) => void importFile(e.currentTarget)} />
          </label>
          <p class="meta">{t("ถ้าไฟล์มีส่วนที่ผิดจะไม่นำเข้าเลย และข้อมูลเดิมจะถูกแทนที่ทั้งหมด", "If any part of the file is invalid, nothing is imported, and your existing data is replaced completely.")}</p>
        </div>
        <div class="data-row danger-zone">
          {!confirming ? (
            <button ref={delBtn} type="button" onClick={() => setConfirming(true)}>{t("ลบข้อมูลทั้งหมด", "Delete all data")}</button>
          ) : (
            <div class="confirm-del" role="group" aria-label={t("ยืนยันการลบ", "Confirm deletion")}>
              <p>{t("ลบรายการ ประวัติ และข้อมูลสุขภาพทั้งหมดในเครื่องนี้ ย้อนกลับไม่ได้", "This deletes all items, history and health data on this device. It cannot be undone.")}</p>
              <div class="row-actions">
                <button type="button" class="danger" onClick={clear}>{t("ยืนยันลบข้อมูลทั้งหมด", "Confirm delete all data")}</button>
                <button ref={cancelBtn} type="button" onClick={() => setConfirming(false)}>{t("ยกเลิก", "Cancel")}</button>
              </div>
            </div>
          )}
        </div>
        {msg && (msg.ok ? <p role="status">{msg.text}</p> : <p class="err" role="alert">{msg.text}</p>)}
      </section>

      {cloud && <AccountCard cloud={cloud} />}

      <details class="opt-box noprint card">
        <summary>{t("อธิบายชั้นหลักฐาน (A/B/C)", "What evidence tiers (A/B/C) mean")}</summary>
        <Glossary />
      </details>
      <details class="opt-box noprint card">
        <summary>{t("ช่วยเราปรับปรุง (ทดลองใช้)", "Help us improve (trial)")}</summary>
        {/* ไม่ remount ตามผล: การ์ดล้างเฉพาะคำตอบต่อคำเตือนเมื่อชุดคำเตือนของผลปัจจุบันเปลี่ยน */}
        <FeedbackCard flags={flags} current={a.current && !!a.result} herbName={herbName} />
      </details>
    </section>
  );
}
