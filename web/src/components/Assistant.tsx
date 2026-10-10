import type { ComponentChildren } from "preact";
import type { Analysis } from "../hooks/useAnalysis";
import { useDiary } from "../hooks/useDiary";
import { buildBrief } from "../model/brief";
import { thaiDate } from "../model/dates";
import { notCheckedLabels } from "../model/panel";
import type { DiaryStore } from "../model/diary";
import type { TrackerStore } from "../model/tracker";
import { NOT_CHECKED, NO_FLAG, NO_FLAG_NOTE } from "../texts";
import type { Meta } from "../types";
import { ScopeChip } from "./ScopeChip";

export type GoTo = "now" | "diary" | "mine";

/**
 * หน้าผู้ช่วย: สรุปประจำวันที่คำนวณจากข้อมูลในเครื่อง (ไม่ใช้ AI ตัดสินหรือเขียน) + ทางลัด
 * ส่วนแชต AI อยู่ใต้หน้านี้ (ตอบจากฐานข้อมูลของเครื่องมือเท่านั้น ตามกติกาเดิม)
 */
export function Assistant({ store, diary, meta, today, analysis: a, go, ask, children }: {
  store: TrackerStore; diary: DiaryStore; meta: Meta; today: string; analysis: Analysis; go: (to: GoTo) => void; ask: (q: string) => void; children?: ComponentChildren;
}) {
  useDiary(diary);
  const items = store.active();
  const r = a.result;
  const b = buildBrief({
    items, isTaken: (id) => diary.isTaken(id, today), hasEntryToday: !!diary.entryOn(today), today,
    result: r, resultCurrent: a.current, notCheckedLabels: r ? notCheckedLabels(r, NOT_CHECKED) : [],
  });
  const none = b.warnings !== null && b.warnings.total === 0 && !!r && r.aggregates.length === 0;

  return (
    <section class="assistant" aria-labelledby="brief-h">
      <div class="card brief">
        <h2 id="brief-h">สรุปวันนี้</h2>
        <p class="meta">{thaiDate(today)}</p>
        {b.itemCount === 0 ? (
          <p>ยังไม่มีรายการที่ใช้อยู่ เพิ่มสมุนไพรหรือยาที่หน้า ช่วงนี้ แล้วผู้ช่วยจะสรุปให้ทุกวัน</p>
        ) : (
          <ul class="brief-list">
            <li>
              <strong>การใช้วันนี้</strong>
              <span>{b.untaken.length === 0 ? `กดว่าใช้แล้วครบทั้ง ${b.itemCount} รายการ` : `ใช้แล้ว ${b.takenCount} จาก ${b.itemCount} รายการ`}</span>
              {b.untaken.length > 0 && (
                <span class="brief-actions">
                  {b.untaken.map((x) => (
                    <button type="button" key={x.id} aria-label={`บันทึกว่าใช้ ${x.label} วันนี้`} onClick={() => diary.toggleTaken(x.id, today)}>{`บันทึกว่าใช้ ${x.label}`}</button>
                  ))}
                </span>
              )}
            </li>
            <li>
              <strong>ผลตรวจ</strong>
              {b.warnings === null ? <span>กำลังตรวจ หรือยังไม่มีผลล่าสุด</span>
                : none ? <span>{`${NO_FLAG} · ${NO_FLAG_NOTE}`}</span>
                : <span>{`พบคำเตือน ${b.warnings.total} รายการ${b.warnings.avoid > 0 ? ` (ควรหลีกเลี่ยง ${b.warnings.avoid})` : ""}`}</span>}
              <span class="brief-actions">
                <button type="button" onClick={() => go("now")}>ดูผลตรวจ</button>
                {b.warnings !== null && b.warnings.total > 0 && <button type="button" onClick={() => ask("ทำไมถึงขึ้นคำเตือน")}>ถามผู้ช่วยเรื่องคำเตือน</button>}
              </span>
            </li>
            {b.notChecked.length > 0 && (
              <li>
                <strong>ยังไม่ได้ตรวจเงื่อนไข</strong>
                <span>{`${b.notChecked.join(", ")} (ยังไม่ได้กรอก)`}</span>
                <span class="brief-actions"><button type="button" onClick={() => go("mine")}>ไปกรอกข้อมูลสุขภาพ</button></span>
              </li>
            )}
            <li>
              <strong>บันทึกสุขภาพ</strong>
              <span>{b.noEntryToday ? "วันนี้ยังไม่ได้จดบันทึก" : "จดบันทึกวันนี้แล้ว"}</span>
              <span class="brief-actions"><button type="button" onClick={() => go("diary")}>{b.noEntryToday ? "จดบันทึกวันนี้" : "ดูปฏิทิน"}</button></span>
            </li>
            {b.longestUse && <li><strong>ใช้มานานสุด</strong><span>{`${b.longestUse.label} ใช้มา ${b.longestUse.days} วัน`}</span></li>}
          </ul>
        )}
        <p class="meta brief-scope">
          <ScopeChip coverage={r?.coverage ?? meta.coverage} herbsInBook={meta.coverage.herbs_in_book} /> สรุปนี้คำนวณจากข้อมูลในเครื่องของคุณ ไม่ใช่การวินิจฉัย {meta.disclaimer_th}
        </p>
      </div>

      <div class="assistant-side">
      <div class="card shortcuts">
        <h3>ทางลัด</h3>
        <div class="brief-actions">
          <button type="button" onClick={() => go("now")}>เพิ่มสมุนไพรหรือยา</button>
          <button type="button" onClick={() => go("diary")}>ดูปฏิทินและบันทึก</button>
          <button type="button" onClick={() => go("mine")}>ใบสรุปสำหรับเภสัชกร</button>
          <button type="button" onClick={() => ask("ควรถามเภสัชกรว่าอะไร")}>ควรถามเภสัชกรอะไร</button>
        </div>
      </div>
      {children}
      </div>
    </section>
  );
}
