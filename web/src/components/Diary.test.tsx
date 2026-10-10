import { fireEvent, render, screen } from "@testing-library/preact";
import { Diary } from "./Diary";
import { ActiveList } from "./ActiveList";
import { DiaryStore } from "../model/diary";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import type { Analysis } from "../hooks/useAnalysis";

const TODAY = "2026-10-07";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry() {} };

function setup() {
  const store = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  return { store, diary };
}

test("บันทึกอารมณ์+อาการแล้วเห็นในสรุป และไม่มีคำแปลผลค่า", () => {
  const { store, diary } = setup();
  render(<Diary diary={diary} store={store} today={TODAY} analysis={idle} />);
  fireEvent.click(screen.getByRole("radio", { name: "ดี" }));
  fireEvent.input(screen.getByLabelText(/อาการหรือสิ่งที่อยากจดไว้/), { target: { value: "ปวดหัวเล็กน้อย" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกวันนี้" }));
  expect(screen.getByRole("status")).toHaveTextContent("บันทึกของวันนี้แล้ว");
  expect(diary.entryOn(TODAY)).toMatchObject({ mood: 4, symptom: "ปวดหัวเล็กน้อย" });
  expect(screen.getByText(/อาการ ปวดหัวเล็กน้อย/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/ปลอดภัย|ผิดปกติ|ปกติ|อันตราย/);
});

test("ค่าสุขภาพต้องติ๊กยินยอมก่อนจึงมีช่อง และค่านอกช่วงถูกปฏิเสธ", () => {
  const { store, diary } = setup();
  render(<Diary diary={diary} store={store} today={TODAY} analysis={idle} />);
  expect(screen.queryByLabelText(/น้ำตาลในเลือด/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.input(screen.getByLabelText(/น้ำตาลในเลือด/), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกวันนี้" }));
  expect(screen.getByRole("alert")).toHaveTextContent("น้ำตาลในเลือดต้องอยู่ระหว่าง");
  expect(diary.state.entries).toHaveLength(0);
  fireEvent.input(screen.getByLabelText(/น้ำตาลในเลือด/), { target: { value: "110" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกวันนี้" }));
  expect(diary.entryOn(TODAY)?.glucose).toBe(110);
  expect(screen.getByText(/บันทึกไว้ 110 mg\/dL/)).toBeInTheDocument();
});

test("ปุ่มใช้แล้ววันนี้ สลับสถานะ และการลบรายการล้างเช็กอินของรายการนั้น", () => {
  const { store, diary } = setup();
  const r = store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-05" });
  if (!r.ok) throw new Error("setup");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ActiveList store={store} today={TODAY} analysis={idle} diary={diary} />);
  const b = screen.getByRole("button", { name: "ใช้แล้ววันนี้ ขิง" });
  expect(b).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(b);
  expect(screen.getByRole("button", { name: "ใช้แล้ววันนี้ ขิง" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("img", { name: /กดบันทึกว่าใช้ 1 จาก 3 วันล่าสุด/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลบ ขิง" }));
  expect(diary.state.taken[r.item.id]).toBeUndefined();
});
