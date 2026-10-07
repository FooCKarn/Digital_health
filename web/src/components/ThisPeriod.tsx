import { useAnalysis } from "../hooks/useAnalysis";
import { groupFlags, isKnownSeverity, notCheckedLabels, unknownConditions, type PanelGroups } from "../model/panel";
import type { TrackerStore } from "../model/tracker";
import type { Aggregate, Meta } from "../types";
import { ActiveList } from "./ActiveList";
import { Disclaimer } from "./Disclaimer";
import { AggCard, FlagCard } from "./FlagCard";
import { ScopeChip } from "./ScopeChip";
import { GROUP_TITLE, SummaryStrip } from "./SummaryStrip";

// ข้อความตายตัว (กฎข้อ 5: ห้ามสื่อว่าไม่มีความเสี่ยง)
const NO_FLAG = "ไม่พบธงเตือนในฐานข้อมูลนี้";
const NO_FLAG_NOTE = "นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร";
const NO_HERBS = "ยังไม่มีสมุนไพรให้ตรวจ";
const STALE = "ผลก่อนแก้ไข (ยังไม่ได้ตรวจรายการล่าสุด)";
const NOT_CHECKED: Record<string, string> = { pregnancy: "การตั้งครรภ์", breastfeeding: "การให้นมบุตร", age: "อายุ" };
const PHARMACIST = "แนะนำให้ปรึกษาเภสัชกรก่อนใช้ (มียากลุ่มที่ทีมกำหนดให้เภสัชกรทบทวน) · ดูแท็บใบสรุปเภสัชกร";

const aggBucket = (a: Aggregate): keyof PanelGroups => (isKnownSeverity(a.severity) ? a.severity : "other");

export function ThisPeriod({ store, meta, today }: { store: TrackerStore; meta: Meta; today: string }) {
  const known = Object.keys(meta.conditions);
  const a = useAnalysis(store, today, known);
  const { result: r, summary: s } = a;
  const none = !!r && r.flags.length === 0 && r.aggregates.length === 0;
  const groups = r ? groupFlags(r) : null;
  const badConds = unknownConditions(store.state.profile, known);
  const announce = a.status === "idle" ? NO_HERBS : a.current && s ? (none ? NO_FLAG : s.headline_th) : "";

  return (
    <section class="this-period">
      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>
      {/* ขอบเขต + ไม่ใช่การวินิจฉัย อยู่เหนือธงแรกเสมอ */}
      <div class="scope">
        <ScopeChip coverage={r?.coverage ?? meta.coverage} herbsInBook={meta.coverage.herbs_in_book} />
        <Disclaimer text={meta.disclaimer_th} />
      </div>

      {a.status === "idle" && <p class="status-line">{NO_HERBS}</p>}
      {!r && a.status === "loading" && <p class="status-line">กำลังตรวจ…</p>}
      {a.error && (
        <div class="err" role="alert">
          <span>{a.stale ? `ผลนี้เก่า ตรวจไม่สำเร็จ: ${a.error}` : a.error}</span>{" "}
          <button type="button" onClick={a.retry}>ลองใหม่</button>
        </div>
      )}

      {r && s && groups && (
        <section class="result" aria-busy={a.status === "loading"}>
          {/* ผลที่ไม่ตรงกับข้อมูลปัจจุบันห้ามใช้หัวข้อ "ไม่พบธง" หรือหัวข้อผล */}
          {a.current ? <h2>{none ? NO_FLAG : s.headline_th}</h2> : <h2 class="stale-line">{STALE}</h2>}
          {!a.current && a.status === "loading" && <p class="status-line">กำลังตรวจ…</p>}
          {a.current && none && <p class="nonote">{NO_FLAG_NOTE}</p>}
          {groups.avoid.length > 0 && (
            <div class="banner-avoid">{`มีรายการที่${GROUP_TITLE.avoid} ${groups.avoid.length} รายการ โปรดอ่านก่อนใช้และปรึกษาเภสัชกร`}</div>
          )}
          {s.draft_notice_th && <p class="warn">{s.draft_notice_th}</p>}
          {r.pharmacist_review_required && <p class="warn">{PHARMACIST}</p>}
          {!none && <SummaryStrip groups={groups} />}
          {(Object.keys(GROUP_TITLE) as (keyof PanelGroups)[]).map((k) => {
            const aggs = r.aggregates.filter((x) => aggBucket(x) === k);
            if (!groups[k].length && !aggs.length) return null;
            return (
              <details key={k} id={`group-${k}`} data-group={k} open={k === "avoid"}>
                <summary>{`${GROUP_TITLE[k]} (${groups[k].length})`}</summary>
                <ul class="flags">
                  {aggs.map((x) => <AggCard key={x.mechanism_tag} agg={x} />)}
                  {groups[k].map((f) => <FlagCard key={f.flag_id} flag={f} />)}
                </ul>
              </details>
            );
          })}
          {r.coverage.unknown_inputs.length > 0 && (
            <p class="warn">{`ยังไม่ได้ตรวจ (ไม่มีในฐานข้อมูล): ${r.coverage.unknown_inputs.join(", ")} · ระบบไม่เดา โปรดปรึกษาเภสัชกร`}</p>
          )}
          {r.coverage.not_checked.length > 0 && (
            <p class="warn">{`ไม่ได้ตรวจเงื่อนไข (ไม่ได้กรอก): ${notCheckedLabels(r, NOT_CHECKED).join(", ")}`}</p>
          )}
          {badConds.length > 0 && <p class="warn">{`ไม่ได้ตรวจเงื่อนไข (ระบบไม่รู้จัก): ${badConds.join(", ")}`}</p>}
        </section>
      )}

      <ActiveList store={store} today={today} analysis={a} />
    </section>
  );
}
