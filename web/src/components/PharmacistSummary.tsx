import { downloadJSON } from "../download";
import type { Analysis } from "../hooks/useAnalysis";
import { isKnownSeverity, unknownConditions } from "../model/panel";
import type { Profile } from "../model/tracker";
import { NO_FLAG, NO_FLAG_NOTE, NOT_CHECKED, PHARMACIST } from "../texts";
import type { Flag, Meta } from "../types";
import { Disclaimer } from "./Disclaimer";
import { ScopeChip } from "./ScopeChip";
import { SEVERITY_TEXT } from "./SeverityBadge";

const yn = (v: Profile["pregnant"]) => (v === null ? "ไม่ระบุ" : v === "yes" ? "ใช่" : "ไม่ใช่");
const sev = (s: string) => (isKnownSeverity(s) ? SEVERITY_TEXT[s] : `ระดับ ${s}`);

function profileText(p: Profile, conditions: Record<string, string>) {
  return [
    `อายุ: ${p.age === null ? "ไม่ระบุ" : `${p.age} ปี`}`,
    `ตั้งครรภ์: ${yn(p.pregnant)}`,
    `ให้นมบุตร: ${yn(p.breastfeeding)}`,
    `โรค/สภาวะ: ${p.conditions.map((c) => (Object.hasOwn(conditions, c) ? conditions[c] : c)).join(", ") || "ไม่ระบุ"}`,
  ].join(" · ");
}

function FlagTable({ flags }: { flags: Flag[] }) {
  const head = ["ความรุนแรง", "ข้อความ", "ชั้นหลักฐาน", "หน้า", "สถานะข้อมูล", "กฎ", "วลีหลักฐาน (ไว้ตรวจเทียบ)"];
  return (
    <div class="tablewrap">
      <table>
        <caption class="sr-only">ธงเตือนทั้งหมดเรียงตามความรุนแรง</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.flag_id}>
              <td>{sev(f.severity)}</td>
              <td>{f.message_th}</td>
              <td>{f.evidence_tier}</td>
              <td>{`${f.source_page}${f.pdf_page ? ` (PDF ${f.pdf_page})` : ""}`}</td>
              <td>{f.verified ? "ตรวจแล้ว" : "ร่าง: ยังไม่ผ่านการตรวจ"}</td>
              <td>{f.rule_id}</td>
              <td>{f.evidence_quote ? `“${f.evidence_quote}”` : "-"}</td>
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
  const herbs = s?.herbs.map((h) => `${h.name_th || h.id}${h.part ? ` (${h.part})` : ""}${h.days_in_use ? ` ${h.days_in_use} วัน` : ""}`) ?? [];

  return (
    <section class="pharm-summary" aria-labelledby="pharm-h">
      <h2 id="pharm-h">ใบสรุปสำหรับเภสัชกร</h2>
      <div class="scope">
        <ScopeChip coverage={a.current && a.result ? a.result.coverage : meta.coverage} herbsInBook={meta.coverage.herbs_in_book} />
        <Disclaimer text={s?.disclaimer_th ?? meta.disclaimer_th} />
      </div>
      {!s ? (
        // ผลเก่า/ยังไม่มีผล: ไม่แสดงเนื้อหาเก่าเป็นปัจจุบัน
        <p class="status-line">
          {a.status === "idle" ? "ยังไม่มีสมุนไพรให้ตรวจ ใบสรุปจะแสดงเมื่อมีผลตรวจ"
            : a.status === "loading" ? "กำลังตรวจ… ใบสรุปจะแสดงเมื่อตรวจรายการล่าสุดเสร็จ"
            : "ยังไม่มีผลตรวจของรายการล่าสุด ใบสรุปจึงยังไม่แสดง (ลองใหม่ในหน้า ช่วงนี้)"}
        </p>
      ) : (
        <>
          <p>{`สมุนไพร: ${herbs.join(", ") || "-"}`}</p>
          <p>{`ยา (ตามที่กรอก): ${s.drugs_as_entered.join(", ") || "ไม่มี"}`}</p>
          <p>{`ผู้ใช้: ${profileText(profile, meta.conditions)}`}</p>
          <p class="headline"><strong>{none ? NO_FLAG : s.headline_th}</strong></p>
          {none && <p class="nonote">{NO_FLAG_NOTE}</p>}
          {s.draft_notice_th && <p class="warn">{s.draft_notice_th}</p>}
          {s.pharmacist_review_required && <p class="warn">{PHARMACIST}</p>}
          {s.flags.length > 0 && <><h3>ธงเรียงตามความรุนแรง</h3><FlagTable flags={s.flags} /></>}
          {s.aggregates.length > 0 && (
            <>
              <h3>ภาระความเสี่ยงรวม (สรุปโดยระบบ)</h3>
              <ul>{s.aggregates.map((x) => <li key={x.mechanism_tag}>{x.message_th}</li>)}</ul>
            </>
          )}
          <h3>คำถามที่ควรถามต่อ (ร่าง ผู้เชี่ยวชาญต้องตรวจ)</h3>
          <ul>{s.follow_up_questions_th.map((q, i) => <li key={i}>{q}</li>)}</ul>
          <p>{`ยังไม่ได้ตรวจ: ${notChecked.join(", ") || "-"}`}</p>
          <p class="noprint row-actions">
            <button type="button" onClick={() => downloadJSON("pharmacist_summary.json", JSON.stringify(s, null, 2))}>ดาวน์โหลดใบสรุป (JSON)</button>
            <button type="button" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
          </p>
        </>
      )}
    </section>
  );
}
