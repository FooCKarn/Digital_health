import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { setLang } from "../i18n";
import { TrackerStore } from "../model/tracker";
import { body, flush, META, respond, T } from "../test/fixtures";
import { ThisPeriod } from "./ThisPeriod";

const scroll = vi.fn();
beforeAll(() => { Element.prototype.scrollIntoView = scroll; });

let store: TrackerStore;
beforeEach(() => { vi.useFakeTimers(); store = new TrackerStore(null, () => T); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("ยังไม่มีรายการ: บอกให้เริ่มจากการเพิ่ม และไม่โชว์ตัวเลขศูนย์ล้วน", () => {
  render(<ThisPeriod store={store} meta={META} today={T} />);
  expect(screen.getByText("เริ่มตรงนี้")).toBeInTheDocument();
  expect(screen.queryByText("รายการที่ใช้")).toBeNull();
  expect(screen.getByRole("button", { name: "+ เพิ่ม" })).toBeInTheDocument();
});

test("มีรายการแล้ว: ข้อความเริ่มต้นหาย ตัวเลขสรุปขึ้น และมีคำแนะนำการกดใช้แล้ววันนี้", () => {
  store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
  vi.stubGlobal("fetch", vi.fn(async () => respond(body([]))));
  render(<ThisPeriod store={store} meta={META} today={T} />);
  expect(screen.queryByText("เริ่มตรงนี้")).toBeNull();
  expect(screen.getByText("รายการที่ใช้")).toBeInTheDocument();
  expect(screen.getByText(/ทุกวันที่ใช้ เพื่อให้บันทึกต่อเนื่อง/)).toBeInTheDocument();
});

test("ผลบอกว่าไม่ได้กรอกโปรไฟล์: มีปุ่มพาไปกรอก", async () => {
  store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
  vi.stubGlobal("fetch", vi.fn(async () => respond(body([], { coverage: { not_checked: ["age"] } }))));
  const go = vi.fn();
  render(<ThisPeriod store={store} meta={META} today={T} onProfile={go} />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "ไปกรอกโปรไฟล์" }));
  expect(go).toHaveBeenCalledOnce();
});

test("ข้อความ “เพิ่ม … แล้ว” เปลี่ยนภาษาตามที่สลับ ไม่ค้างภาษาเดิม", async () => {
  vi.useRealTimers();
  vi.stubGlobal("fetch", vi.fn(async () => respond(body([]))));
  const user = userEvent.setup();
  render(<ThisPeriod store={store} meta={META} today={T} />);
  await user.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
  await user.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  await user.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  const status = () => document.querySelector(".added-status")!.textContent;
  await waitFor(() => expect(status()).toBe("เพิ่ม ขิง แล้ว"));
  act(() => setLang("en"));
  await waitFor(() => expect(status()).toMatch(/^Added /));
  act(() => setLang("th"));
  await waitFor(() => expect(status()).toBe("เพิ่ม ขิง แล้ว"));
});

test("ข้อความ “ผลตรวจไม่ได้แยกรายตัวยา” เป็นปุ่ม กดแล้วเลื่อนขึ้นแผงผลตรวจและย้ายโฟกัสไปหัวข้อผล", async () => {
  vi.useRealTimers();
  store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
  store.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T });
  vi.stubGlobal("fetch", vi.fn(async () => respond(body([], { summary: { drugs_as_entered: ["warfarin"] } }))));
  render(<ThisPeriod store={store} meta={META} today={T} />);
  const btn = await screen.findByRole("button", { name: "ผลตรวจไม่ได้แยกรายตัวยา" });
  scroll.mockClear();
  fireEvent.click(btn);
  const panel = document.getElementById("result-panel")!;
  expect(scroll).toHaveBeenCalledOnce();
  expect(scroll.mock.contexts[0]).toBe(panel);
  expect(panel.querySelector("h2")).toHaveFocus();
});

test("แผ่นเพิ่ม: ขั้น 1 เลือก, ขั้น 2 วันที่เริ่ม, ปุ่มเพิ่มอยู่ก่อนทางลัดพิมพ์เป็นประโยค", async () => {
  vi.useRealTimers();
  vi.stubGlobal("fetch", vi.fn(async () => respond(body([]))));
  const user = userEvent.setup();
  render(<ThisPeriod store={store} meta={META} today={T} />);
  await user.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
  const h1 = within(d).getByRole("heading", { name: /เลือกสิ่งที่คุณใช้/ });
  const h2 = within(d).getByRole("heading", { name: /เริ่มใช้เมื่อไหร่/ });
  const add = within(d).getByRole("button", { name: "เพิ่ม" });
  const shortcut = within(d).getByText("หรือทางลัด: พิมพ์เป็นประโยคเดียว");
  const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(before(h1, h2) && before(h2, add) && before(add, shortcut)).toBe(true);
  expect(within(d).getByText("แตะรายการด้านบนเพื่อเลือก 1 อย่าง")).toBeInTheDocument();
  await user.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  expect(within(d).getByText("เลือกแล้ว: ขิง")).toBeInTheDocument();
});
