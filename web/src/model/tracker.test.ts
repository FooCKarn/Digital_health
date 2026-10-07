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

test("duplicate active kind+ref rejected; allowed again after stop; other kind ok", () => {
  const s = new TrackerStore(memStorage(), today);
  const a = s.addItem(herb());
  expect(s.addItem(herb()).ok).toBe(false);
  expect(s.addItem({ ...herb(), kind: "drug" }).ok).toBe(true);
  if (a.ok) s.stopItem(a.item.id);
  // หยุดวันนี้ ยังนับ active (end_date >= วันนี้) จึงยังซ้ำ
  expect(s.addItem(herb()).ok).toBe(false);
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
  const st = memStorage();
  const s = new TrackerStore(st, today);
  const a = s.addItem(herb("a"));
  const b = s.addItem(herb("b"));
  if (!a.ok || !b.ok) throw new Error("setup");
  s.stopItem(a.item.id);
  // ย้อน end_date ของ a เป็นเมื่อวานผ่าน import เพื่อให้เป็นประวัติ
  const exp = JSON.parse(s.exportJSON());
  exp.items[0].end_date = "2026-10-06";
  expect(s.importJSON(JSON.stringify(exp)).ok).toBe(true);
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
  s.clearAll();
  expect(st.data[STORAGE_KEY]).toBeUndefined();
  expect(s.state.items).toEqual([]);
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
