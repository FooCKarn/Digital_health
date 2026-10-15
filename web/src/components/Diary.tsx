import { useRef, useState } from "preact/hooks";
import type { Analysis } from "../hooks/useAnalysis";
import { MOODS, RANGES, VITAL_LABEL, series, takenInWindow, type DiaryStore, type VitalKey } from "../model/diary";
import { dayNumber, thaiDate } from "../model/dates";
import type { TrackerStore } from "../model/tracker";
import { downloadJSON } from "../download";
import { groupFlags } from "../model/panel";
import { Trend } from "./Trend";
import { Calendar } from "./Calendar";
import { openPolicy } from "./Policy";
import { useDiary } from "../hooks/useDiary";
import { t } from "../i18n";
import { itemLabel } from "../texts";

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
      <h2 id="diary-h">{t("บันทึกสุขภาพของฉัน", "My health diary")}</h2>
      <p class="meta">{t("เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ส่งไปที่ไหน และไม่มีการแปลผลค่าให้ ต้นแบบนี้ให้ใช้ข้อมูลสมมติ", "Stored only in this browser. It is not sent anywhere, and your readings are not interpreted. This prototype is for made-up data only.")}</p>

      <details class="card privacy" open={entries0 === 0}>
        <summary><strong>{t("ข้อมูลของฉันอยู่ที่ไหน", "Where is my data?")}</strong></summary>
        <ul>
          <li>{t("บันทึกสุขภาพและรายการที่ใช้อยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่มีบัญชีผู้ใช้ ทีมงานเปิดดูข้อมูลของคุณไม่ได้", "Your health diary and your list of items are only in this browser. There is no user account, and the team cannot see your data.")}</li>
          <li>{t("ล้างข้อมูลเบราว์เซอร์ ใช้โหมดส่วนตัว หรือเปลี่ยนเครื่อง ข้อมูลก็หายและกู้คืนไม่ได้ อยากเก็บไว้ให้กด ส่งออกไฟล์", "If you clear browser data, use private mode or switch devices, the data is lost and cannot be recovered. To keep it, press Export file.")}</li>
          <li>{t("ตอนตรวจ จะส่งชื่อสมุนไพร ชื่อยา และข้อมูลโปรไฟล์ไปคำนวณที่เซิร์ฟเวอร์ ส่วนค่าสุขภาพกับอาการที่จดไว้ไม่ถูกส่ง แต่แชตและช่อง AI จะส่งข้อความที่คุณพิมพ์", "When checking, herb names, medicine names and your profile are sent to the server to be worked out. Your logged readings and symptoms are not sent, but the chat and the AI box send what you type.")}</li>
          <li>{t("ถ้าใช้เครื่องร่วมกับคนอื่น ลบบันทึกทิ้งหลังใช้ด้วย และต้นแบบนี้ให้กรอกเฉพาะข้อมูลสมมติ", "If you share this device, delete your entries after use. This prototype is for made-up data only.")}</li>
        </ul>
        <p><a href="#policy" onClick={openPolicy}>{t("อ่านเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัวฉบับเต็ม", "Read the full terms of use and privacy policy")}</a></p>
      </details>

      <section class="card" aria-labelledby="cal-h">
        <h3 id="cal-h" class="sr-only">{t("ปฏิทินบันทึก", "Diary calendar")}</h3>
        <Calendar items={store.state.items} diary={diary.state} today={today} selected={selected} onSelect={(d) => { setSelected(d); setMsg(null); }} />
      </section>

      <DayPanel key={selected} diary={diary} store={store} date={selected} today={today} onMsg={setMsg} msg={msg} />

      <section class="card" aria-labelledby="trend-h">
        <h3 id="trend-h">{t("แนวโน้มที่คุณบันทึก", "Trends from your entries")}</h3>
        {entries.length === 0 ? <p class="empty-note">{t("ยังไม่มีบันทึก เริ่มจากการบันทึกวันนี้ด้านบน", "No entries yet. Start by logging today above.")}</p> : (
          <>
            <MoodDots diary={diary} today={today} />
            {(["sys", "glucose", "weight"] as VitalKey[]).map((k) => <Trend key={k} k={k} points={series(entries, k)} />)}
            {(["sys", "glucose", "weight"] as VitalKey[]).every((k) => series(entries, k).length === 0) && <p class="meta">{t("ยังไม่มีค่าสุขภาพที่บันทึก", "No readings logged yet")}</p>}
            <p class="meta">{t("กราฟมาจากค่าที่คุณกรอกเองเท่านั้น ไม่ได้บอกว่าค่าไหนสูงหรือต่ำเกินไป ถ้ากังวลให้ถามแพทย์หรือเภสัชกร", "The charts use only the values you entered. They do not say whether a value is too high or too low. If you are worried, ask a doctor or pharmacist.")}</p>
          </>
        )}
      </section>

      <section class="card" aria-labelledby="intake-h">
        <h3 id="intake-h">{t("การใช้ใน 7 วันที่ผ่านมา", "Doses in the past 7 days")}</h3>
        {items.length === 0 ? <p class="empty-note">{t("ยังไม่มีสมุนไพรหรือยาที่ใช้อยู่ เพิ่มได้ที่หน้า ช่วงนี้", "No herbs or medicines in use yet. Add them in the This period tab.")}</p> : (
          <ul class="plain-list">
            {items.map((i) => {
              const w = takenInWindow(diary.state.taken[i.id] ?? [], i.start_date, today);
              return <li key={i.id}><strong>{itemLabel(i)}</strong> <span class="meta">{t(`กดบันทึกว่าใช้ ${w.took} จาก ${w.days} วัน`, `marked as taken on ${w.took} of ${w.days} days`)}</span></li>;
            })}
          </ul>
        )}
      </section>

      <section class="card print-me" aria-labelledby="pharm-h">
        <h3 id="pharm-h">{t("สรุปไว้คุยกับเภสัชกร", "Summary to discuss with a pharmacist")}</h3>
        <ul class="plain-list">
          <li>{items.length ? `${t("กำลังใช้", "In use")}: ${items.map((i) => `${itemLabel(i)} (${t("วันที่", "day")} ${dayNumber(i.start_date, today)})`).join(", ")}` : `${t("กำลังใช้", "In use")}: ${t("ไม่มีรายการ", "none")}`}</li>
          <li>
            {flagCount ? t(`คำเตือนจากฐานข้อมูลนี้: ควรหลีกเลี่ยง ${flagCount.avoid.length} · ควรระวัง ${flagCount.caution.length} · ข้อมูลเพิ่มเติม ${flagCount.info.length}`, `Warnings from this database: avoid ${flagCount.avoid.length} · use caution ${flagCount.caution.length} · more information ${flagCount.info.length}`) : t("คำเตือน: ยังไม่มีผลตรวจล่าสุด ดูที่หน้า ช่วงนี้", "Warnings: no latest result yet. See the This period tab.")}
          </li>
          {recent.length === 0 ? <li>{t("ยังไม่มีบันทึกสุขภาพ", "No health entries yet")}</li> : recent.map((e) => (
            <li key={e.id}>
              {`${e.date}:`}
              {e.mood !== null && ` ${t("ความรู้สึก", "mood")} ${t(MOODS[e.mood - 1].th, MOODS[e.mood - 1].en)}`}
              {e.symptom && ` · ${t("อาการ", "symptom")} ${e.symptom}`}
              {e.sys !== null && ` · ${t("ความดัน", "blood pressure")} ${e.sys}/${e.dia}`}
              {e.glucose !== null && ` · ${t("น้ำตาล", "glucose")} ${e.glucose}`}
              {e.weight !== null && ` · ${t("น้ำหนัก", "weight")} ${e.weight}`}
            </li>
          ))}
        </ul>
        <p class="meta">{t("ไม่ใช่การวินิจฉัย เป็นแค่ข้อมูลที่คุณจดไว้ ให้เภสัชกรดูประกอบ", "Not a diagnosis. This is only what you logged, for a pharmacist to look at.")}</p>
        <div class="row-actions noprint">
          <button type="button" onClick={() => window.print()}>{t("พิมพ์", "Print")}</button>
        </div>
      </section>

      <section class="card noprint" aria-labelledby="dd-h">
        <h3 id="dd-h">{t("จัดการบันทึกสุขภาพ", "Manage your health diary")}</h3>
        <div class="row-actions">
          <button type="button" onClick={() => downloadJSON("herbguard-diary.json", diary.exportJSON())}>{t("ส่งออกไฟล์", "Export file")}</button>
          <button type="button" onClick={() => file.current?.click()}>{t("นำเข้าไฟล์", "Import file")}</button>
          <button type="button" onClick={() => { if (window.confirm(t("ลบบันทึกสุขภาพและประวัติการกดใช้ทั้งหมดในเครื่องนี้ใช่ไหม ลบแล้วเอาคืนไม่ได้", "Delete all health entries and dose history on this device? This cannot be undone."))) { diary.clearAll(); setMsg({ ok: true, text: t("ลบบันทึกสุขภาพแล้ว", "Health diary deleted") }); } }}>{t("ลบบันทึกทั้งหมด", "Delete all entries")}</button>
        </div>
        <input ref={file} type="file" accept="application/json" hidden aria-label={t("เลือกไฟล์บันทึกสุขภาพ", "Choose a health diary file")} onChange={async (e) => {
          const f = e.currentTarget.files?.[0]; if (!f) return;
          const r = diary.importJSON(await f.text());
          setMsg(r.ok ? { ok: true, text: t("นำเข้าแล้ว", "Imported") } : { ok: false, text: r.message });
          e.currentTarget.value = "";
        }} />
        {store.persistent && !diary.persistent && <p class="warn" role="status">{t("เบราว์เซอร์ไม่ให้บันทึกข้อมูล ปิดหน้านี้แล้วจะหาย ส่งออกไฟล์ไว้ถ้าอยากเก็บ", "The browser isn't letting your data save, so it will be gone when you close this page. Export a file if you want to keep it.")}</p>}
      </section>
    </section>
  );
}

