import { fireEvent, render, screen, within } from "@testing-library/preact";
import { Diary } from "./Diary";
import { DiaryStore } from "../model/diary";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import type { Analysis } from "../hooks/useAnalysis";

const TODAY = "2026-10-08";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry() {} };

function setup() {
  const store = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  const r = store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-03" });
  if (!r.ok) throw new Error("setup");
  render(<Diary diary={diary} store={store} today={TODAY} analysis={idle} />);
  return { store, diary, id: r.item.id };
}
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)!;

test("หัวเดือนเป็น พ.ศ. มีหัวคอลัมน์ครบ 7 วัน และวันอนาคตกดไม่ได้", () => {
  setup();
  expect(screen.getByRole("heading", { name: "ตุลาคม 2569" })).toBeInTheDocument();
  expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  expect(day("2026-10-09")).toBeDisabled();
  expect(day("2026-10-08")).toHaveAttribute("aria-current", "date");
  expect(screen.getByRole("button", { name: "เดือนถัดไป" })).toBeDisabled();
});

test("เลือกวันย้อนหลังแล้วบันทึกความรู้สึก + กดว่าใช้ ช่องปฏิทินสะท้อนทันที", () => {
  const { diary, id } = setup();
  fireEvent.click(day("2026-10-05"));
  expect(screen.getByRole("heading", { name: "บันทึกของวันที่ 5 ตุลาคม 2569" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "ดี" }));
  fireEvent.click(screen.getByRole("button", { name: "ใช้ ขิง แล้วในวันที่ 5 ตุลาคม 2569" }));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกวันที่ 5 ตุลาคม 2569" }));
  expect(screen.getByRole("status")).toHaveTextContent("บันทึกของวันที่ 5 ตุลาคม 2569แล้ว");
  expect(diary.entryOn("2026-10-05")?.mood).toBe(4);
  expect(diary.isTaken(id, "2026-10-05")).toBe(true);
  expect(day("2026-10-05")).toHaveAccessibleName(/ความรู้สึก ดี · กดบันทึกว่าใช้ 1 จาก 1 รายการ/);
  expect(diary.entryOn(TODAY)).toBeUndefined(); // ไม่กระทบวันนี้
});

test("วันก่อนเริ่มใช้ไม่มีปุ่มกดว่าใช้ (ไม่ผูกรายการกับวันที่ยังไม่เริ่ม)", () => {
  setup();
  fireEvent.click(day("2026-10-02"));
  expect(screen.queryByRole("button", { name: /ใช้ ขิง แล้ว/ })).toBeNull();
});

test("ลบบันทึกของวันที่เลือกได้ และยืนยันก่อนลบ", () => {
  const { diary } = setup();
  diary.saveEntry({ date: "2026-10-06", mood: 3, symptom: null, sys: null, dia: null, glucose: null, weight: null });
  fireEvent.click(day("2026-10-06"));
  const spy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const del = screen.getByRole("button", { name: "ลบบันทึกของวันที่ 6 ตุลาคม 2569" });
  fireEvent.click(del);
  expect(diary.entryOn("2026-10-06")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "ลบบันทึกของวันที่ 6 ตุลาคม 2569" }));
  expect(diary.entryOn("2026-10-06")).toBeUndefined();
  spy.mockRestore();
});

test("คีย์บอร์ด: ลูกศรเลื่อนวัน ไม่ข้ามไปอนาคต PageUp ไปเดือนก่อน แล้วเลื่อนเดือนกลับด้วยปุ่ม", () => {
  setup();
  day("2026-10-08").focus();
  fireEvent.keyDown(day("2026-10-08"), { key: "ArrowLeft" });
  expect(day("2026-10-07")).toHaveFocus();
  fireEvent.keyDown(day("2026-10-07"), { key: "ArrowUp" });
  expect(day("2026-09-30")).toHaveFocus();
  expect(screen.getByRole("heading", { name: "กันยายน 2569" })).toBeInTheDocument();
  fireEvent.keyDown(day("2026-09-30"), { key: "PageDown" });
  expect(day("2026-10-08")).toHaveFocus(); // ถูกจำกัดไม่เกินวันนี้
  fireEvent.keyDown(day("2026-10-08"), { key: "ArrowRight" });
  expect(day("2026-10-08")).toHaveFocus();
});

test("ปุ่มเดือนก่อนหน้า/กลับไปวันนี้ และสรุปรายเดือนนับเฉพาะที่จดเอง ไม่มีคำแปลผล", () => {
  const { diary } = setup();
  diary.saveEntry({ date: "2026-09-20", mood: 2, symptom: null, sys: null, dia: null, glucose: null, weight: null });
  fireEvent.click(screen.getByRole("button", { name: "เดือนก่อนหน้า" }));
  expect(screen.getByText("เดือนนี้: จดบันทึก 1 วัน · กดบันทึกว่าใช้ 0 ครั้ง")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "กลับไปวันนี้" }));
  expect(screen.getByRole("heading", { name: "ตุลาคม 2569" })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/ปลอดภัย|ผิดปกติ|ปกติ|อันตราย/);
});
