import { useRef, useState } from "preact/hooks";
import { ApiError, sendFeedback } from "../api";
import { downloadJSON } from "../download";
import { useBusy } from "../hooks/useBusy";
import { newId } from "../model/tracker";
import type { FeedbackPayload, Flag } from "../types";
import { t } from "../i18n";

// สุ่มใหม่ทุกครั้งที่โหลดหน้า ไม่ผูกกับตัวตน
const SID = newId();
const T0 = Date.now(); // เวลาเริ่มต่อการโหลดหน้า (สลับแท็บไม่เริ่มนับใหม่)
type Role = FeedbackPayload["reviewer_role"];
type Answer = "" | "true" | "false" | "unsure";

/**
 * ข้อเสนอแนะการทดลอง (data-schema ข้อ 7) ส่งเฉพาะ session_id บทบาท ชื่อเคสสมมติ ความเห็น เวลา และความเห็นต่อ flag_id
 * ห้ามแนบรายการสมุนไพร/ยา/โปรไฟล์ของผู้ใช้
 */
export function FeedbackCard({ flags: incoming, current, herbName }: { flags: Flag[]; current: boolean; herbName: (id: string) => string }) {
  const [role, setRole] = useState<Role>("citizen");
  const [caseId, setCaseId] = useState("");
  const [comment, setComment] = useState("");
  // คำเตือนของผลปัจจุบันล่าสุดที่เห็น: ช่วงตรวจใหม่ (ไม่ใช่ปัจจุบัน) ไม่เปลี่ยน/ไม่ล้างอะไร
  const seen = useRef({ sig: "[]", flags: [] as Flag[] });
  const sig = JSON.stringify(incoming.map((f) => [f.flag_id, f.rule_id, f.herb_id, f.message_th]));
  if (current && sig !== seen.current.sig) seen.current = { sig, flags: incoming };
  const flags = seen.current.flags;
  // คำตอบผูกกับชุดคำเตือน: ชุดคำเตือนเปลี่ยน = คำตอบเก่าใช้ไม่ได้ (flag_id เดิมอาจเป็นคำเตือนอื่น)
  const [ans, setAns] = useState({ sig: "", map: {} as Record<string, Answer> });
  const answers = ans.sig === seen.current.sig ? ans.map : {};
  const setAnswer = (id: string, v: Answer) => setAns({ sig: seen.current.sig, map: { ...answers, [id]: v } });
  const [msg, setMsg] = useState("");
  const { busy, run } = useBusy();

  const collect = (): Required<FeedbackPayload> => ({
    session_id: SID,
    case_id: caseId.trim(),
    reviewer_role: role,
    comment,
    time_spent_sec: Math.min(86400, Math.round((Date.now() - T0) / 1000)),
    entries: flags.filter((f) => answers[f.flag_id]).map((f) => {
      const v = answers[f.flag_id];
      return { flag_id: f.flag_id, agree: v === "unsure" ? "unsure" : v === "true" };
    }),
  });

  const send = () => run(async () => {
    setMsg("");
    try {
      await sendFeedback(collect());
      setMsg(t("ขอบคุณ ส่งแล้ว", "Thank you, sent"));
    } catch (e) {
      setMsg(`${t("ส่งไม่สำเร็จ", "Could not send")}: ${e instanceof ApiError ? e.thaiMessage : new ApiError("network").thaiMessage} · ${t("ดาวน์โหลดไฟล์แล้วส่งให้ทีมแทนได้", "You can download the file and send it to the team instead")}`);
    }
  });

  return (
    <div class="feedback">
      <h3>{t("ช่วยเราปรับปรุง (ทดลองใช้)", "Help us improve (trial)")}</h3>
      <p class="meta">{t("ใช้เคสสมมติเท่านั้น ข้อมูลที่ส่งไม่ผูกกับตัวตนของคุณ และไม่แนบรายการหรือข้อมูลสุขภาพของคุณ", "Use made-up cases only. What you send is not linked to your identity and does not include your items or health data.")}</p>
      <div class="field">
        <label for="fb-role">{t("คุณคือ", "You are")}</label>
        <select id="fb-role" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
          <option value="citizen">{t("ประชาชน", "A member of the public")}</option>
          <option value="pharmacist">{t("เภสัชกร", "A pharmacist")}</option>
          <option value="other">{t("อื่น ๆ", "Other")}</option>
        </select>
      </div>
      <div class="field">
        <label for="fb-case">{t("ชื่อเคสสมมติ (ถ้ามี)", "Made-up case name (if any)")}</label>
        <input id="fb-case" type="text" maxLength={50} value={caseId} onInput={(e) => setCaseId(e.currentTarget.value)} />
      </div>
      {flags.map((f, i) => (
        <div class="field" key={f.flag_id}>
          <label for={`fb-f${i}`}>{t(`ความเห็นต่อคำเตือนที่ ${i + 1} (${herbName(f.herb_id)}): ${f.message_th.slice(0, 50)}…`, `Your view on warning ${i + 1} (${herbName(f.herb_id)}): ${f.message_th.slice(0, 50)}…`)}</label>
          <select id={`fb-f${i}`} value={answers[f.flag_id] ?? ""} onChange={(e) => { const v = e.currentTarget.value as Answer; setAnswer(f.flag_id, v); }}>
            <option value="">{t("ยังไม่ตอบ", "Not answered")}</option>
            <option value="true">{t("เห็นด้วย", "Agree")}</option>
            <option value="false">{t("ไม่เห็นด้วย", "Disagree")}</option>
            <option value="unsure">{t("ไม่แน่ใจ", "Not sure")}</option>
          </select>
        </div>
      ))}
      <div class="field">
        <label for="fb-comment">{t("ความเห็น", "Comments")}</label>
        <textarea id="fb-comment" maxLength={500} rows={2} placeholder={t("ห้ามใส่ข้อมูลส่วนตัวหรือข้อมูลผู้ป่วยจริง", "Do not enter personal information or real patient data")} value={comment}
          onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      <p class="row-actions">
        <button type="button" aria-disabled={busy} onClick={send}>{t("ส่งความเห็น", "Send feedback")}</button>
        <button type="button" onClick={() => downloadJSON("feedback.json", JSON.stringify(collect(), null, 2))}>{t("ดาวน์โหลดคำตอบเป็นไฟล์", "Download your answers as a file")}</button>
      </p>
      <p class="meta" role="status">{msg}</p>
    </div>
  );
}
