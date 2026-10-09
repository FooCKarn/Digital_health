import { buildPayload, itemStatus, rowView, unsentRefs } from "./panel";
import { TrackerStore, kindLabel, type KeyValueStorage, type TrackerItem } from "./tracker";
import { body, flag, T } from "../test/fixtures";

const mem = (): KeyValueStorage => { const d = new Map<string, string>(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) }; };
const item = (kind: TrackerItem["kind"], ref: string, label = ref): TrackerItem => ({ id: `${kind}-${ref}`, kind, ref, label, start_date: T, end_date: null });
const profile = { age: null, pregnant: null, breastfeeding: null, conditions: [] };

test("ตำรับเป็นรายการชนิดหนึ่ง ป้ายแสดงว่า ตำรับ และเก็บ/โหลดจากที่เก็บได้", () => {
  const st = mem();
  const s = new TrackerStore(st, () => T);
  expect(s.addItem({ kind: "formula", ref: "tonic", label: "ตำรับทดสอบ", start_date: T }).ok).toBe(true);
  expect(s.addItem({ kind: "formula", ref: "tonic", label: "ตำรับทดสอบ", start_date: T }).ok).toBe(false); // ซ้ำไม่ได้
  expect(kindLabel("formula")).toBe("ตำรับ");
  const again = new TrackerStore(st, () => T);
  expect(again.active().map((i) => i.kind)).toEqual(["formula"]);
  expect(new TrackerStore(mem(), () => T).importJSON(s.exportJSON()).ok).toBe(true);
});

test("นำเข้าไฟล์ที่มีชนิดรายการแปลกถูกปฏิเสธ", () => {
  const s = new TrackerStore(mem(), () => T);
  const bad = JSON.stringify({ v: 1, items: [{ id: "a", kind: "potion", ref: "x", label: "x", start_date: T, end_date: null }], profile });
  expect(s.importJSON(bad).ok).toBe(false);
});

test("โควตา 50 รายการของสมุนไพรและตำรับนับรวมกัน (ส่งในอาร์เรย์ herbs เดียวกัน)", () => {
  const s = new TrackerStore(mem(), () => T);
  for (let i = 0; i < 49; i++) expect(s.addItem({ kind: "herb", ref: `h${i}`, label: `h${i}`, start_date: T }).ok).toBe(true);
  expect(s.addItem({ kind: "formula", ref: "tonic", label: "ตำรับ", start_date: T }).ok).toBe(true);
  const r = s.addItem({ kind: "herb", ref: "h50", label: "h50", start_date: T });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toContain("สมุนไพรและตำรับ");
  expect(s.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T }).ok).toBe(true); // ยาไม่เกี่ยว
});

test("payload ส่งตำรับไปในอาร์เรย์ herbs พร้อมจำนวนวัน ไม่ส่งชื่อที่ตั้งเอง", () => {
  const p = buildPayload([item("formula", "tonic", "ตำรับที่ฉันตั้งชื่อเอง"), item("drug", "warfarin")], profile, T)!;
  expect(p.herbs).toEqual([{ id: "tonic", days_in_use: 1 }]);
  expect(JSON.stringify(p)).not.toContain("ตั้งชื่อเอง");
  expect(buildPayload([item("drug", "warfarin")], profile, T)).toBeNull(); // ไม่มีสมุนไพร/ตำรับ = ไม่ตรวจ
});

test("แถวของตำรับขึ้นสถานะมีธงเมื่อธงอ้าง id ตำรับ และไม่ขึ้นเมื่อไม่มีธง (ไม่ปะปนกับสมุนไพร)", () => {
  const it = item("formula", "tonic");
  const sum = { herbs: [{ id: "tonic", name_th: "ตำรับทดสอบ", part: null, days_in_use: 1 }] };
  const withFlag = body([flag({ herb_id: "tonic", severity: "avoid" })], { summary: sum });
  const a = { result: withFlag.result, summary: withFlag.summary, current: true, loading: false };
  expect(rowView(it, a, unsentRefs([it]))).toBe("avoid");
  expect(itemStatus(it, withFlag.result)).toBe("flagged");
  const noFlag = body([], { summary: sum });
  const b = { result: noFlag.result, summary: noFlag.summary, current: true, loading: false };
  expect(rowView(it, b, unsentRefs([it]))).toBe("no_flag");
  // ธงของสมุนไพรชื่อ id เดียวกัน ≠ ตำรับอื่น
  expect(itemStatus(item("formula", "other"), withFlag.result)).toBe("no_flag");
});
