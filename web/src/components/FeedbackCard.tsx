import { useRef, useState } from "preact/hooks";
import { ApiError, sendFeedback } from "../api";
import { downloadJSON } from "../download";
import { useBusy } from "../hooks/useBusy";
import { newId } from "../model/tracker";
import type { FeedbackPayload, Flag } from "../types";

// สุ่มใหม่ทุกครั้งที่โหลดหน้า ไม่ผูกกับตัวตน
const SID = newId();
type Role = FeedbackPayload["reviewer_role"];
type Answer = "" | "true" | "false" | "unsure";

/**
 * ข้อเสนอแนะการทดลอง (data-schema ข้อ 7) ส่งเฉพาะ session_id บทบาท ชื่อเคสสมมติ ความเห็น เวลา และความเห็นต่อ flag_id
 * ห้ามแนบรายการสมุนไพร/ยา/โปรไฟล์ของผู้ใช้
 */
export function FeedbackCard({ flags, herbName }: { flags: Flag[]; herbName: (id: string) => string }) {
  const t0 = useRef(Date.now());
  const [role, setRole] = useState<Role>("citizen");
  const [caseId, setCaseId] = useState("");
  const [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [msg, setMsg] = useState("");
  const { busy, run } = useBusy();

  const collect = (): Required<FeedbackPayload> => ({
    session_id: SID,
    case_id: caseId.trim(),
    reviewer_role: role,
    comment,
    time_spent_sec: Math.min(86400, Math.round((Date.now() - t0.current) / 1000)),
    entries: flags.filter((f) => answers[f.flag_id]).map((f) => {
      const v = answers[f.flag_id];
      return { flag_id: f.flag_id, agree: v === "unsure" ? "unsure" : v === "true" };
    }),
  });

  const send = () => run(async () => {
    setMsg("");
    try {
      await sendFeedback(collect());
      setMsg("ขอบคุณ ส่งแล้ว");
    } catch (e) {
      setMsg(`ส่งไม่สำเร็จ: ${e instanceof ApiError ? e.thaiMessage : new ApiError("network").thaiMessage} · ดาวน์โหลดไฟล์แล้วส่งให้ทีมแทนได้`);
    }
  });

  return (
    <div class="feedback">
      <h3>ช่วยเราปรับปรุง (ทดลองใช้)</h3>
      <p class="meta">ใช้เคสสมมติเท่านั้น ข้อมูลที่ส่งไม่ผูกกับตัวตนของคุณ และไม่แนบรายการหรือข้อมูลสุขภาพของคุณ</p>
      <div class="field">
        <label for="fb-role">คุณคือ</label>
        <select id="fb-role" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
          <option value="citizen">ประชาชน</option>
          <option value="pharmacist">เภสัชกร</option>
          <option value="other">อื่น ๆ</option>
        </select>
      </div>
      <div class="field">
        <label for="fb-case">ชื่อเคสสมมติ (ถ้ามี)</label>
        <input id="fb-case" type="text" maxLength={50} value={caseId} onInput={(e) => setCaseId(e.currentTarget.value)} />
      </div>
      {flags.map((f, i) => (
        <div class="field" key={f.flag_id}>
          <label for={`fb-f${i}`}>{`ความเห็นต่อธงที่ ${i + 1} (${herbName(f.herb_id)}): ${f.message_th.slice(0, 50)}…`}</label>
          <select id={`fb-f${i}`} value={answers[f.flag_id] ?? ""} onChange={(e) => { const v = e.currentTarget.value as Answer; setAnswers((a) => ({ ...a, [f.flag_id]: v })); }}>
            <option value="">— ยังไม่ตอบ —</option>
            <option value="true">เห็นด้วย</option>
            <option value="false">ไม่เห็นด้วย</option>
            <option value="unsure">ไม่แน่ใจ</option>
          </select>
        </div>
      ))}
      <div class="field">
        <label for="fb-comment">ความเห็น</label>
        <textarea id="fb-comment" maxLength={500} rows={2} placeholder="ห้ามใส่ข้อมูลส่วนตัวหรือข้อมูลผู้ป่วยจริง" value={comment}
          onInput={(e) => setComment(e.currentTarget.value)} />
      </div>
      <p class="row-actions">
        <button type="button" aria-disabled={busy} onClick={send}>ส่งความเห็น</button>
        <button type="button" onClick={() => downloadJSON("feedback.json", JSON.stringify(collect(), null, 2))}>ดาวน์โหลดคำตอบ (JSON)</button>
      </p>
      <p class="meta" role="status">{msg}</p>
    </div>
  );
}
