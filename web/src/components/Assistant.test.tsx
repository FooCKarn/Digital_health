import { fireEvent, render, screen } from "@testing-library/preact";
import { Assistant } from "./Assistant";
import { DiaryStore } from "../model/diary";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import type { Analysis } from "../hooks/useAnalysis";
import { META } from "../test/fixtures";

const TODAY = "2026-10-08";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry() {} };

function setup(items: [string, string][] = [], a: Analysis = idle) {
  const store = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  for (const [ref, label] of items) store.addItem({ kind: "herb", ref, label, start_date: "2026-10-03" });
  const go = vi.fn(); const ask = vi.fn();
  render(<Assistant store={store} diary={diary} meta={META} today={TODAY} analysis={a} go={go} ask={ask} />);
  return { store, diary, go, ask };
}

test("ไม่มีรายการ: ชวนเพิ่ม และยังมีขอบเขต/ไม่ใช่การวินิจฉัย", () => {
  setup();
  expect(screen.getByText(/ยังไม่มีรายการที่ใช้อยู่/)).toBeInTheDocument();
  expect(document.body.textContent).toContain("ไม่ใช่การวินิจฉัย");
  expect(document.body.textContent).not.toMatch(/ปลอดภัย/);
});

test("มีรายการ: แสดงที่ยังไม่ได้กดว่าใช้ กดแล้วนับเพิ่ม และข้อความอัปเดต", () => {
  const { diary } = setup([["khing", "ขิง"], ["garlic", "กระเทียม"]]);
  expect(screen.getByText("ใช้แล้ว 0 จาก 2 รายการ")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกว่าใช้ ขิง วันนี้" }));
  expect(diary.isTaken(diary.state.taken && Object.keys(diary.state.taken)[0], TODAY)).toBe(true);
  expect(screen.getByText("ใช้แล้ว 1 จาก 2 รายการ")).toBeInTheDocument();
  expect(screen.getByText("ขิง ใช้มา 6 วัน")).toBeInTheDocument();
});

test("ทางลัดเรียกไปหน้าอื่น และถามผู้ช่วยด้วยประโยคตายตัว", () => {
  const { go, ask } = setup([["khing", "ขิง"]]);
  fireEvent.click(screen.getByRole("button", { name: "จดบันทึกวันนี้" }));
  expect(go).toHaveBeenCalledWith("diary");
  fireEvent.click(screen.getByRole("button", { name: "ใบสรุปสำหรับเภสัชกร" }));
  expect(go).toHaveBeenCalledWith("mine");
  fireEvent.click(screen.getByRole("button", { name: "ควรถามเภสัชกรอะไร" }));
  expect(ask).toHaveBeenCalledWith("ควรถามเภสัชกรว่าอะไร");
});
