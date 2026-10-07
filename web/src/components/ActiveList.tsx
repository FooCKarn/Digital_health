import type { Analysis } from "../hooks/useAnalysis";
import { dayNumber } from "../model/dates";
import { itemStatus, unsentRefs } from "../model/panel";
import type { TrackerItem, TrackerStore } from "../model/tracker";
import type { Severity } from "../types";
import { SeverityBadge } from "./SeverityBadge";

const ORDER: Severity[] = ["avoid", "caution", "info"];

/** สถานะของแถว: อ่านจากผลตรวจเท่านั้น ไม่ตัดสินเอง */
function Status({ item, a, unsent }: { item: TrackerItem; a: Analysis; unsent: Set<string> }) {
  const { result: r, summary: s } = a;
  const covered = !!r && !!s && !unsent.has(`${item.kind}:${item.ref}`) &&
    (item.kind === "herb" ? s.herbs.some((h) => h.id === item.ref) : s.drugs_as_entered.includes(item.ref.trim()));
  if (!covered) return a.status === "loading" && !unsent.has(`${item.kind}:${item.ref}`) ? <span class="pending">กำลังตรวจ…</span> : <SeverityBadge kind="no_data" />;
  const st = itemStatus(item, r, unsent);
  if (st === "no_data") return <SeverityBadge kind="no_data" />;
  // ผลตรวจไม่บอกว่ายาแต่ละตัวมีธงไหม จึงห้ามแสดงว่า "ยานี้ไม่พบธง"
  if (item.kind === "drug") return <span class="see-panel">ดูธงในแผงด้านบน</span>;
  if (st === "no_flag") return <SeverityBadge kind="no_flag" />;
  const sev = ORDER.find((k) => r.flags.some((f) => f.herb_id === item.ref && f.severity === k));
  return sev ? <SeverityBadge kind={sev} /> : <span class="see-panel">ดูธงในแผงด้านบน</span>;
}

export function ActiveList({ store, today, analysis }: { store: TrackerStore; today: string; analysis: Analysis }) {
  const items = store.active();
  const unsent = unsentRefs(items);
  return (
    <section class="active-list" aria-labelledby="active-h">
      <h2 id="active-h">กำลังใช้อยู่</h2>
      {items.length === 0 ? <p>ยังไม่มีรายการ</p> : (
        <ul>
          {items.map((i) => (
            <li key={i.id} aria-label={i.label} class="active-row">
              <div>
                <strong>{i.label}</strong>
                <div class="meta">{`${i.kind === "herb" ? "สมุนไพร" : "ยา"} · วันที่ ${dayNumber(i.start_date, today)}`}</div>
              </div>
              <Status item={i} a={analysis} unsent={unsent} />
              <div class="row-actions">
                <button type="button" aria-label={`หยุดใช้ ${i.label}`} onClick={() => store.stopItem(i.id)}>หยุดใช้</button>
                <button type="button" aria-label={`ลบ ${i.label}`} onClick={() => confirm(`ลบ ${i.label} ออกถาวร (รวมประวัติ)?`) && store.removeItem(i.id)}>ลบ</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
