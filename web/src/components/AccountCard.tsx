import { useEffect, useState } from "preact/hooks";
import type { CloudSync } from "../model/cloud";
import { POLICY_VERSION, openPolicy } from "./Policy";

const STATUS_TEXT: Record<string, string> = {
  syncing: "กำลังซิงก์…", ready: "ซิงก์แล้ว", error: "ซิงก์ไม่สำเร็จ", conflict: "ข้อมูลในเครื่องกับในคลาวด์ไม่ตรงกัน",
};

/** บัญชี + ซิงก์ข้อมูลไปคลาวด์ (ไม่บังคับ): ข้อมูลอยู่ในเครื่องเป็นค่าเริ่มต้น ซิงก์เฉพาะเมื่อผู้ใช้สมัครและเข้าสู่ระบบ */
export function AccountCard({ cloud, defaultOpen = false }: { cloud: CloudSync; defaultOpen?: boolean }) {
  const [, setV] = useState(0);
  useEffect(() => cloud.subscribe(() => setV((v) => v + 1)), [cloud]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [handle, setHandle] = useState("");
  const [pw, setPw] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delPw, setDelPw] = useState("");

  if (cloud.status === "unavailable" || cloud.status === "unknown") return null; // เซิร์ฟเวอร์รุ่นนี้ไม่มีระบบบัญชี

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = mode === "register" ? await cloud.register(handle, pw, POLICY_VERSION) : await cloud.login(handle, pw);
    setBusy(false);
    if (ok) { setPw(""); setConsent(false); }
  };

  if (cloud.handle === null) {
    return (
      <details class="noprint card account-card account-opt" open={defaultOpen || undefined}>
        <summary>ใช้หลายเครื่อง? สมัครบัญชีเพื่อซิงก์ (ไม่บังคับ)</summary>
        <p class="meta">ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น สมัครบัญชีถ้าอยากใช้ข้อมูลเดียวกันหลายเครื่อง ข้อมูลรายการที่ใช้ บันทึกสุขภาพ และเวลาเตือนจะถูกเก็บในคลาวด์ของเรา</p>
        <div class="tabs-mini" role="group" aria-label="เลือกการทำรายการ">
          <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>มีบัญชีแล้ว</button>
          <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>สมัครบัญชี</button>
        </div>
        <form onSubmit={submit} noValidate class="acct-form">
          <label for="acct-handle">ชื่อผู้ใช้</label>
          <input id="acct-handle" type="text" autoComplete="username" maxLength={32} value={handle} onInput={(e) => setHandle(e.currentTarget.value)} aria-describedby="acct-hint" />
          {mode === "register" && <p id="acct-hint" class="meta">3-32 ตัว ใช้ a-z 0-9 และ _ . - ห้ามใช้ชื่อจริงหรือข้อมูลที่ระบุตัวตนได้</p>}
          <label for="acct-pw">รหัสผ่าน</label>
          <input id="acct-pw" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} maxLength={128} value={pw} onInput={(e) => setPw(e.currentTarget.value)} />
          {mode === "register" && (
            <>
              <p class="meta">รหัสผ่านอย่างน้อย 10 ตัว เราไม่เก็บอีเมลหรือเบอร์โทร จึง<strong>กู้รหัสผ่านที่ลืมให้ไม่ได้</strong></p>
              <label class="check-line">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
                <span>{`ฉันอ่านและยอมรับ `}<button type="button" class="link-btn" onClick={openPolicy}>นโยบายความเป็นส่วนตัว</button>{` (เวอร์ชัน ${POLICY_VERSION}) และเข้าใจว่าต้นแบบนี้ใช้ข้อมูลสมมติเท่านั้น`}</span>
              </label>
            </>
          )}
          <button type="submit" class="primary" aria-disabled={busy || (mode === "register" && !consent)} disabled={mode === "register" && !consent}>
            {mode === "register" ? "สมัครและซิงก์ข้อมูล" : "เข้าสู่ระบบ"}
          </button>
        </form>
        {cloud.message && <p class="err" role="alert">{cloud.message}</p>}
      </details>
    );
  }

  const del = async () => {
    const ok = await cloud.deleteAccount(delPw);
    if (ok) { setConfirmDel(false); setDelPw(""); }
  };
  return (
    <section class="noprint card account-card" aria-labelledby="acct-h">
      <h3 id="acct-h">บัญชีและซิงก์ข้อมูล</h3>
      <p>{`เข้าสู่ระบบเป็น `}<strong>{cloud.handle}</strong></p>
      <p role="status" class="meta">
        {STATUS_TEXT[cloud.status] ?? ""}{cloud.lastSynced ? ` · ล่าสุด ${cloud.lastSynced.replace("T", " ").replace("Z", " UTC")}` : ""}{cloud.message && cloud.status !== "conflict" ? ` · ${cloud.message}` : ""}
      </p>
      {cloud.status === "conflict" && (
        <div class="conflict" role="group" aria-label="เลือกข้อมูลที่จะใช้">
          <p class="warn">ข้อมูลในเครื่องนี้กับในคลาวด์ต่างกัน ระบบจะไม่รวมหรือทับให้เอง เลือกว่าจะใช้ฝั่งไหน (อีกฝั่งจะถูกแทนที่)</p>
          <div class="row-actions">
            <button type="button" onClick={() => void cloud.resolve("cloud")}>ใช้ข้อมูลในคลาวด์</button>
            <button type="button" onClick={() => void cloud.resolve("local")}>ใช้ข้อมูลในเครื่องนี้</button>
          </div>
        </div>
      )}
      <div class="row-actions">
        <button type="button" aria-disabled={cloud.status === "syncing" || cloud.status === "conflict"} onClick={() => void cloud.push(true)}>ซิงก์ตอนนี้</button>
        <button type="button" onClick={() => void cloud.logout()}>ออกจากระบบ</button>
        <button type="button" onClick={() => void cloud.clearCloudData()}>ลบเฉพาะข้อมูลในคลาวด์</button>
      </div>
      <div class="danger-zone">
        {!confirmDel ? <button type="button" onClick={() => setConfirmDel(true)}>ลบบัญชี</button> : (
          <div role="group" aria-label="ยืนยันการลบบัญชี">
            <p>ลบบัญชีและข้อมูลทุกอย่างของคุณในคลาวด์ ย้อนกลับไม่ได้ (ข้อมูลในเครื่องนี้ไม่ถูกลบ)</p>
            <label for="acct-del-pw">ใส่รหัสผ่านเพื่อยืนยัน</label>
            <input id="acct-del-pw" type="password" autoComplete="current-password" maxLength={128} value={delPw} onInput={(e) => setDelPw(e.currentTarget.value)} />
            <div class="row-actions">
              <button type="button" class="danger" onClick={() => void del()}>ยืนยันลบบัญชี</button>
              <button type="button" onClick={() => { setConfirmDel(false); setDelPw(""); }}>ยกเลิก</button>
            </div>
            {cloud.message && cloud.status !== "conflict" && <p class="err" role="alert">{cloud.message}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
