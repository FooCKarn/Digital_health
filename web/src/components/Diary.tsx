import { useRef, useState } from "preact/hooks";
import type { Analysis } from "../hooks/useAnalysis";
import { MOODS, RANGES, VITAL_LABEL, series, takenInWindow, type DiaryStore, type VitalKey } from "../model/diary";
import { dayNumber, thaiDate } from "../model/dates";
import type { TrackerStore } from "../model/tracker";
import { downloadJSON } from "../download";
import { groupFlags } from "../model/panel";
import { Trend } from "./Trend";
import { Calendar } from "./Calendar";
import { itemsOn } from "../model/calendar";
import { openPolicy } from "./Policy";
import { useDiary } from "../hooks/useDiary";

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** หน้า บันทึก: ปฏิทิน + บันทึกสุขภาพรายวัน (ย้อนหลังได้) + แนวโน้ม + สรุปไว้คุยกับเภสัชกร (ไม่แปลผลค่า ไม่ตัดสินความเสี่ยง) */
export function Diary({ diary, store, today, analysis }: { diary: DiaryStore; store: TrackerStore; today: string; analysis: Analysis }) {
  useDiary(diary);
  const [selected, setSelected] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const entries0 = diary.state.entries.length;
  const file = useRef<HTMLInputElement>(null);

  const entries = diary.state.entries;
  const items = store.active();
  const flagCount = analysis.current && analysis.result ? groupFlags(analysis.result) : null;
  const recent = [...entries].reverse().slice(0, 7);

  return (
    <section class="diary" aria-labelledby="diary-h">
      <h2 id="diary-h">บันทึกสุขภาพของฉัน</h2>
      <p class="meta">เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ส่งไปที่ไหน และไม่มีการแปลผลค่าให้ ต้นแบบนี้ให้ใช้ข้อมูลสมมติ</p>

      <details class="card privacy" open={entries0 === 0}>
        <summary><strong>ข้อมูลของฉันอยู่ที่ไหน</strong></summary>
        <ul>
          <li>บันทึกสุขภาพและรายการที่ใช้อยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีบัญชีผู้ใช้ ทีมงานเปิดดูข้อมูลของคุณไม่ได้</li>
          <li>ล้างข้อมูลเบราว์เซอร์ ใช้โหมดส่วนตัว หรือเปลี่ยนเครื่อง ข้อมูลก็หายและกู้คืนไม่ได้ อยากเก็บไว้ให้กด ส่งออกไฟล์</li>
          <li>ตอนตรวจ จะส่งชื่อสมุนไพร ชื่อยา และข้อมูลโปรไฟล์ไปคำนวณที่เซิร์ฟเวอร์ ส่วนค่าสุขภาพกับอาการที่จดไว้ไม่ถูกส่ง แต่แชตและช่อง AI จะส่งข้อความที่คุณพิมพ์</li>
          <li>ถ้าใช้เครื่องร่วมกับคนอื่น ลบบันทึกทิ้งหลังใช้ด้วย และต้นแบบนี้ให้กรอกเฉพาะข้อมูลสมมติ</li>
        </ul>
        <p><a href="#policy" onClick={openPolicy}>อ่านเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัวฉบับเต็ม</a></p>
      </details>

      <section class="card" aria-labelledby="cal-h">
        <h3 id="cal-h" class="sr-only">ปฏิทินบันทึก</h3>
        <Calendar items={store.state.items} diary={diary.state} today={today} selected={selected} onSelect={(d) => { setSelected(d); setMsg(null); }} />
      </section>

      <DayPanel key={selected} diary={diary} store={store} date={selected} today={today} onMsg={setMsg} msg={msg} />

      <section class="card" aria-labelledby="trend-h">
        <h3 id="trend-h">แนวโน้มที่คุณบันทึก</h3>
        {entries.length === 0 ? <p class="empty-note">ยังไม่มีบันทึก เริ่มจากการบันทึกวันนี้ด้านบน</p> : (
          <>
            <MoodDots diary={diary} today={today} />
            {(["sys", "glucose", "weight"] as VitalKey[]).map((k) => <Trend key={k} k={k} points={series(entries, k)} />)}
            {(["sys", "glucose", "weight"] as VitalKey[]).every((k) => series(entries, k).length === 0) && <p class="meta">ยังไม่มีค่าสุขภาพที่บันทึก</p>}
            <p class="meta">กราฟมาจากค่าที่คุณกรอกเองเท่านั้น ไม่ได้บอกว่าค่าไหนสูงหรือต่ำเกินไป ถ้ากังวลให้ถามแพทย์หรือเภสัชกร</p>
          </>
        )}
      </section>

      <section class="card" aria-labelledby="intake-h">
        <h3 id="intake-h">การใช้ใน 7 วันที่ผ่านมา</h3>
        {items.length === 0 ? <p class="empty-note">ยังไม่มีสมุนไพรหรือยาที่ใช้อยู่ เพิ่มได้ที่หน้า ช่วงนี้</p> : (
          <ul class="plain-list">
            {items.map((i) => {
              const w = takenInWindow(diary.state.taken[i.id] ?? [], i.start_date, today);
              return <li key={i.id}><strong>{i.label}</strong> <span class="meta">{`กดบันทึกว่าใช้ ${w.took} จาก ${w.days} วัน`}</span></li>;
            })}
          </ul>
        )}
        <p class="meta">นับจากที่คุณกดเอง ไม่ได้ตรวจว่าใช้ถูกขนาดหรือไม่</p>
      </section>

      <section class="card print-me" aria-labelledby="pharm-h">
        <h3 id="pharm-h">สรุปไว้คุยกับเภสัชกร</h3>
        <ul class="plain-list">
          <li>{items.length ? `กำลังใช้: ${items.map((i) => `${i.label} (วันที่ ${dayNumber(i.start_date, today)})`).join(", ")}` : "กำลังใช้: ไม่มีรายการ"}</li>
          <li>
            {flagCount ? `ธงเตือนจากฐานข้อมูลนี้: ควรหลีกเลี่ยง ${flagCount.avoid.length} · ควรระวัง ${flagCount.caution.length} · ข้อมูลเพิ่มเติม ${flagCount.info.length}` : "ธงเตือน: ยังไม่มีผลตรวจล่าสุด ดูที่หน้า ช่วงนี้"}
          </li>
          {recent.length === 0 ? <li>ยังไม่มีบันทึกสุขภาพ</li> : recent.map((e) => (
            <li key={e.id}>
              {`${e.date}:`}
              {e.mood !== null && ` ความรู้สึก ${MOODS[e.mood - 1].th}`}
              {e.symptom && ` · อาการ ${e.symptom}`}
              {e.sys !== null && ` · ความดัน ${e.sys}/${e.dia}`}
              {e.glucose !== null && ` · น้ำตาล ${e.glucose}`}
              {e.weight !== null && ` · น้ำหนัก ${e.weight}`}
            </li>
          ))}
        </ul>
        <p class="meta">ไม่ใช่การวินิจฉัย เป็นแค่ข้อมูลที่คุณจดไว้ ให้เภสัชกรดูประกอบ</p>
        <div class="row-actions noprint">
          <button type="button" onClick={() => window.print()}>พิมพ์</button>
        </div>
      </section>

      <section class="card noprint" aria-labelledby="dd-h">
        <h3 id="dd-h">จัดการบันทึกสุขภาพ</h3>
        <div class="row-actions">
          <button type="button" onClick={() => downloadJSON("herbguard-diary.json", diary.exportJSON())}>ส่งออกไฟล์</button>
          <button type="button" onClick={() => file.current?.click()}>นำเข้าไฟล์</button>
          <button type="button" onClick={() => { if (window.confirm("ลบบันทึกสุขภาพและประวัติการกดใช้ทั้งหมดในเครื่องนี้ใช่ไหม ลบแล้วเอาคืนไม่ได้")) { diary.clearAll(); setMsg({ ok: true, text: "ลบบันทึกสุขภาพแล้ว" }); } }}>ลบบันทึกทั้งหมด</button>
        </div>
        <input ref={file} type="file" accept="application/json" hidden aria-label="เลือกไฟล์บันทึกสุขภาพ" onChange={async (e) => {
          const f = e.currentTarget.files?.[0]; if (!f) return;
          const r = diary.importJSON(await f.text());
          setMsg(r.ok ? { ok: true, text: "นำเข้าแล้ว" } : { ok: false, text: r.message });
          e.currentTarget.value = "";
        }} />
        {store.persistent && !diary.persistent && <p class="warn" role="status">เบราว์เซอร์ไม่ให้บันทึกข้อมูล ปิดหน้านี้แล้วจะหาย ส่งออกไฟล์ไว้ถ้าอยากเก็บ</p>}
      </section>
    </section>
  );
}

