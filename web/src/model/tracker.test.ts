import { KeyValueStorage, STORAGE_KEY, TrackerStore } from "./tracker";

const TODAY = "2026-10-07";
const today = () => TODAY;

function memStorage(init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}
const herb = (ref = "khing", start = "2026-10-01") => ({ kind: "herb" as const, ref, label: "ขิง", start_date: start });

test("add, stop, remove", () => {
  const s = new TrackerStore(memStorage(), today);
  const r = s.addItem(herb());
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(s.state.items).toHaveLength(1);
  expect(r.item.end_date).toBeNull();
  s.stopItem(r.item.id);
  expect(s.state.items[0].end_date).toBe(TODAY);
  s.removeItem(r.item.id);
  expect(s.state.items).toHaveLength(0);
});

test("duplicate active kind+ref rejected; other kind ok; re-add right after stop ok", () => {
  const s = new TrackerStore(memStorage(), today);
  const a = s.addItem(herb());
  expect(s.addItem(herb()).ok).toBe(false);
  expect(s.addItem({ ...herb(), kind: "drug" }).ok).toBe(true);
  if (!a.ok) throw new Error("setup");
  s.stopItem(a.item.id);
  expect(s.active().map((i) => i.id)).not.toContain(a.item.id);
  expect(s.history().map((i) => i.id)).toContain(a.item.id);
  expect(s.addItem(herb()).ok).toBe(true);
});

test("active herbs capped at 50, drugs at 30", () => {
  const s = new TrackerStore(memStorage(), today);
  for (let i = 0; i < 50; i++) expect(s.addItem(herb("h" + i)).ok).toBe(true);
  expect(s.addItem(herb("h50")).ok).toBe(false);
  for (let i = 0; i < 30; i++) expect(s.addItem({ ...herb("d" + i), kind: "drug" }).ok).toBe(true);
  expect(s.addItem({ ...herb("d30"), kind: "drug" }).ok).toBe(false);
  expect(s.addItem(herb("x".repeat(51), "2026-10-01")).ok).toBe(false);
});

test("validation: bad label, future start, too old start", () => {
  const s = new TrackerStore(memStorage(), today);
  expect(s.addItem({ ...herb(), label: "  " }).ok).toBe(false);
  expect(s.addItem({ ...herb(), label: "x".repeat(101) }).ok).toBe(false);
  const f = s.addItem(herb("a", "2026-10-08"));
  expect(f.ok === false && f.message).toMatch(/อนาคต/);
  expect(s.addItem(herb("b", "2025-10-07")).ok).toBe(false);
  expect(s.state.items).toHaveLength(0);
});

test("active/history split", () => {
  const s = new TrackerStore(memStorage(), today);
  const a = s.addItem(herb("a"));
  s.addItem(herb("b"));
  if (!a.ok) throw new Error("setup");
  s.stopItem(a.item.id);
  expect(s.active().map((i) => i.ref)).toEqual(["b"]);
  expect(s.history().map((i) => i.ref)).toEqual(["a"]);
});

test("storage null: works in memory, persistent=false", () => {
  const s = new TrackerStore(null, today);
  expect(s.persistent).toBe(false);
  expect(s.addItem(herb()).ok).toBe(true);
  expect(s.state.items).toHaveLength(1);
});

test("setItem throws: no throw, persistent=false, keeps working", () => {
  const st = memStorage();
  st.setItem = () => {
    throw new Error("quota");
  };
  const s = new TrackerStore(st, today);
  expect(s.persistent).toBe(true);
  expect(() => s.addItem(herb())).not.toThrow();
  expect(s.persistent).toBe(false);
  expect(s.state.items).toHaveLength(1);
});

test("persists to storage and reloads", () => {
  const st = memStorage();
  new TrackerStore(st, today).addItem(herb());
  expect(st.data[STORAGE_KEY]).toBeDefined();
  expect(new TrackerStore(st, today).state.items).toHaveLength(1);
});

test("corrupted storage: empty state, recovered=true, no throw", () => {
  for (const bad of ["{not json", "[]", '{"v":2,"items":[],"profile":{}}', '{"v":1,"items":"x"}', "null"]) {
    const s = new TrackerStore(memStorage({ [STORAGE_KEY]: bad }), today);
    expect(s.state.items).toEqual([]);
    expect(s.recovered).toBe(true);
  }
  expect(new TrackerStore(memStorage(), today).recovered).toBe(false);
});

