import { render, screen } from "@testing-library/preact";
import { App } from "./App";
import { META, respond } from "./test/fixtures";

afterEach(() => vi.unstubAllGlobals());

test("แสดงหัวข้อ HerbGuard", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("HerbGuard");
});

test("โหลด meta แล้วแสดงหน้า ช่วงนี้ พร้อมขอบเขต", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => respond(META)));
  render(<App />);
  expect(await screen.findByText("ยังไม่มีสมุนไพรให้ตรวจ", { selector: ".status-line" })).toBeInTheDocument();
  expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
});

test("โหลด meta ไม่สำเร็จ: ข้อความไทย ไม่มีรหัสดิบ", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => respond({ error: "boom" }, 500)));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ: ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง");
});
