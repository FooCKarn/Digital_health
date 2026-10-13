import { useRef, useState } from "preact/hooks";
import type { Profile, TrackerStore } from "../model/tracker";
import { t } from "../i18n";

type YN = Profile["pregnant"];
const ageErrText = () => t("อายุต้องเป็นจำนวนเต็ม 0-120 ปี หรือเว้นว่างถ้าไม่ระบุ", "Age must be a whole number from 0 to 120, or left blank if not specified");

/** ว่าง = null; อื่น ๆ ต้องเป็นจำนวนเต็ม 0-120 ไม่งั้น undefined (ผิด) */
function parseAge(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 120 ? n : undefined;
}

// ไม่ระบุ/ใช่/ไม่ใช่ เป็น select 3 ค่า (ห้าม checkbox: ช่องที่ไม่ได้ติ๊กจะกลายเป็น "ไม่ใช่" ผิดกฎ R1)
function YesNo({ id, label, value, onChange }: { id: string; label: string; value: YN; onChange: (v: YN) => void }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={value ?? ""} onChange={(e) => { const v = e.currentTarget.value; onChange(v === "yes" || v === "no" ? v : null); }}>
        <option value="">{t("ไม่ระบุ", "Not specified")}</option>
        <option value="yes">{t("ใช่", "Yes")}</option>
        <option value="no">{t("ไม่ใช่", "No")}</option>
      </select>
      {value === null && <p class="meta unspec">{t("ยังไม่ระบุ: จะไม่ตรวจข้อนี้", "Not specified: this will not be checked")}</p>}
    </div>
  );
}

export function ProfileForm({ store, conditions }: { store: TrackerStore; conditions: Record<string, string> }) {
  const init = store.state.profile;
  const [age, setAge] = useState(init.age === null ? "" : String(init.age));
  const [pregnant, setPregnant] = useState<YN>(init.pregnant);
  const [breastfeeding, setBreastfeeding] = useState<YN>(init.breastfeeding);
  const [conds, setConds] = useState<string[]>(init.conditions.filter((c) => Object.hasOwn(conditions, c)));
  const unknown = init.conditions.filter((c) => !Object.hasOwn(conditions, c));
  const [ageErr, setAgeErr] = useState("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [q, setQ] = useState("");
  const ageRef = useRef<HTMLInputElement>(null);

  const submit = (e: Event) => {
    e.preventDefault();
    setAgeErr(""); setErr(""); setSaved("");
    const a = parseAge(age);
    if (a === undefined) { setAgeErr(ageErrText()); ageRef.current?.focus(); return; }
    const r = store.setProfile({ age: a, pregnant, breastfeeding, conditions: conds });
    if (r.ok) setSaved(t("บันทึกแล้ว ผลตรวจในหน้า ช่วงนี้ จะอัปเดตตามให้", "Saved. The results in the This period tab will update.")); else setErr(r.message);
  };
  const all = Object.entries(conditions);
  const needle = q.trim().toLowerCase();
  const toggle = (c: string, on: boolean) => setConds((xs) => (on ? [...xs, c] : xs.filter((x) => x !== c)));

  return (
    <form class="profile-form card" onSubmit={submit} onInput={() => setSaved("")} onChange={() => setSaved("")} noValidate aria-labelledby="profile-h">
      <h3 id="profile-h">{t("ข้อมูลสุขภาพที่ใช้ตรวจ", "Health details used for checking")}</h3>
      <p class="meta">{t("ถ้าไม่ระบุ จะแจ้งว่าไม่ได้ตรวจเรื่องนั้น และไม่นับว่า ไม่ใช่", "If you leave something unspecified, we will say it was not checked. It is not treated as “No”.")}</p>
      <div class="field age-field">
        <label for="pf-age">{t("อายุ (ปี)", "Age (years)")}</label>
        <div class="suffix">
          <input ref={ageRef} id="pf-age" type="text" inputMode="numeric" autoComplete="off" maxLength={3} value={age} aria-invalid={!!ageErr}
            aria-describedby={ageErr ? "pf-age-err" : undefined} onInput={(e) => { setAge(e.currentTarget.value); setAgeErr(""); }} />
          <span aria-hidden="true">{t("ปี", "yrs")}</span>
        </div>
        {ageErr && <p class="err" role="alert" id="pf-age-err">{ageErr}</p>}
      </div>
      <YesNo id="pf-preg" label={t("ตั้งครรภ์", "Pregnant")} value={pregnant} onChange={setPregnant} />
      <YesNo id="pf-bf" label={t("ให้นมบุตร", "Breastfeeding")} value={breastfeeding} onChange={setBreastfeeding} />
      <fieldset class="cond">
        <legend>{t("โรคประจำตัว/สภาวะ", "Long-term conditions")}</legend>
        <label for="cond-q">{t("ค้นหาโรค/สภาวะ", "Search conditions")}</label>
        <input id="cond-q" type="search" autoComplete="off" value={q} onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
        <p class="meta" aria-live="polite">{t(`เลือกแล้ว ${conds.length} จาก ${all.length}`, `${conds.length} of ${all.length} selected`)}</p>
        {conds.length > 0 && (
          <ul class="chosen" aria-label={t("โรค/สภาวะที่เลือกไว้", "Selected conditions")}>
            {conds.map((c) => (
              <li key={c} class="chip-sel">
                <span>{conditions[c]}</span>
                <button type="button" aria-label={`${t("เอาออก", "Remove")} ${conditions[c]}`} onClick={() => toggle(c, false)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <details class="cond-all" open={needle !== ""}>
          <summary>{t(`ดูและเลือกจากรายการทั้งหมด (${all.length})`, `View and choose from the full list (${all.length})`)}</summary>
          <div class="chips">
            {all.map(([code, name]) => (
              <label key={code} class="chip-opt" hidden={needle !== "" && !name.toLowerCase().includes(needle)}>
                <input type="checkbox" class="sr-only" checked={conds.includes(code)} onChange={(e) => toggle(code, e.currentTarget.checked)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          {needle !== "" && all.every(([, n]) => !n.toLowerCase().includes(needle)) && <p class="meta">{t("ไม่พบรายการที่ตรงกับคำค้น", "Nothing matches your search")}</p>}
        </details>
        {unknown.length > 0 && <p class="warn">{`${t("ระบบไม่รู้จัก (ไม่ได้ตรวจ และจะถูกนำออกเมื่อบันทึก)", "Not recognised (not checked, and removed when you save)")}: ${unknown.join(", ")}`}</p>}
      </fieldset>
      {err && <p class="err" role="alert">{err}</p>}
      <div class="savebar">
        <button type="submit" class="primary">{t("บันทึกข้อมูลสุขภาพ", "Save health details")}</button>
        <p role="status" class="meta">{saved}</p>
      </div>
    </form>
  );
}