function MoodDots({ diary, today }: { diary: DiaryStore; today: string }) {
  const days: { d: string; mood: number | null }[] = [];
  for (let n = 6; n >= 0; n--) {
    const t = new Date(today + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - n);
    const d = t.toISOString().slice(0, 10);
    days.push({ d, mood: diary.entryOn(d)?.mood ?? null });
  }
  return (
    <div class="mooddots" role="img" aria-label={`ความรู้สึก 7 วันล่าสุด: ${days.map((x) => (x.mood === null ? "ไม่ได้บันทึก" : MOODS[x.mood - 1].th)).join(", ")}`}>
      {days.map((x) => <span key={x.d} class="dot" data-m={x.mood ?? 0}>{x.mood ?? "·"}</span>)}
    </div>
  );
}

/** แผงของวันที่เลือก: ฟอร์มบันทึก + ปุ่มกดว่าใช้แล้ว (key = วันที่ ฟอร์มจึงเริ่มใหม่เมื่อเปลี่ยนวัน) */
function DayPanel({ diary, store, date, today, msg, onMsg }: {
  diary: DiaryStore; store: TrackerStore; date: string; today: string;
  msg: { ok: boolean; text: string } | null; onMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const isToday = date === today;
  const when = isToday ? "วันนี้" : `วันที่ ${thaiDate(date)}`;
  const mine = diary.entryOn(date);
  const [mood, setMood] = useState<number | null>(mine?.mood ?? null);
  const [symptom, setSymptom] = useState(mine?.symptom ?? "");
  const [sys, setSys] = useState(mine?.sys?.toString() ?? "");
  const [dia, setDia] = useState(mine?.dia?.toString() ?? "");
  const [glucose, setGlucose] = useState(mine?.glucose?.toString() ?? "");
  const [weight, setWeight] = useState(mine?.weight?.toString() ?? "");
  const [consent, setConsent] = useState(diary.state.entries.length > 0);
  const used = itemsOn(store.state.items, date);

  const save = (e: Event) => {
    e.preventDefault();
    const r = diary.saveEntry({ date, mood, symptom: symptom.trim() || null, sys: num(sys), dia: num(dia), glucose: num(glucose), weight: num(weight) });
    onMsg(r.ok ? { ok: true, text: `บันทึกของ${when}แล้ว` } : { ok: false, text: r.message });
  };

  return (
    <form class="card day-panel" onSubmit={save} noValidate aria-labelledby="day-h">
      <h3 id="day-h">{isToday ? "วันนี้เป็นอย่างไรบ้าง" : `บันทึกของ${when}`}</h3>

      {used.length > 0 && <p class="meta">{`กดรายการที่ใช้แล้วใน${when} (กดซ้ำเพื่อยกเลิก)`}</p>}
      {used.length > 0 && (
        <div class="day-items" role="group" aria-label={`รายการที่ใช้อยู่ใน${when}`}>
          {used.map((i) => {
            const on = diary.isTaken(i.id, date);
            return (
              <button key={i.id} type="button" class="check-btn" aria-pressed={on} aria-label={`ใช้ ${i.label} แล้วใน${when}`} onClick={() => diary.toggleTaken(i.id, date)}>
                {i.label}
              </button>
            );
          })}
        </div>
      )}

      <div role="radiogroup" aria-label={`ความรู้สึก${when}`} class="moods">
        {MOODS.map((m) => (
          <button key={m.v} type="button" role="radio" aria-checked={mood === m.v} class="mood" onClick={() => setMood(mood === m.v ? null : m.v)}>
            <span aria-hidden="true" class="mood-n">{m.v}</span>{m.th}
          </button>
        ))}
      </div>
      <div class="field">
        <label for="d-symptom">อาการหรือสิ่งที่อยากจดไว้ (ไม่บังคับ)</label>
        <input id="d-symptom" type="text" maxLength={200} value={symptom} onInput={(e) => setSymptom(e.currentTarget.value)} />
      </div>
      <label class="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
        <span>ฉันต้องการบันทึกค่าสุขภาพ (ความดัน น้ำตาล น้ำหนัก) ไว้ในเบราว์เซอร์เครื่องนี้</span>
      </label>
      {consent && (
        <div class="vitals">
          <div class="field">
            <span id="bp-l" class="lbl">ความดัน (mmHg) ตัวบน / ตัวล่าง</span>
            <div class="bp" role="group" aria-labelledby="bp-l">
              <input aria-label="ความดันตัวบน" inputMode="numeric" type="number" min={RANGES.sys[0]} max={RANGES.sys[1]} value={sys} onInput={(e) => setSys(e.currentTarget.value)} />
              <span aria-hidden="true">/</span>
              <input aria-label="ความดันตัวล่าง" inputMode="numeric" type="number" min={RANGES.dia[0]} max={RANGES.dia[1]} value={dia} onInput={(e) => setDia(e.currentTarget.value)} />
            </div>
          </div>
          <div class="field">
            <label for="d-glucose">{`${VITAL_LABEL.glucose.th} (${VITAL_LABEL.glucose.unit})`}</label>
            <input id="d-glucose" inputMode="decimal" type="number" step="any" value={glucose} onInput={(e) => setGlucose(e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="d-weight">{`${VITAL_LABEL.weight.th} (${VITAL_LABEL.weight.unit})`}</label>
            <input id="d-weight" inputMode="decimal" type="number" step="any" value={weight} onInput={(e) => setWeight(e.currentTarget.value)} />
          </div>
        </div>
      )}
      {msg && <p class={msg.ok ? "ok" : "err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <button type="submit" class="primary wide">{isToday ? "บันทึกวันนี้" : `บันทึกวันที่ ${thaiDate(date)}`}</button>
      {mine && (
        <button type="button" class="wide" onClick={() => { if (window.confirm(`ลบบันทึกของ${when}?`)) { diary.removeEntry(date); onMsg({ ok: true, text: `ลบบันทึกของ${when}แล้ว` }); } }}>
          {`ลบบันทึกของ${when}`}
        </button>
      )}
    </form>
  );
}
