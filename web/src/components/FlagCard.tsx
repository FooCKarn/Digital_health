import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { AskFlag } from "../chat/chatStore";
import { NEXT_STEP, RULE_PLAIN, TIER_PLAIN } from "../texts";
import { isKnownSeverity } from "../model/panel";
import type { Aggregate, Flag } from "../types";
import { SeverityBadge } from "./SeverityBadge";
import { t } from "../i18n";

// severity ที่ไม่รู้จักแสดงตามที่ engine ส่งมา ไม่แปลงเป็นระดับอื่น
function Sev({ severity, prefix = "" }: { severity: string; prefix?: string }) {
  if (isKnownSeverity(severity)) return <SeverityBadge kind={severity} prefix={prefix} />;
  return <span class="sev-text">{`${prefix}${t(`ระดับ ${severity}`, `Level ${severity}`)}`}</span>;
}

/** การ์ดคำเตือน: ข้อความทั้งหมดจากเซิร์ฟเวอร์แสดงเป็นข้อความล้วน */
export function FlagCard({ flag: f }: { flag: Flag }) {
  const ask = useContext(AskFlag);
  return (
    <li class="flag-card" data-sev={f.severity}>
      <Sev severity={f.severity} />
      <p class="msg">{f.message_th}</p>
      {NEXT_STEP[f.severity] && <p class="next-step">{NEXT_STEP[f.severity]}</p>}
      <p class="ev"><span class={f.verified ? "chip" : "chip draft"}>{f.verified ? t("ตรวจแล้ว", "Checked") : t("ยังรอผู้เชี่ยวชาญตรวจ (ใช้สาธิต)", "Awaiting expert review (demo only)")}</span></p>
      <details class="src">
        <summary>{t("ที่มาของคำเตือนนี้", "Where this warning comes from")}</summary>
        <p class="ev">
          <span class="chip">{TIER_PLAIN[f.evidence_tier] ? `${TIER_PLAIN[f.evidence_tier]} (${t("ชั้นหลักฐาน", "evidence tier")} ${f.evidence_tier})` : `${t("ชั้นหลักฐาน", "Evidence tier")} ${f.evidence_tier}`}</span>
          <span class="chip">{t(`หน้า ${f.source_page}${f.pdf_page ? ` (หน้า ${f.pdf_page} ในไฟล์ PDF)` : ""}`, `Page ${f.source_page}${f.pdf_page ? ` (page ${f.pdf_page} of the PDF)` : ""}`)}</span>
          <span class="chip">{RULE_PLAIN[f.rule_id] ? `${RULE_PLAIN[f.rule_id]} (${t("กฎ", "rule")} ${f.rule_id})` : `${t("กฎ", "Rule")} ${f.rule_id}`}</span>
        </p>
      </details>
      {f.evidence_quote && <Evidence quote={f.evidence_quote} page={f.source_page} pdfPage={f.pdf_page} doc={f.source_doc_th} />}
      {ask && (
        <button type="button" class="askflag noprint" aria-label={`${t("ถามเรื่องคำเตือนนี้", "Ask about this warning")}: ${ask.herbName(f.herb_id)}`} onClick={() => ask.ask(f)}>{t("ถามเรื่องคำเตือนนี้", "Ask about this warning")}</button>
      )}
    </li>
  );
}

/** "ดูหลักฐาน" (พับไว้): วลีสั้น + หน้าในหนังสือ ใช้ทั้งการ์ดคำเตือนและคำตอบแชต */
const defaultDoc = () => t("หนังสือแนวทางการใช้ยาสมุนไพรฯ (TTM first)", "Herbal medicine guidebook (TTM first)");

export function Evidence({ summary = t("ดูหลักฐาน", "See the evidence"), quote, page, pdfPage, doc = defaultDoc(), children }: {
  summary?: string; quote: string; page: number | string; pdfPage: number | null; doc?: string; children?: ComponentChildren;
}) {
  return (
    <details class="evd">
      <summary>{summary}</summary>
      <blockquote>{`“${quote}”`}</blockquote>
      <p class="meta">{t(`${doc} หน้า ${page}${pdfPage ? ` (หน้า ${pdfPage} ในไฟล์ PDF)` : ""} · วลีสั้นที่คัดมาใช้ตรวจเทียบ ข้อความเต็มและบริบทอยู่ในเล่ม`, `${doc}, page ${page}${pdfPage ? ` (page ${pdfPage} of the PDF)` : ""} · a short excerpt for cross-checking; the full text and context are in the book`)}</p>
      {children}
    </details>
  );
}

/** ภาระความเสี่ยงรวม (R3) */
export function AggCard({ agg: a }: { agg: Aggregate }) {
  return (
    <li class="flag-card" data-sev={a.severity}>
      <Sev severity={a.severity} prefix={`${t("ภาระความเสี่ยงรวม", "Combined risk load")} (${a.label_th}) · `} />
      <p class="msg">{a.message_th}</p>
    </li>
  );
}
