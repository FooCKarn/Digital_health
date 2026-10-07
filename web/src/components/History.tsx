import { useStore } from "../hooks/useStore";
import type { TrackerStore } from "../model/tracker";

// วันที่แบบไทย คำนวณจากสตริง YYYY-MM-DD ด้วย UTC (ไม่ผูกเขตเวลา)
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** รายการที่หยุดใช้แล้ว: แสดงอย่างเดียว ไม่ตรวจย้อนหลัง */
export function History({ store }: { store: TrackerStore }) {
  useStore(store);
  const items = [...store.history()].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""));
  return (
    <section class="history" aria-labelledby="history-h">
      <h2 id="history-h">ที่เคยใช้</h2>
      <p class="meta">รายการที่หยุดใช้แล้วไม่ถูกนำไปตรวจ ผลในหน้า ช่วงนี้ คิดจากรายการที่กำลังใช้อยู่เท่านั้น</p>
      {items.length === 0 ? <p>ยังไม่มีรายการที่หยุดใช้</p> : (
        <ul class="plain-list">
          {items.map((i) => (
            <li key={i.id} class="active-row">
              <div>
                <strong>{i.label}</strong>
                <div class="meta">
                  {`${i.kind === "herb" ? "สมุนไพร" : "ยา"} · ใช้ `}
                  <time dateTime={i.start_date}>{fmt(i.start_date)}</time>
                  {" ถึง "}
                  <time dateTime={i.end_date!}>{fmt(i.end_date!)}</time>
                </div>
              </div>
              <div class="row-actions">
                <button type="button" aria-label={`ลบ ${i.label}`} onClick={() => confirm(`ลบ ${i.label} ออกถาวร?`) && store.removeItem(i.id)}>ลบ</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
