import { downloadJSON } from "../download";
import type { Analysis } from "../hooks/useAnalysis";
import { isKnownSeverity, unknownConditions } from "../model/panel";
import type { Profile } from "../model/tracker";
import { NOT_CHECKED, conditionLabels, noFlag, noFlagNote, pharmacist, quoteText } from "../texts";
import type { Flag, Meta } from "../types";
import { Disclaimer } from "./Disclaimer";
import { ScopeChip } from "./ScopeChip";
import { SEVERITY_TEXT, SeverityBadge } from "./SeverityBadge";
import { pick, t } from "../i18n";

const yn = (v: Profile["pregnant"]) => (v === null ? t("ไม่ระบุ", "Not specified") : v === "yes" ? t("ใช่", "Yes") : t("ไม่ใช่", "No"));
const sev = (s: string) => (isKnownSeverity(s) ? SEVERITY_TEXT[s] : t(`ระดับ ${s}`, `Level ${s}`));

function profileText(p: Profile, conditions: Record<string, string>) {
  return [
    `${t("อายุ", "Age")}: ${p.age === null ? t("ไม่ระบุ", "Not specified") : t(`${p.age} ปี`, `${p.age} years`)}`,
    `${t("ตั้งครรภ์", "Pregnant")}: ${yn(p.pregnant)}`,
    `${t("ให้นมบุตร", "Breastfeeding")}: ${yn(p.breastfeeding)}`,
    `${t("โรค/สภาวะ", "Conditions")}: ${p.conditions.map((c) => (Object.hasOwn(conditions, c) ? conditions[c] : c)).join(", ") || t("ไม่ระบุ", "Not specified")}`,
  ].join(" · ");
}