function MoodDots({ diary, today }: { diary: DiaryStore; today: string }) {
  const days: { d: string; mood: number | null }[] = [];
  for (let n = 6; n >= 0; n--) {
    const dt = new Date(today + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() - n);
    const d = dt.toISOString().slice(0, 10);
    days.push({ d, mood: diary.entryOn(d)?.mood ?? null });
  }
  return (
    <>
    <p class="meta mood-cap">{t("ความรู้สึก 7 วันล่าสุด (ขวาสุดคือวันนี้ · 1 = แย่มาก ถึง 5 = ดีมาก)", "Mood over the last 7 days (rightmost is today · 1 = very bad, 5 = very good)")}</p>
    <div class="mooddots" role="img" aria-label={`${t("ความรู้สึก 7 วันล่าสุด", "Mood over the last 7 days")}: ${days.map((x) => (x.mood === null ? t("ไม่ได้บันทึก", "not logged") : t(MOODS[x.mood - 1].th, MOODS[x.mood - 1].en))).join(", ")}`}>
      {days.map((x) => <span key={x.d} class="dot" data-m={x.mood ?? 0}>{x.mood ?? "·"}</span>)}
    </div>
    </>
  );
}

/** แผงของวันที่เลือก: ฟอร์มบันทึกสุขภาพ (การกดว่าใช้แล้วอยู่ที่ปุ่ม ใช้แล้ววันนี้ ในหน้า ช่วงนี้/ผู้ช่วย) (key = วันที่ ฟอร์มจึงเริ่มใหม่เมื่อเปลี่ยนวัน) */
function DayPanel({ diary, store, date, today, msg, onMsg }: {
  diary: DiaryStore; store: TrackerStore; date: string; today: string;
  msg: { ok: boolean; text: string } | null; onMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const isToday = date === today;
  const when = isToday ? t("วันนี้", "today") : t(`วันที่ ${thaiDate(date)}`, `on ${thaiDate(date)}`);
  const mine = diary.entryOn(date);
  const usedThen = store.state.items.filter((i) => i.start_date <= date && (i.end_date === null || date <= i.end_date));
  const [mood, setMood] = useState<number | null>(mine?.mood ?? null);
  const [symptom, setSymptom] = useState(mine?.symptom ?? "");
  const [sys, setSys] = useState(mine?.sys?.toString() ?? "");
  const [dia, setDia] = useState(mine?.dia?.toString() ?? "");
  const [glucose, setGlucose] = useState(mine?.glucose?.toString() ?? "");
  const [weight, setWeight] = useState(mine?.weight?.toString() ?? "");
  const [consent, setConsent] = useState(diary.state.entries.length > 0);

  const save = (e: Event) => {
    e.preventDefault();
    const r = diary.saveEntry({ date, mood, symptom: symptom.trim() || null, sys: num(sys), dia: num(dia), glucose: num(glucose), weight: num(weight) });
    onMsg(r.ok ? { ok: true, text: t(`บันทึกของ${when}แล้ว`, `Entry saved for ${when}`) } : { ok: false, text: r.message });
  };

  return (
    <form class="card day-panel" onSubmit={save} noValidate aria-labelledby="day-h">
      <h3 id="day-h">{isToday ? t("วันนี้เป็นอย่างไรบ้าง", "How are you today?") : t(`บันทึกของ${when}`, `Entry ${when}`)}</h3>

      {usedThen.length > 0 && (
        <fieldset class="took-day">
          <legend>{t(`สิ่งที่ใช้${isToday ? "วันนี้" : when}`, `What you took ${when}`)}</legend>
          {usedThen.map((i) => (
            <label key={i.id} class="check-line took-row">
              <input type="checkbox" checked={diary.isTaken(i.id, date)} onChange={() => diary.toggleTaken(i.id, date)} />
              <span>{itemLabel(i)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div role="radiogroup" aria-label={t(`ความรู้สึก${when}`, `Mood ${when}`)} class="moods">
        {MOODS.map((m) => (
          <button key={m.v} type="button" role="radio" aria-checked={mood === m.v} class="mood" onClick={() => setMood(mood === m.v ? null : m.v)}>
            <span aria-hidden="true" class="mood-n">{m.v}</span>{t(m.th, m.en)}
          </button>
        ))}
      </div>
      <div class="field">
        <label for="d-symptom">{t("อาการหรือสิ่งที่อยากจดไว้ (ไม่บังคับ)", "Symptoms or anything you want to note (optional)")}</label>
        <input id="d-symptom" type="text" maxLength={200} value={symptom} onInput={(e) => setSymptom(e.currentTarget.value)} />
      </div>
      <label class="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
        <span>{t("ฉันต้องการบันทึกค่าสุขภาพ (ความดัน น้ำตาล น้ำหนัก) ไว้ในเบราว์เซอร์เครื่องนี้", "I want to save health readings (blood pressure, glucose, weight) in this browser")}</span>
      </label>
      {consent && (
        <div class="vitals">
          <div class="field">
            <span id="bp-l" class="lbl">{t("ความดัน (mmHg) ตัวบน / ตัวล่าง", "Blood pressure (mmHg) systolic / diastolic")}</span>
            <div class="bp" role="group" aria-labelledby="bp-l">
              <input aria-label={t("ความดันตัวบน", "Systolic pressure")} inputMode="numeric" type="number" min={RANGES.sys[0]} max={RANGES.sys[1]} value={sys} onInput={(e) => setSys(e.currentTarget.value)} />
              <span aria-hidden="true">/</span>
              <input aria-label={t("ความดันตัวล่าง", "Diastolic pressure")} inputMode="numeric" type="number" min={RANGES.dia[0]} max={RANGES.dia[1]} value={dia} onInput={(e) => setDia(e.currentTarget.value)} />
            </div>
          </div>
          <div class="field">
            <label for="d-glucose">{`${t(VITAL_LABEL.glucose.th, VITAL_LABEL.glucose.en)} (${VITAL_LABEL.glucose.unit})`}</label>
            <input id="d-glucose" inputMode="decimal" type="number" step="any" value={glucose} onInput={(e) => setGlucose(e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="d-weight">{`${t(VITAL_LABEL.weight.th, VITAL_LABEL.weight.en)} (${VITAL_LABEL.weight.unit})`}</label>
            <input id="d-weight" inputMode="decimal" type="number" step="any" value={weight} onInput={(e) => setWeight(e.currentTarget.value)} />
          </div>
        </div>
      )}
      {msg && <p class={msg.ok ? "ok" : "err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <button type="submit" class="primary wide">{isToday ? t("บันทึกวันนี้", "Save today") : t(`บันทึกวันที่ ${thaiDate(date)}`, `Save ${thaiDate(date)}`)}</button>
      {mine && (
        <button type="button" class="wide" onClick={() => { if (window.confirm(t(`ลบบันทึกของ${when}?`, `Delete the entry ${when}?`))) { diary.removeEntry(date); onMsg({ ok: true, text: t(`ลบบันทึกของ${when}แล้ว`, `Entry ${when} deleted`) }); } }}>
          {t(`ลบบันทึกของ${when}`, `Delete entry ${when}`)}
        </button>
      )}
    </form>
  );
}
