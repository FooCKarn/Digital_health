import { fireEvent, render, screen } from "@testing-library/preact";
import { TrackerStore } from "../model/tracker";
import { body, flush, META, respond, T } from "../test/fixtures";
import { ThisPeriod } from "./ThisPeriod";

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
