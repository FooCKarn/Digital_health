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

// --- ส่วน AI (จำลอง fetch) และเตือน ---
import { waitFor } from "@testing-library/preact";
import { ReminderStore } from "../model/reminder";

function mockApi(handlers: Record<string, unknown>) {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const h = handlers[url];
    return new Response(JSON.stringify(h ?? {}), { status: h ? 200 : 503, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

test("สรุปโดย AI: ส่งเฉพาะตัวเลขกับชื่อรายการที่ยังไม่กด เมื่อกดเท่านั้น และแสดงป้ายที่มา", async () => {
  const calls = mockApi({ "/api/brief": { brief: { source: "llm", rejected_reason: null, summary_th: "วันนี้ใช้แล้ว 0 จาก 1 รายการ" } } });
  setup([["khing", "ขิง"]]);
  expect(calls).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "ให้ AI เรียบเรียงสรุปวันนี้ (ไม่บังคับ)" }));
  expect(await screen.findByText("วันนี้ใช้แล้ว 0 จาก 1 รายการ")).toBeInTheDocument();
  expect(screen.getByText(/AI เรียบเรียงจากข้อมูลด้านบน/)).toBeInTheDocument();
  expect(calls[0].body).toMatchObject({ item_count: 1, taken_count: 0, untaken: ["ขิง"] });
  expect(Object.keys(calls[0].body).sort()).toEqual(["item_count", "longest_days", "no_entry_today", "taken_count", "untaken", "warnings"]);
});

test("สรุปโดย AI ใช้ไม่ได้: แจ้งข้อความตายตัว สรุปด้านบนยังอยู่", async () => {
  mockApi({});
  setup([["khing", "ขิง"]]);
  fireEvent.click(screen.getByRole("button", { name: "ให้ AI เรียบเรียงสรุปวันนี้ (ไม่บังคับ)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ตอนนี้ใช้ AI ไม่ได้");
  expect(screen.getByText("ใช้แล้ว 0 จาก 1 รายการ")).toBeInTheDocument();
});

test("บอกผู้ช่วย: เสนอรายการ ยังไม่บันทึกจนกดยืนยัน ยกเลิกแล้วไม่บันทึก", async () => {
  const { store, diary } = setup([["khing", "ขิง"]]);
  const id = store.active()[0].id;
  mockApi({ "/api/intent": { intent: { action: "taken", item_ids: [id] } } });
  fireEvent.input(screen.getByLabelText("พิมพ์สิ่งที่ต้องการบันทึก"), { target: { value: "กินขิงแล้ว" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งให้ผู้ช่วย" }));
  expect(await screen.findByText("เสนอให้บันทึกว่าใช้ ขิง วันนี้")).toBeInTheDocument();
  expect(diary.isTaken(id, TODAY)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(diary.isTaken(id, TODAY)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "ส่งให้ผู้ช่วย" }));
  fireEvent.click(await screen.findByRole("button", { name: "ยืนยัน" }));
  expect(diary.isTaken(id, TODAY)).toBe(true);
});

test("บอกผู้ช่วย: AI ตอบ none หรือใช้ไม่ได้ ไม่บันทึกอะไร", async () => {
  const { store, diary } = setup([["khing", "ขิง"]]);
  mockApi({ "/api/intent": { intent: { action: "none", item_ids: [] } } });
  fireEvent.input(screen.getByLabelText("พิมพ์สิ่งที่ต้องการบันทึก"), { target: { value: "ขิงดีไหม" } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งให้ผู้ช่วย" }));
  expect(await screen.findByText(/ยังไม่เข้าใจว่าจะบันทึกอะไร/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ยืนยัน" })).toBeNull();
  expect(diary.isTaken(store.active()[0].id, TODAY)).toBe(false);
  mockApi({});
  fireEvent.click(screen.getByRole("button", { name: "ส่งให้ผู้ช่วย" }));
  await waitFor(() => expect(screen.getByText(/ตอนนี้ใช้ AI ไม่ได้/)).toBeInTheDocument());
});

test("ตั้งเตือน: เปิด/ปิดได้ และข้อความบอกข้อจำกัดว่าต้องเปิดหน้าค้างไว้ ไม่ส่งออกจากเครื่อง", () => {
  const store = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  const reminder = new ReminderStore(mem());
  render(<Assistant store={store} diary={diary} meta={META} today={TODAY} analysis={idle} go={vi.fn()} ask={vi.fn()} reminder={reminder} />);
  expect(document.body.textContent).toContain("เปิดหน้าเว็บนี้ค้างไว้");
  fireEvent.input(screen.getByLabelText("เวลา"), { target: { value: "21:15" } });
  fireEvent.click(screen.getByRole("button", { name: "เปิดเตือน" }));
  expect(reminder.state.time).toBe("21:15");
  fireEvent.click(screen.getByRole("button", { name: /ปิดเตือน/ }));
  expect(reminder.state.time).toBeNull();
});
