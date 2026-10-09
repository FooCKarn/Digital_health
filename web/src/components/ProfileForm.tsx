import { useRef, useState } from "preact/hooks";
import type { Profile, TrackerStore } from "../model/tracker";

type YN = Profile["pregnant"];
const AGE_ERR = "อายุต้องเป็นจำนวนเต็ม 0-120 ปี หรือเว้นว่างถ้าไม่ระบุ";

/** ว่าง = null; อื่น ๆ ต้องเป็นจำนวนเต็ม 0-120 ไม่งั้น undefined (ผิด) */
function parseAge(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 120 ? n : undefined;
}

// ไม่ระบุ/ใช่/ไม่ใช่ เป็น select 3 ค่า (ห้าม checkbox: ช่องที่ไม่ได้ติ๊กจะกลายเป็น "ไม่ใช่" ผิดสเปก R1)
function YesNo({ id, label, value, onChange }: { id: string; label: string; value: YN; onChange: (v: YN) => void }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={value ?? ""} onChange={(e) => { const v = e.currentTarget.value; onChange(v === "yes" || v === "no" ? v : null); }}>
        <option value="">ไม่ระบุ</option>
        <option value="yes">ใช่</option>
        <option value="no">ไม่ใช่</option>
      </select>
      {value === null && <p class="meta unspec">ยังไม่ระบุ: ระบบจะไม่ตรวจข้อนี้</p>}
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
    if (a === undefined) { setAgeErr(AGE_ERR); ageRef.current?.focus(); return; }
    const r = store.setProfile({ age: a, pregnant, breastfeeding, conditions: conds });
    if (r.ok) setSaved("บันทึกแล้ว ระบบจะตรวจใหม่ในหน้า ช่วงนี้"); else setErr(r.message);
  };
  const all = Object.entries(conditions);
  const needle = q.trim().toLowerCase();
  const toggle = (c: string, on: boolean) => setConds((xs) => (on ? [...xs, c] : xs.filter((x) => x !== c)));

  return (
    <form class="profile-form card" onSubmit={submit} onInput={() => setSaved("")} onChange={() => setSaved("")} noValidate aria-labelledby="profile-h">
      <h3 id="profile-h">ข้อมูลสุขภาพที่ใช้ตรวจ</h3>
      <p class="meta">ไม่ระบุ = ระบบจะแจ้งว่าไม่ได้ตรวจเงื่อนไขนั้น (ไม่ถือว่า ไม่ใช่)</p>
      <div class="field age-field">
        <label for="pf-age">อายุ (ปี)</label>
        <div class="suffix">
          <input ref={ageRef} id="pf-age" type="text" inputMode="numeric" autoComplete="off" maxLength={3} value={age} aria-invalid={!!ageErr}
            aria-describedby={ageErr ? "pf-age-err" : undefined} onInput={(e) => { setAge(e.currentTarget.value); setAgeErr(""); }} />
          <span aria-hidden="true">ปี</span>
        </div>
        <p class="meta">เว้นว่าง = ไม่ระบุ</p>
        {ageErr && <p class="err" role="alert" id="pf-age-err">{ageErr}</p>}
      </div>
      <YesNo id="pf-preg" label="ตั้งครรภ์" value={pregnant} onChange={setPregnant} />
      <YesNo id="pf-bf" label="ให้นมบุตร" value={breastfeeding} onChange={setBreastfeeding} />
      <fieldset class="cond">
        <legend>โรคประจำตัว/สภาวะ</legend>
        <label for="cond-q">ค้นหาโรค/สภาวะ</label>
        <input id="cond-q" type="search" autoComplete="off" value={q} onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
        <p class="meta" aria-live="polite">{`เลือกแล้ว ${conds.length} จาก ${all.length}`}</p>
        {conds.length > 0 && (
          <ul class="chosen" aria-label="โรค/สภาวะที่เลือกไว้">
            {conds.map((c) => (
              <li key={c} class="chip-sel">
                <span>{conditions[c]}</span>
                <button type="button" aria-label={`เอาออก ${conditions[c]}`} onClick={() => toggle(c, false)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <details class="cond-all" open={needle !== ""}>
          <summary>{`ดูและเลือกจากรายการทั้งหมด (${all.length})`}</summary>
          <div class="chips">
            {all.map(([code, name]) => (
              <label key={code} class="chip-opt" hidden={needle !== "" && !name.toLowerCase().includes(needle)}>
                <input type="checkbox" class="sr-only" checked={conds.includes(code)} onChange={(e) => toggle(code, e.currentTarget.checked)} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          {needle !== "" && all.every(([, n]) => !n.toLowerCase().includes(needle)) && <p class="meta">ไม่พบรายการที่ตรงกับคำค้น</p>}
        </details>
        {unknown.length > 0 && <p class="warn">{`ระบบไม่รู้จัก (ไม่ได้ตรวจ และจะถูกนำออกเมื่อบันทึก): ${unknown.join(", ")}`}</p>}
      </fieldset>
      {err && <p class="err" role="alert">{err}</p>}
      <div class="savebar">
        <button type="submit" class="primary">บันทึกข้อมูลสุขภาพ</button>
        <p role="status" class="meta">{saved}</p>
      </div>
    </form>
  );
}
