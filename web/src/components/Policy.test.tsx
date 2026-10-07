import { render, screen, within } from "@testing-library/preact";
import { Policy } from "./Policy";
import { buildPayload } from "../model/panel";
import { STORAGE_KEY } from "../model/tracker";
import { DIARY_KEY } from "../model/diary";
import { CHAT_KEY } from "../chat/chatStore";

const text = () => document.getElementById("policy")!.textContent!;

test("นโยบายระบุคีย์ที่เก็บจริง และบอกชัดว่าบันทึกสุขภาพไม่ถูกส่ง", () => {
  render(<Policy />);
  for (const k of [STORAGE_KEY, DIARY_KEY, CHAT_KEY]) expect(text()).toContain(k);
  const row = screen.getByRole("rowheader", { name: /บันทึกสุขภาพ/ }).closest("tr")!;
  expect(within(row).getByText("ไม่ส่งไปที่ใดเลย")).toBeInTheDocument();
});

test("ฟิลด์ที่ส่งตรวจ (buildPayload) ต้องถูกระบุไว้ในนโยบายครบ", () => {
  render(<Policy />);
  const p = buildPayload(
    [{ id: "1", kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-01", end_date: null },
     { id: "2", kind: "drug", ref: "warfarin", label: "warfarin", start_date: "2026-10-01", end_date: null }],
    { age: 40, pregnant: "no", breastfeeding: "no", conditions: [] }, "2026-10-07")!;
  expect(Object.keys(p).sort()).toEqual(["drugs", "herbs", "profile"]);
  expect(Object.keys(p.herbs[0]).sort()).toEqual(["days_in_use", "id"]); // ไม่มีวันที่เริ่มจริง ไม่มีชื่อที่ตั้งเอง
  expect(Object.keys(p.profile).sort()).toEqual(["age", "breastfeeding", "conditions", "pregnant"]);
  for (const w of ["อายุ", "ตั้งครรภ์", "ให้นมบุตร", "โรค", "ชื่อยา", "จำนวนวัน"]) expect(text()).toContain(w);
});

test("ไม่มีคำว่าปลอดภัย ไม่สัญญาเกินจริง และเปิดเผยสิ่งที่ยังไม่รู้", () => {
  render(<Policy />);
  expect(text()).not.toContain("ปลอดภัย");
  expect(text()).toContain("ยังไม่ได้ตรวจเงื่อนไขการเก็บและการนำข้อมูลไปใช้ของผู้ให้บริการ AI");
  expect(text()).toContain("ไม่ได้เข้ารหัส");
  expect(text()).toContain("ช่องทางติดต่อของทีม: ยังไม่ได้ระบุ");
});
