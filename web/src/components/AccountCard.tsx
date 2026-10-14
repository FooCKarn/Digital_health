import { useEffect, useState } from "preact/hooks";
import type { CloudSync } from "../model/cloud";
import { POLICY_VERSION, openPolicy } from "./Policy";
import { getLang, t, tMap } from "../i18n";

const STATUS_TEXT: Record<string, string> = tMap(
  { syncing: "กำลังซิงก์…", ready: "ซิงก์แล้ว", error: "ซิงก์ไม่สำเร็จ", conflict: "ข้อมูลในเครื่องกับในคลาวด์ไม่ตรงกัน" },
  { syncing: "Syncing…", ready: "Synced", error: "Sync failed", conflict: "The data on this device and in the cloud do not match" },
);

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
    const registerBlocked = mode === "register" && !consent;
    const body = (
      <>
        <p class="meta">{t("ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น สมัครบัญชีถ้าอยากใช้ข้อมูลเดียวกันหลายเครื่อง ข้อมูลรายการที่ใช้ บันทึกสุขภาพ และเวลาเตือนจะถูกเก็บในคลาวด์ของเรา", "Your data is only on this device for now. Sign up to use the same data on several devices. Your items, health diary and reminder time will then be stored in our cloud.")}</p>
        <div class="tabs-mini" role="group" aria-label={t("เลือกการทำรายการ", "Choose an action")}>
          <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>{t("มีบัญชีแล้ว", "I have an account")}</button>
          <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>{t("สมัครบัญชี", "Sign up")}</button>
        </div>
        <form onSubmit={submit} noValidate class="acct-form">
          <label for="acct-handle">{t("ชื่อผู้ใช้", "Username")}</label>
          <input id="acct-handle" type="text" autoComplete="username" maxLength={32} value={handle} onInput={(e) => setHandle(e.currentTarget.value)} aria-describedby="acct-hint" />
          {mode === "register" && <p id="acct-hint" class="meta">{t("3-32 ตัว ใช้ a-z 0-9 และ _ . - ห้ามใช้ชื่อจริงหรือข้อมูลที่ระบุตัวตนได้", "3-32 characters using a-z 0-9 and _ . - Do not use your real name or anything that identifies you.")}</p>}
          <label for="acct-pw">{t("รหัสผ่าน", "Password")}</label>
          <input id="acct-pw" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} maxLength={128} value={pw} onInput={(e) => setPw(e.currentTarget.value)} />
          {mode === "register" && (
            <>
              <p class="meta">{getLang() === "en" ? <>Use at least 10 characters. We do not store an email or phone number, so we <strong>cannot recover a forgotten password</strong>.</> : <>รหัสผ่านอย่างน้อย 10 ตัว เราไม่เก็บอีเมลหรือเบอร์โทร จึง<strong>กู้รหัสผ่านที่ลืมให้ไม่ได้</strong></>}</p>
              <label class="check-line">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
                <span>{t("ฉันอ่านและยอมรับ ", "I have read and accept the ")}<button type="button" class="link-btn" onClick={openPolicy}>{t("นโยบายความเป็นส่วนตัว", "privacy policy")}</button>{t(` (เวอร์ชัน ${POLICY_VERSION}) และเข้าใจว่าต้นแบบนี้ใช้ข้อมูลสมมติเท่านั้น`, ` (version ${POLICY_VERSION}) and understand that this prototype is for made-up data only`)}</span>
              </label>
            </>
          )}
          <button type="submit" class="primary" aria-disabled={busy || registerBlocked} disabled={registerBlocked} aria-describedby={registerBlocked ? "acct-need-consent" : undefined}>
            {mode === "register" ? t("สมัครและซิงก์ข้อมูล", "Sign up and sync") : t("เข้าสู่ระบบ", "Log in")}
          </button>
          {registerBlocked && <p id="acct-need-consent" class="meta">{t("ติ๊กยอมรับนโยบายความเป็นส่วนตัวด้านบนก่อน จึงจะสมัครได้", "Tick the privacy policy box above before you can sign up")}</p>}
        </form>
        {cloud.message && <p class="err" role="alert">{cloud.message}</p>}
      </>
    );
    // defaultOpen = ฝังในหน้าต้อนรับ: ผู้ใช้เลือกเข้าสู่ระบบแล้ว จึงไม่ต้องมีการ์ดพับซ้อนในการ์ด
    return defaultOpen ? (
      <div class="noprint account-card account-embed">{body}</div>
    ) : (
      <details class="noprint card account-card account-opt">
        <summary>{t("ใช้หลายเครื่อง? สมัครบัญชีเพื่อซิงก์ (ไม่บังคับ)", "Using several devices? Sign up to sync (optional)")}</summary>
        {body}
      </details>
    );
  }

  const del = async () => {
    const ok = await cloud.deleteAccount(delPw);
    if (ok) { setConfirmDel(false); setDelPw(""); }
  };
  return (
    <section class="noprint card account-card" aria-labelledby="acct-h">
      <h3 id="acct-h">{t("บัญชีและซิงก์ข้อมูล", "Account and sync")}</h3>
      <p>{t("เข้าสู่ระบบเป็น ", "Logged in as ")}<strong>{cloud.handle}</strong></p>
      <p role="status" class="meta">
        {STATUS_TEXT[cloud.status] ?? ""}{cloud.lastSynced ? ` · ${t("ล่าสุด", "last synced")} ${cloud.lastSynced.replace("T", " ").replace("Z", " UTC")}` : ""}{cloud.message && cloud.status !== "conflict" ? ` · ${cloud.message}` : ""}
      </p>
      {cloud.status === "conflict" && (
        <div class="conflict" role="group" aria-label={t("เลือกข้อมูลที่จะใช้", "Choose which data to use")}>
          <p class="warn">{t("ข้อมูลในเครื่องนี้กับในคลาวด์ต่างกัน ระบบจะไม่รวมหรือทับให้เอง เลือกว่าจะใช้ฝั่งไหน (อีกฝั่งจะถูกแทนที่)", "The data on this device and in the cloud differ. We will not merge or overwrite anything for you. Choose which side to keep (the other side will be replaced).")}</p>
          <div class="row-actions">
            <button type="button" onClick={() => void cloud.resolve("cloud")}>{t("ใช้ข้อมูลในคลาวด์", "Use the cloud data")}</button>
            <button type="button" onClick={() => void cloud.resolve("local")}>{t("ใช้ข้อมูลในเครื่องนี้", "Use the data on this device")}</button>
          </div>
        </div>
      )}
      <div class="row-actions">
        <button type="button" aria-disabled={cloud.status === "syncing" || cloud.status === "conflict"} onClick={() => void cloud.push(true)}>{t("ซิงก์ตอนนี้", "Sync now")}</button>
        <button type="button" onClick={() => void cloud.logout()}>{t("ออกจากระบบ", "Log out")}</button>
        <button type="button" onClick={() => void cloud.clearCloudData()}>{t("ลบเฉพาะข้อมูลในคลาวด์", "Delete cloud data only")}</button>
      </div>
      <div class="danger-zone">
        {!confirmDel ? <button type="button" onClick={() => setConfirmDel(true)}>{t("ลบบัญชี", "Delete account")}</button> : (
          <div role="group" aria-label={t("ยืนยันการลบบัญชี", "Confirm account deletion")}>
            <p>{t("ลบบัญชีและข้อมูลทุกอย่างของคุณในคลาวด์ ย้อนกลับไม่ได้ (ข้อมูลในเครื่องนี้ไม่ถูกลบ)", "This deletes your account and all your data in the cloud. It cannot be undone (the data on this device is not deleted).")}</p>
            <label for="acct-del-pw">{t("ใส่รหัสผ่านเพื่อยืนยัน", "Enter your password to confirm")}</label>
            <input id="acct-del-pw" type="password" autoComplete="current-password" maxLength={128} value={delPw} onInput={(e) => setDelPw(e.currentTarget.value)} />
            <div class="row-actions">
              <button type="button" class="danger" onClick={() => void del()}>{t("ยืนยันลบบัญชี", "Confirm delete account")}</button>
              <button type="button" onClick={() => { setConfirmDel(false); setDelPw(""); }}>{t("ยกเลิก", "Cancel")}</button>
            </div>
            {cloud.message && cloud.status !== "conflict" && <p class="err" role="alert">{cloud.message}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