test("export/import round-trip incl. profile", () => {
  const a = new TrackerStore(memStorage(), today);
  a.addItem(herb());
  a.setProfile({ age: 40, pregnant: "no", breastfeeding: null, conditions: ["ความดัน"] });
  const text = a.exportJSON();
  const b = new TrackerStore(memStorage(), today);
  expect(b.importJSON(text)).toEqual({ ok: true });
  expect(b.state).toEqual(a.state);
});

describe("import rejects and leaves state unchanged", () => {
  const good = () => {
    const s = new TrackerStore(memStorage(), today);
    s.addItem(herb());
    return s;
  };
  const base = () => JSON.parse(good().exportJSON());
  const bad: [string, () => string][] = [
    ["not json", () => "{oops"],
    ["oversize", () => "x".repeat(100 * 1024 + 1)],
    ["v:2", () => JSON.stringify({ ...base(), v: 2 })],
    ["bad date", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], start_date: "2026-02-30" }] })],
    ["bad end date", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], end_date: "yesterday" }] })],
    ["wrong type", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], ref: 5 }] })],
    ["bad kind", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], kind: "food" }] })],
    ["too many items", () => JSON.stringify({ ...base(), items: Array.from({ length: 201 }, (_, i) => ({ ...base().items[0], id: "i" + i })) })],
    ["conditions not strings", () => JSON.stringify({ ...base(), profile: { ...base().profile, conditions: [1] } })],
    ["bad profile age", () => JSON.stringify({ ...base(), profile: { ...base().profile, age: "x" } })],
    ["items not array", () => JSON.stringify({ ...base(), items: {} })],
    ["array root", () => "[]"],
    ["future end date", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], end_date: "2026-10-08" }] })],
    ["future start date", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], start_date: "2026-10-08" }] })],
    ["51 active herbs", () => JSON.stringify({ ...base(), items: Array.from({ length: 51 }, (_, i) => ({ ...base().items[0], id: "i" + i, ref: "r" + i })) })],
    ["long herb ref", () => JSON.stringify({ ...base(), items: [{ ...base().items[0], ref: "x".repeat(51) }] })],
    ["long condition", () => JSON.stringify({ ...base(), profile: { ...base().profile, conditions: ["x".repeat(51)] } })],
  ];
  test.each(bad)("%s", (_n, make) => {
    const s = good();
    const before = JSON.stringify(s.state);
    const r = s.importJSON(make());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(s.state)).toBe(before);
  });
});

test("import ignores prototype-pollution keys and unknown fields", () => {
  const s = new TrackerStore(memStorage(), today);
  const text =
    '{"v":1,"__proto__":{"polluted":1},"items":[{"id":"a","kind":"herb","ref":"khing","label":"ขิง","start_date":"2026-10-01","end_date":null,"__proto__":{"x":1},"extra":1}],"profile":{"age":null,"pregnant":null,"breastfeeding":null,"conditions":[],"constructor":{"y":1}}}';
  expect(s.importJSON(text).ok).toBe(true);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.keys(s.state.items[0]).sort()).toEqual(["end_date", "id", "kind", "label", "ref", "start_date"]);
  expect(Object.keys(s.state.profile).sort()).toEqual(["age", "breastfeeding", "conditions", "pregnant"]);
});

test("clearAll removes key and empties state", () => {
  const st = memStorage();
  const s = new TrackerStore(st, today);
  s.addItem(herb());
  expect(s.clearAll()).toBe(true);
  expect(st.data[STORAGE_KEY]).toBeUndefined();
  expect(s.state.items).toEqual([]);
});

test("clearAll reports failure when storage removal throws", () => {
  const st = memStorage();
  st.removeItem = () => { throw new Error("blocked"); };
  const s = new TrackerStore(st, today);
  s.addItem(herb());
  expect(s.clearAll()).toBe(false);
  expect(new TrackerStore(null, today).clearAll()).toBe(true); // ไม่มีที่เก็บ = ไม่มีอะไรค้าง
});

