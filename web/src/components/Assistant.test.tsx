import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Assistant } from "./Assistant";
import { AssistantLog } from "../model/assistantLog";
import { DiaryStore } from "../model/diary";
import { ReminderStore } from "../model/reminder";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import type { Analysis } from "../hooks/useAnalysis";
import type { AnalyzeResult } from "../types";
import { META } from "../test/fixtures";

const TODAY = "2026-10-08";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry() {} };
const R = (tool: string, extra: object = {}) => ({ route: { tool, item_ids: [], time: "", page: "", mood: 0, ...extra } });

let calls: { url: string; body: any }[];
function api(handlers: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const h = handlers[url];
    return new Response(JSON.stringify(h ?? {}), { status: h ? 200 : 503, headers: { "content-type": "application/json" } });
  }));
}
afterEach(() => vi.unstubAllGlobals());

function setup(items: [string, string][] = [["khing", "ขิง"], ["warfarin", "warfarin"]], a: Analysis = idle) {
  const store = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  const reminder = new ReminderStore(mem());
  for (const [ref, label] of items) store.addItem({ kind: ref === "warfarin" ? "drug" : "herb", ref, label, start_date: "2026-10-03" });
  const go = vi.fn();
  render(<Assistant store={store} diary={diary} meta={META} today={TODAY} analysis={a} go={go} reminder={reminder} log={new AssistantLog()} />);
  return { store, diary, reminder, go };
}
const say = (t: string) => {
  fireEvent.input(screen.getByLabelText("พิมพ์ข้อความถึงผู้ช่วย"), { target: { value: t } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
};

test("หน้าเปล่า: มีตัวอย่างคำสั่ง ขอบเขต และข้อความไม่ใช่การวินิจฉัย ไม่มีคำว่าปลอดภัย", () => {
  setup();
  expect(screen.getByText(/ถามหรือสั่งผู้ช่วยได้เลย/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "สรุปวันนี้" })).toBeInTheDocument();
  expect(document.body.textContent).toContain("ไม่ใช่การวินิจฉัย");
  expect(document.body.textContent).not.toMatch(/ปลอดภัย/);
});

test("สรุปวันนี้: AI เลือกเครื่องมือ แล้วหน้าเว็บคำนวณการ์ดเอง (ส่งแค่ข้อความกับชื่อรายการ)", async () => {
  api({ "/api/assistant": R("show_brief") });
  setup();
  say("สรุปวันนี้");
  expect(await screen.findByText(/ใช้แล้ว 0 จาก 2 รายการ/)).toBeInTheDocument();
  expect(calls[0].body).toMatchObject({ text: "สรุปวันนี้", items: [{ label: "ขิง" }, { label: "warfarin" }] });
  expect(Object.keys(calls[0].body.items[0]).sort()).toEqual(["id", "label"]);
});

test("บันทึกว่าใช้: ทำทันที มีเลิกทำ; AI คืนรหัสที่ไม่ใช่ของผู้ใช้ = ไม่บันทึก", async () => {
  const { store, diary } = setup();
  const id = store.active()[0].id;
  api({ "/api/assistant": R("mark_taken", { item_ids: [id] }) });
  say("กินขิงแล้ว");
  expect(await screen.findByText(/บันทึกแล้ว: ใช้ ขิง วันนี้/)).toBeInTheDocument();
  expect(diary.isTaken(id, TODAY)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
  expect(diary.isTaken(id, TODAY)).toBe(false);

  api({ "/api/assistant": R("mark_taken", { item_ids: ["ไม่ใช่ของเรา"] }) });
  say("กินขิงแล้ว");
  expect(await screen.findByText(/ยังไม่เข้าใจว่าจะบันทึกรายการไหน/)).toBeInTheDocument();
  expect(diary.isTaken(id, TODAY)).toBe(false);
});

test("ถามความรู้: AI เลือก ask แล้วตอบด้วยตัวตอบเดิมที่มีป้ายที่มา; เลือกเครื่องมือไม่ได้ก็ถามได้", async () => {
  setup();
  api({ "/api/assistant": R("ask"), "/api/ask": { answer: { text_th: "ข้อความจากฐานข้อมูล", source: "database", cites: [], follow_ups: [] } } });
  say("ขิงมีข้อควรระวังอะไร");
  expect(await screen.findAllByText("ข้อความจากฐานข้อมูล")).toHaveLength(2); // ป้ายที่มา + เนื้อหา
  expect(calls.find((c) => c.url === "/api/ask")!.body).toMatchObject({ question: "ขิงมีข้อควรระวังอะไร" });

  api({ "/api/ask": { answer: { text_th: "คำตอบสำรอง", source: "database", cites: [], follow_ups: [] } } }); // /api/assistant = 503
  say("คำถามอีกข้อ");
  expect(await screen.findByText("คำตอบสำรอง")).toBeInTheDocument();
});

test("ตรวจให้หน่อย: ไม่มีรายการ/ผลยังไม่พร้อม/มีผล แสดงจากผลที่เซิร์ฟเวอร์ตรวจเท่านั้น", async () => {
  api({ "/api/assistant": R("show_check") });
  setup([]);
  say("ตรวจให้หน่อย");
  expect(await screen.findByText(/ยังไม่มีรายการที่ใช้อยู่/)).toBeInTheDocument();
});

test("ตรวจให้หน่อย: มีคำเตือน แสดงระดับ ข้อความ และขอบเขต", async () => {
  api({ "/api/assistant": R("show_check") });
  const res = { flags: [{ flag_id: "f1", severity: "caution", message_th: "ขิง: ข้อความคำเตือนทดสอบ" }], aggregates: [], coverage: { herbs_in_db: 12, drug_classes_in_db: 7, unknown_inputs: [], not_checked: [] } } as unknown as AnalyzeResult;
  setup(undefined, { ...idle, status: "ok", result: res, summary: { headline_th: "พบคำเตือน 1 รายการจากฐานข้อมูลนี้" } as any, current: true });
  say("ตรวจให้หน่อย");
  expect(await screen.findByText("พบคำเตือน 1 รายการจากฐานข้อมูลนี้")).toBeInTheDocument();
  expect(screen.getByText("ขิง: ข้อความคำเตือนทดสอบ")).toBeInTheDocument();
  expect(screen.getAllByText(/สมุนไพร 12 จาก 50 ชนิด/).length).toBeGreaterThan(0);
});

test("เพิ่มรายการ: ต้องกดเพิ่มก่อนจึงเพิ่มจริง (แยกจาก AI ด้วย /api/parse) เอาติ๊กออกได้", async () => {
  const { store } = setup([]);
  api({ "/api/assistant": R("add_items"), "/api/parse": { herbs: [{ id: "khing", days_in_use: 3 }], drugs: ["warfarin"], unmatched: [], dropped: 0 } });
  say("เพิ่มขิงที่ใช้มา 3 วัน กับ warfarin");
  expect(await screen.findByText(/ยังไม่มีอะไรถูกเพิ่ม/)).toBeInTheDocument();
  expect(store.active()).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: /warfarin/ })); // เอาออก
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม 1 รายการ" }));
  expect(await screen.findByText(/เพิ่ม ขิง แล้ว/)).toBeInTheDocument();
  expect(store.active().map((i) => i.label)).toEqual(["ขิง"]);
});

