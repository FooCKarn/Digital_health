import { DIARY_KEY, DiaryStore, series, takenInWindow, type EntryInput } from "./diary";
import type { KeyValueStorage } from "./tracker";

const TODAY = "2026-10-07";
const today = () => TODAY;

function mem(init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
}
const e = (o: Partial<EntryInput> = {}): EntryInput => ({ date: TODAY, mood: 4, symptom: null, sys: null, dia: null, glucose: null, weight: null, ...o });

test("save, replace same day, persist and reload", () => {
  const st = mem();
  const s = new DiaryStore(st, today);
  expect(s.saveEntry(e({ weight: 60 })).ok).toBe(true);
  expect(s.saveEntry(e({ weight: 61 })).ok).toBe(true);
  expect(s.state.entries).toHaveLength(1);
  expect(new DiaryStore(st, today).entryOn(TODAY)?.weight).toBe(61);
});

test("rejects empty, future, out-of-range, half blood pressure, sys<=dia", () => {
  const s = new DiaryStore(mem(), today);
  expect(s.saveEntry(e({ mood: null })).ok).toBe(false);
  expect(s.saveEntry(e({ date: "2026-10-08" })).ok).toBe(false);
  expect(s.saveEntry(e({ glucose: 5 })).ok).toBe(false);
  expect(s.saveEntry(e({ sys: 120 })).ok).toBe(false);
  expect(s.saveEntry(e({ sys: 80, dia: 120 })).ok).toBe(false);
  expect(s.saveEntry(e({ sys: 120, dia: 80 })).ok).toBe(true);
  expect(s.saveEntry(e({ date: "2026-10-06", symptom: "x".repeat(201) })).ok).toBe(false);
});

test("toggle taken, no future day, dropTaken", () => {
  const s = new DiaryStore(mem(), today);
  expect(s.toggleTaken("a", TODAY)).toBe(true);
  expect(s.isTaken("a", TODAY)).toBe(true);
  expect(s.toggleTaken("a", "2026-10-09")).toBe(false);
  s.toggleTaken("a", TODAY);
  expect(s.isTaken("a", TODAY)).toBe(false);
  expect(s.state.taken.a).toBeUndefined();
  s.toggleTaken("b", TODAY);
  s.dropTaken("b");
  expect(s.state.taken.b).toBeUndefined();
});

test("corrupt storage recovers empty; import validates; export round-trips", () => {
  const bad = new DiaryStore(mem({ [DIARY_KEY]: "{oops" }), today);
  expect(bad.recovered).toBe(true);
  expect(bad.state.entries).toHaveLength(0);
  const s = new DiaryStore(mem(), today);
  s.saveEntry(e({ glucose: 100 }));
  s.toggleTaken("a", TODAY);
  const t = new DiaryStore(mem(), today);
  expect(t.importJSON(s.exportJSON()).ok).toBe(true);
  expect(t.state).toEqual(s.state);
  expect(t.importJSON('{"v":1,"entries":[{"id":"1","date":"2026-10-07","mood":9}],"taken":{}}').ok).toBe(false);
});

test("clearAll removes stored data; storage failure leaves app usable", () => {
  const st = mem();
  const s = new DiaryStore(st, today);
  s.saveEntry(e());
  expect(s.clearAll()).toBe(true);
  expect(st.data[DIARY_KEY]).toBeUndefined();
  const full: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  const f = new DiaryStore(full, today);
  expect(f.saveEntry(e()).ok).toBe(true);
  expect(f.persistent).toBe(false);
});

test("takenInWindow counts only days since start", () => {
  expect(takenInWindow(["2026-10-07", "2026-10-06", "2026-09-01"], "2026-10-05", TODAY)).toEqual({ took: 2, days: 3 });
  expect(takenInWindow([], "2026-01-01", TODAY)).toEqual({ took: 0, days: 7 });
});

test("series skips nulls and keeps date order", () => {
  const s = new DiaryStore(mem(), today);
  s.saveEntry(e({ date: "2026-10-07", weight: 60 }));
  s.saveEntry(e({ date: "2026-10-05", weight: 61 }));
  s.saveEntry(e({ date: "2026-10-06" }));
  expect(series(s.state.entries, "weight")).toEqual([{ date: "2026-10-05", value: 61 }, { date: "2026-10-07", value: 60 }]);
});

test("markRange ticks every day from start to today, keeps earlier ticks, rejects future end", () => {
  const s = new DiaryStore(mem(), today);
  s.toggleTaken("a", "2026-10-05");
  expect(s.markRange("a", "2026-10-03", TODAY)).toBe(4);
  expect(s.state.taken.a).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
  expect(takenInWindow(s.state.taken.a, "2026-10-03", TODAY)).toEqual({ took: 5, days: 5 });
  expect(s.markRange("a", "2026-10-03", "2026-10-09")).toBe(0);
});

test("dose note: set, trim, clear, too long, persisted, dropped with item, old files without dose still load", () => {
  const st = mem();
  const s = new DiaryStore(st, today);
  expect(s.setDose("a", "  1 เม็ด เช้า ").ok).toBe(true);
  expect(s.doseOf("a")).toBe("1 เม็ด เช้า");
  expect(new DiaryStore(st, today).doseOf("a")).toBe("1 เม็ด เช้า");
  expect(s.setDose("a", "x".repeat(61)).ok).toBe(false);
  s.dropTaken("a");
  expect(s.doseOf("a")).toBe("");
  s.setDose("b", "x"); s.setDose("b", " ");
  expect(s.state.dose.b).toBeUndefined();
  const t = new DiaryStore(mem(), today);
  expect(t.importJSON('{"v":1,"entries":[],"taken":{}}').ok).toBe(true);
});