test("subscribers called on change; unsubscribe works", () => {
  const s = new TrackerStore(memStorage(), today);
  const fn = vi.fn();
  const off = s.subscribe(fn);
  s.addItem(herb());
  expect(fn).toHaveBeenCalledTimes(1);
  s.setProfile({ age: 5, pregnant: null, breastfeeding: null, conditions: [] });
  expect(fn).toHaveBeenCalledTimes(2);
  off();
  s.clearAll();
  expect(fn).toHaveBeenCalledTimes(2);
});

test("old start date imports fine (year-old backup)", () => {
  const s = new TrackerStore(memStorage(), today);
  const it = { id: "a", kind: "herb", ref: "khing", label: "ขิง", start_date: "2020-01-01", end_date: null };
  const p = { age: null, pregnant: null, breastfeeding: null, conditions: [] };
  expect(s.importJSON(JSON.stringify({ v: 1, items: [it], profile: p })).ok).toBe(true);
});

test("stored future date is treated as corrupted", () => {
  const it = { id: "a", kind: "herb", ref: "k", label: "ขิง", start_date: "2026-10-01", end_date: "2026-12-01" };
  const st = { v: 1, items: [it], profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] } };
  const s = new TrackerStore(memStorage({ [STORAGE_KEY]: JSON.stringify(st) }), today);
  expect(s.recovered).toBe(true);
  expect(s.state.items).toEqual([]);
});

test("setProfile validates; bad profile never saved", () => {
  const st = memStorage();
  const s = new TrackerStore(st, today);
  s.addItem(herb());
  const before = st.data[STORAGE_KEY];
  const bads = [
    { age: 121, pregnant: null, breastfeeding: null, conditions: [] },
    { age: 1.5, pregnant: null, breastfeeding: null, conditions: [] },
    { age: null, pregnant: "maybe", breastfeeding: null, conditions: [] },
    { age: null, pregnant: null, breastfeeding: null, conditions: [""] },
    { age: null, pregnant: null, breastfeeding: null, conditions: ["x".repeat(51)] },
  ];
  for (const b of bads) expect(s.setProfile(b as never).ok).toBe(false);
  expect(st.data[STORAGE_KEY]).toBe(before);
  expect(s.state.profile.age).toBeNull();
  expect(new TrackerStore(st, today).state.items).toHaveLength(1);
});

test("knownConditions rejects unknown codes in setProfile and import", () => {
  const s = new TrackerStore(memStorage(), today, { knownConditions: ["htn"] });
  const p = { age: null, pregnant: null, breastfeeding: null, conditions: ["htn"] };
  expect(s.setProfile(p).ok).toBe(true);
  expect(s.setProfile({ ...p, conditions: ["zzz"] }).ok).toBe(false);
  expect(s.importJSON(JSON.stringify({ v: 1, items: [], profile: { ...p, conditions: ["zzz"] } })).ok).toBe(false);
  expect(s.state.profile.conditions).toEqual(["htn"]);
});

test("id fallback when crypto.randomUUID is unavailable", () => {
  vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(171) });
  const s = new TrackerStore(memStorage(), today);
  const r = s.addItem(herb());
  vi.unstubAllGlobals();
  expect(r.ok && r.item.id).toMatch(/^[0-9a-f]{32}$/);
});

test("getItem throwing: persistent=false, not recovered", () => {
  const st = memStorage();
  st.getItem = () => {
    throw new Error("denied");
  };
  const s = new TrackerStore(st, today);
  expect(s.persistent).toBe(false);
  expect(s.recovered).toBe(false);
});

test("maximal export (200 stopped items, 100-char Thai text) re-imports; export is compact", () => {
  const th = "ก".repeat(100);
  const items = Array.from({ length: 200 }, (_, i) => ({ id: "id" + i, kind: "drug", ref: th, label: th, start_date: "2026-01-01", end_date: "2026-02-01" }));
  const p = { age: 40, pregnant: null, breastfeeding: null, conditions: Array.from({ length: 50 }, () => "x".repeat(50)) };
  const a = new TrackerStore(memStorage(), today);
  expect(a.importJSON(JSON.stringify({ v: 1, items, profile: p })).ok).toBe(true);
  const text = a.exportJSON();
  expect(text).not.toContain("\n");
  expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(256 * 1024);
  expect(new TrackerStore(memStorage(), today).importJSON(text).ok).toBe(true);
});