function FlagTable({ flags }: { flags: Flag[] }) {
  const head = [t("ความรุนแรง", "Severity"), t("ข้อความ", "Message"), t("ชั้นหลักฐาน", "Evidence tier"), t("หน้า", "Page"), t("สถานะข้อมูล", "Data status"), t("กฎ", "Rule"), t("วลีหลักฐาน (ไว้ตรวจเทียบ)", "Evidence quote (for cross-checking)")];
  return (
    <div class="tablewrap">
      <table>
        <caption class="sr-only">{t("คำเตือนทั้งหมดเรียงตามความรุนแรง", "All warnings, sorted by severity")}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.flag_id}>
              <td data-label={head[0]}>{isKnownSeverity(f.severity) ? <SeverityBadge kind={f.severity} /> : sev(f.severity)}</td>
              <td data-label={head[1]} class="msg-cell">{pick(f.message_th, f.message_en)}</td>
              <td data-label={head[2]}>{f.evidence_tier}</td>
              <td data-label={head[3]}>{`${f.source_page}${f.pdf_page ? ` (PDF ${f.pdf_page})` : ""}`}</td>
              <td data-label={head[4]}>{f.verified ? t("ตรวจแล้ว", "Checked") : t("ร่าง: ยังไม่ผ่านการตรวจ", "Draft: not yet checked")}</td>
              <td data-label={head[5]}>{f.rule_id}</td>
              <td data-label={head[6]}>{f.evidence_quote ? `“${quoteText(f.evidence_quote, f.evidence_quote_en)}”` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ใบสรุปจาก summary ของ /api/analyze แสดงเฉพาะเมื่อผลตรงกับข้อมูลปัจจุบัน */
export function PharmacistSummary({ analysis: a, meta, profile }: { analysis: Analysis; meta: Meta; profile: Profile }) {
  const s = a.current ? a.summary : null;
  const none = !!s && s.flags.length === 0 && s.aggregates.length === 0;
  const notChecked = s ? [...s.unknown_inputs, ...s.not_checked.map((c) => NOT_CHECKED[c] ?? c), ...unknownConditions(profile, Object.keys(meta.conditions))] : [];
  const herbs = s?.herbs.map((h) => `${pick(h.name_th, h.name_en) || h.id}${h.part ? ` (${h.part})` : ""}${h.days_in_use ? ` ${t(`${h.days_in_use} วัน`, `${h.days_in_use} d`)}` : ""}`) ?? [];

  return (
    <section class="pharm-summary card" aria-labelledby="pharm-h">
      <h2 id="pharm-h">{t("ใบสรุปสำหรับเภสัชกร", "Summary for the pharmacist")}</h2>
      <div class="scope">
        <ScopeChip coverage={a.current && a.result ? a.result.coverage : meta.coverage} herbsInBook={meta.coverage.herbs_in_book} />
        <Disclaimer text={s ? pick(s.disclaimer_th, s.disclaimer_en) : pick(meta.disclaimer_th, meta.disclaimer_en)} />
      </div>
      {!s ? (
        // ผลเก่า/ยังไม่มีผล: ไม่แสดงเนื้อหาเก่าเป็นปัจจุบัน
        <p class="status-line">
          {a.status === "idle" ? t("ยังไม่มีสมุนไพรให้ตรวจ ใบสรุปจะแสดงเมื่อมีผลตรวจ", "No herbs to check yet. The summary will show once there's a result.")
            : a.status === "loading" ? t("กำลังตรวจ… ใบสรุปจะแสดงเมื่อตรวจรายการล่าสุดเสร็จ", "Checking… the summary will show once the latest items are checked.")
            : t("ยังไม่มีผลตรวจของรายการล่าสุด ใบสรุปจึงยังไม่แสดง (ลองใหม่ในหน้า ช่วงนี้)", "There's no result for the latest items yet, so the summary is hidden. Try again in the This period tab.")}
        </p>
      ) : (
        <>
          <p>{`${t("สมุนไพร", "Herbs")}: ${herbs.join(", ") || "-"}`}</p>
          <p>{`${t("ยา (ตามที่กรอก)", "Medicines (as entered)")}: ${s.drugs_as_entered.join(", ") || t("ไม่มี", "None")}`}</p>
          <p>{`${t("ผู้ใช้", "User")}: ${profileText(profile, conditionLabels(meta))}`}</p>
          <p class="headline"><strong>{none ? noFlag() : pick(s.headline_th, s.headline_en)}</strong></p>
          {none && <p class="nonote">{noFlagNote()}</p>}
          {s.draft_notice_th && <p class="warn">{pick(s.draft_notice_th, s.draft_notice_en)}</p>}
          {s.pharmacist_review_required && <p class="warn">{pharmacist()}</p>}
          {s.flags.length > 0 && <><h3>{t("คำเตือนเรียงตามความรุนแรง", "Warnings, sorted by severity")}</h3><FlagTable flags={s.flags} /></>}
          {s.aggregates.length > 0 && (
            <>
              <h3>{t("ภาระความเสี่ยงรวม (สรุปโดยระบบ)", "Combined risk load (summarised by the system)")}</h3>
              <ul>{s.aggregates.map((x) => <li key={x.mechanism_tag}>{pick(x.message_th, x.message_en)}</li>)}</ul>
            </>
          )}
          <h3>{t("คำถามที่ควรถามต่อ (ร่าง ผู้เชี่ยวชาญต้องตรวจ)", "Follow-up questions (draft, needs expert review)")}</h3>
          <ul>{s.follow_up_questions_th.map((q, i) => <li key={i}>{pick(q, s.follow_up_questions_en?.[i])}</li>)}</ul>
          <p>{`${t("ยังไม่ได้ตรวจ", "Not checked")}: ${notChecked.join(", ") || "-"}`}</p>
          <p class="noprint row-actions">
            <button type="button" onClick={() => downloadJSON("pharmacist_summary.json", JSON.stringify(s, null, 2))}>{t("ดาวน์โหลดใบสรุปเป็นไฟล์", "Download the summary as a file")}</button>
            <button type="button" onClick={() => window.print()}>{t("พิมพ์ / บันทึกเป็น PDF", "Print / save as PDF")}</button>
          </p>
        </>
      )}
    </section>
  );
}
