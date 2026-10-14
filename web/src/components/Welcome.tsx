import { useEffect, useRef, useState } from "preact/hooks";
import type { CloudSync } from "../model/cloud";
import type { KeyValueStorage } from "../model/tracker";
import { AccountCard } from "./AccountCard";
import { t } from "../i18n";

export const WELCOME_KEY = "hg_welcome_v1";

/** ขั้นแนะนำการใช้งาน (สั้น ข้ามได้) ข้อความตรงกับชื่อแท็บจริง */
export const GUIDE_STEPS = [
  { title: "ช่วงนี้", text: "กด “เพิ่ม” เพื่อใส่สมุนไพรหรือยาที่ใช้ แล้วดูคำเตือนที่พบ", en: { title: "This period", text: "Press “Add” to enter the herbs or medicines you use, then read the warnings found." } },
  { title: "ผู้ช่วย", text: "พิมพ์บอกได้เลย เช่น “กินขมิ้นแล้ว” หรือถามเรื่องคำเตือน", en: { title: "Assistant", text: "Just type, for example “I took turmeric”, or ask about a warning." } },
  { title: "บันทึก", text: "จดความรู้สึกและค่าสุขภาพรายวัน ดูย้อนหลังได้", en: { title: "Diary", text: "Log how you feel and your health readings each day, and look back over time." } },
  { title: "ข้อมูลของฉัน", text: "โปรไฟล์ ส่งออกหรือลบข้อมูล และบัญชีสำหรับใช้หลายเครื่อง", en: { title: "My data", text: "Your profile, exporting or deleting data, and an account for using several devices." } },
] as const;

/**
 * เปิดครั้งแรก: (1) เลือกเข้าสู่ระบบหรือใช้แบบ guest (guest = ข้อมูลอยู่ในเครื่องนี้เท่านั้น เหมือนเดิม)
 * (2) แนะนำสั้น ๆ แล้วจำไว้ว่าเห็นแล้ว ไม่แสดงซ้ำ
 */
export function Welcome({ cloud, storage }: { cloud: CloudSync; storage: KeyValueStorage | null }) {
  const seen = () => { try { return storage?.getItem(WELCOME_KEY) === "1"; } catch { return false; } };
  const [done, setDone] = useState(seen);
  const [guest, setGuest] = useState(false);
  const [login, setLogin] = useState(false);
  const [step, setStep] = useState(0);
  const [, setV] = useState(0);
  useEffect(() => cloud.subscribe(() => setV((v) => v + 1)), [cloud]);
  const box = useRef<HTMLDivElement>(null);
  const phase = done || cloud.status === "unknown" ? null : cloud.status !== "unavailable" && cloud.handle === null && !guest ? "gate" : "guide";
  useEffect(() => { box.current?.querySelector<HTMLElement>("button")?.focus(); }, [phase, step]);
  if (!phase) return null;

  const finish = () => { try { storage?.setItem(WELCOME_KEY, "1"); } catch { /* จำไม่ได้ก็แสดงใหม่คราวหน้า */ } setDone(true); };
  const last = step === GUIDE_STEPS.length - 1;
  const g = GUIDE_STEPS[step];
  return (
    <div class="welcome-backdrop noprint">
      <div ref={box} class="welcome card" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
        {phase === "gate" ? (
          <>
            <h2 id="welcome-h">{t("ยินดีต้อนรับสู่ใบพลู", "Welcome to Baiplu")}</h2>
            <div class="welcome-actions">
              <button type="button" class="primary" onClick={() => setGuest(true)}>{t("ใช้แบบ guest", "Use as guest")}</button>
              <p class="meta">{t("ข้อมูลเก็บในเครื่องนี้เท่านั้น ไม่ต้องสมัคร", "Your data stays on this device. No sign-up needed.")}</p>
              <button type="button" aria-expanded={login} onClick={() => setLogin((x) => !x)}>{t("เข้าสู่ระบบ / สมัคร", "Log in / Sign up")}</button>
            </div>
            {login && <AccountCard cloud={cloud} defaultOpen />}
          </>
        ) : (
          <>
            <h2 id="welcome-h">{`${t("วิธีใช้", "How to use")} (${step + 1}/${GUIDE_STEPS.length})`}</h2>
            <h3>{t(g.title, g.en.title)}</h3>
            <p>{t(g.text, g.en.text)}</p>
            {last && <p class="meta">{t("ใบพลูไม่ใช่การวินิจฉัย การไม่พบคำเตือนไม่ได้แปลว่าใช้ได้อย่างเหมาะสม ถามเภสัชกรหรือแพทย์ก่อนใช้", "Baiplu is not a diagnosis. Finding no warning does not mean a combination is suitable to use. Ask a pharmacist or doctor before use.")}</p>}
            <div class="row-actions">
              {!last && <button type="button" onClick={finish}>{t("ข้าม", "Skip")}</button>}
              <button type="button" class="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? t("เริ่มใช้งาน", "Get started") : t("ถัดไป", "Next")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
