import { fireEvent, render, screen, within } from "@testing-library/preact";
import { TrackerStore } from "../model/tracker";
import { T } from "../test/fixtures";
import { History } from "./History";

let store: TrackerStore;
beforeEach(() => { store = new TrackerStore(null, () => T); });
afterEach(() => vi.unstubAllGlobals());

test("แสดงเฉพาะรายการที่หยุดแล้ว พร้อมช่วงวันที่ ไม่มีปุ่มตรวจ/ป้ายผลตรวจ", () => {
  const a = store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-01" });
  store.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T });
  if (a.ok) store.stopItem(a.item.id);
  render(<History store={store} />);
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  const row = within(list).getByRole("listitem");
  expect(row).toHaveTextContent("ขิง");
  expect(row).toHaveTextContent("สมุนไพร");
  const times = row.querySelectorAll("time");
  expect([...times].map((t) => t.getAttribute("datetime"))).toEqual(["2026-10-01", T]);
  expect(screen.queryByText("warfarin")).toBeNull();
  // ไม่ตรวจย้อนหลัง: ไม่มีปุ่มตรวจและไม่มีป้ายผล
  expect(screen.queryByRole("button", { name: /ตรวจ/ })).toBeNull();
  expect(document.querySelector(".badge")).toBeNull();
  expect(screen.getByText(/ไม่ถูกนำไปตรวจ/)).toBeInTheDocument();
});

test("ลบต้องยืนยัน; ยกเลิกแล้วยังอยู่", () => {
  const a = store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
  if (a.ok) store.stopItem(a.item.id);
  render(<History store={store} />);
  vi.stubGlobal("confirm", () => false);
  fireEvent.click(screen.getByRole("button", { name: "ลบ ขิง" }));
  expect(store.history()).toHaveLength(1);
  vi.stubGlobal("confirm", () => true);
  fireEvent.click(screen.getByRole("button", { name: "ลบ ขิง" }));
  expect(store.history()).toHaveLength(0);
  expect(screen.getByText("ยังไม่มีรายการที่หยุดใช้")).toBeInTheDocument();
});

test("ไม่มีรายการ", () => {
  render(<History store={store} />);
  expect(screen.getByText("ยังไม่มีรายการที่หยุดใช้")).toBeInTheDocument();
});
