import { useEffect, useRef, useState } from "preact/hooks";
import type { CloudSync } from "../model/cloud";
import type { KeyValueStorage } from "../model/tracker";
import { AccountCard } from "./AccountCard";

export const WELCOME_KEY = "hg_welcome_v1";

/** ขั้นแนะนำการใช้งาน (สั้น ข้ามได้) ข้อความตรงกับชื่อแท็บจริง */
export const GUIDE_STEPS = [
  { title: "ช่วงนี้", text: "กด “เพิ่ม” เพื่อใส่สมุนไพรหรือยาที่ใช้ แล้วดูคำเตือนที่พบ" },
  { title: "ผู้ช่วย", text: "พิมพ์บอกได้เลย เช่น “กินขมิ้นแล้ว” หรือถามเรื่องคำเตือน" },
  { title: "บันทึก", text: "จดความรู้สึกและค่าสุขภาพรายวัน ดูย้อนหลังได้" },
  { title: "ข้อมูลของฉัน", text: "โปรไฟล์ ส่งออกหรือลบข้อมูล และบัญชีสำหรับใช้หลายเครื่อง" },
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
            <h2 id="welcome-h">ยินดีต้อนรับสู่ใบพลู</h2>
            <div class="welcome-actions">
              <button type="button" class="primary" onClick={() => setGuest(true)}>ใช้แบบ guest</button>
              <p class="meta">ข้อมูลเก็บในเครื่องนี้เท่านั้น ไม่ต้องสมัคร</p>
              <button type="button" aria-expanded={login} onClick={() => setLogin((x) => !x)}>เข้าสู่ระบบ / สมัคร</button>
            </div>
            {login && <AccountCard cloud={cloud} defaultOpen />}
          </>
        ) : (
          <>
            <h2 id="welcome-h">{`วิธีใช้ (${step + 1}/${GUIDE_STEPS.length})`}</h2>
            <h3>{g.title}</h3>
            <p>{g.text}</p>
            {last && <p class="meta">ใบพลูไม่ใช่การวินิจฉัย การไม่พบคำเตือนไม่ได้แปลว่าใช้ได้อย่างเหมาะสม ถามเภสัชกรหรือแพทย์ก่อนใช้</p>}
            <div class="row-actions">
              {!last && <button type="button" onClick={finish}>ข้าม</button>}
              <button type="button" class="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? "เริ่มใช้งาน" : "ถัดไป"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
