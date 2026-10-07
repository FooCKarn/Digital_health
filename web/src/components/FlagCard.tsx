import { isKnownSeverity } from "../model/panel";
import type { Aggregate, Flag } from "../types";
import { SeverityBadge } from "./SeverityBadge";

// severity ที่ไม่รู้จักแสดงตามที่ engine ส่งมา ไม่แปลงเป็นระดับอื่น
function Sev({ severity, prefix = "" }: { severity: string; prefix?: string }) {
  if (isKnownSeverity(severity)) return <SeverityBadge kind={severity} prefix={prefix} />;
  return <span class="sev-text">{`${prefix}ระดับ ${severity}`}</span>;
}

/** การ์ดธง: ข้อความทั้งหมดจากเซิร์ฟเวอร์แสดงเป็นข้อความล้วน */
export function FlagCard({ flag: f }: { flag: Flag }) {
  return (
    <li class="flag-card" data-sev={f.severity}>
      <Sev severity={f.severity} />
      <p class="msg">{f.message_th}</p>
      <p class="ev">
        <span class="chip">{`ชั้นหลักฐาน ${f.evidence_tier}`}</span>
        <span class="chip">{`หน้า ${f.source_page}${f.pdf_page ? ` (หน้า ${f.pdf_page} ในไฟล์ PDF)` : ""}`}</span>
        <span class={f.verified ? "chip" : "chip draft"}>{f.verified ? "ตรวจแล้ว" : "ร่าง: ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ"}</span>
        <span class="chip">{`กฎ ${f.rule_id}`}</span>
      </p>
      {f.evidence_quote && (
        <details class="evd">
          <summary>ดูหลักฐาน</summary>
          <blockquote>{`“${f.evidence_quote}”`}</blockquote>
          <p class="meta">{`หนังสือแนวทางการใช้ยาสมุนไพรฯ (TTM first) หน้า ${f.source_page}${f.pdf_page ? ` (หน้า ${f.pdf_page} ในไฟล์ PDF)` : ""} · วลีสั้นที่คัดมาใช้ตรวจเทียบ ข้อความเต็มและบริบทอยู่ในเล่ม`}</p>
        </details>
      )}
    </li>
  );
}

/** ภาระความเสี่ยงรวม (R3) */
export function AggCard({ agg: a }: { agg: Aggregate }) {
  return (
    <li class="flag-card" data-sev={a.severity}>
      <Sev severity={a.severity} prefix={`ภาระความเสี่ยงรวม (${a.label_th}) · `} />
      <p class="msg">{a.message_th}</p>
    </li>
  );
}