test("ตั้งเตือน/ปิดเตือน และเลิกทำ", async () => {
  const { reminder } = setup([]);
  api({ "/api/assistant": R("set_reminder", { time: "23:59" }) });
  say("เตือนตอนสี่ทุ่มห้าสิบเก้า");
  expect(await screen.findByText(/ตั้งเตือนทุกวันเวลา 23:59 แล้ว/)).toBeInTheDocument();
  expect(reminder.state.time).toBe("23:59");
  fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
  expect(reminder.state.time).toBeNull();
  api({ "/api/assistant": R("set_reminder", { time: "off" }) });
  say("ปิดเตือน");
  expect(await screen.findByText("ปิดเตือนแล้ว")).toBeInTheDocument();
});

test("บอกความรู้สึก: รวมกับบันทึกเดิมของวันนี้ไม่ลบค่าอื่น และเลิกทำคืนค่าเดิมได้", async () => {
  const { diary } = setup([]);
  diary.saveEntry({ date: TODAY, mood: 2, symptom: "ปวดหัว", sys: null, dia: null, glucose: null, weight: 60 });
  api({ "/api/assistant": R("log_mood", { mood: 4 }) });
  say("วันนี้รู้สึกดี");
  expect(await screen.findByText(/บันทึกความรู้สึกวันนี้แล้ว: ดี \(4 จาก 5\)/)).toBeInTheDocument();
  expect(diary.entryOn(TODAY)).toMatchObject({ mood: 4, symptom: "ปวดหัว", weight: 60 });
  fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
  expect(diary.entryOn(TODAY)).toMatchObject({ mood: 2, symptom: "ปวดหัว", weight: 60 });
});

test("เปิดหน้าอื่น: เรียก go และแจ้ง; หน้าที่ไม่รู้จักไม่ถูกเปิด (กลายเป็นคำถาม)", async () => {
  const { go } = setup();
  api({ "/api/assistant": R("go_to", { page: "diary" }) });
  say("ไปปฏิทิน");
  expect(await screen.findByText("เปิดหน้า บันทึก แล้ว")).toBeInTheDocument();
  expect(go).toHaveBeenCalledWith("diary");
  api({ "/api/assistant": R("go_to", { page: "https://x.example" }), "/api/ask": { answer: { text_th: "ตอบเป็นคำถาม", source: "refusal", cites: [], follow_ups: [] } } });
  say("ไปที่อื่น");
  await waitFor(() => expect(screen.getByText("ตอบเป็นคำถาม")).toBeInTheDocument());
  expect(go).toHaveBeenCalledTimes(1);
});
