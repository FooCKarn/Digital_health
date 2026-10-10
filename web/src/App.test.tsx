import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { App } from "./App";
import { body, flag, META, respond } from "./test/fixtures";

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
  expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา", { selector: ".scope .scope-chip" })).toBeInTheDocument();
});

describe("แท็บ ช่วงนี้ · ผู้ช่วย · บันทึก (รวมที่เคยใช้) · ข้อมูลของฉัน", () => {
  beforeEach(() => localStorage.clear());

  const mount = async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/meta" ? respond(META) : respond(body()))));
    render(<App />);
    await screen.findByRole("tablist", { name: "มุมมอง" });
    return screen.getAllByRole("tab");
  };
  const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });

  test("roving tabindex + ลูกศร/Home/End (เทียบสถานการณ์เดิม 4)", async () => {
    const tabs = await mount();
    expect(tabs.map((t) => t.textContent)).toEqual(["ช่วงนี้", "ผู้ช่วย", "บันทึก", "ข้อมูลของฉัน"]);
    const sel = () => tabs.map((t) => t.getAttribute("aria-selected"));
    expect(sel()).toEqual(["true", "false", "false", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    tabs[0].focus();
    key("ArrowRight");
    expect(sel()).toEqual(["false", "true", "false", "false"]);
    expect(tabs[1]).toHaveFocus();
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1]);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[1].id);
    expect(screen.getByRole("heading", { name: "ผู้ช่วย" })).toBeInTheDocument();
    key("ArrowRight");
    expect(tabs[2]).toHaveFocus();
    expect(screen.getByRole("heading", { name: "บันทึกสุขภาพของฉัน" })).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีรายการที่หยุดใช้")).toBeInTheDocument(); // ประวัติที่เคยใช้รวมอยู่ในแท็บบันทึก
    key("End");
    expect(tabs[3]).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "ข้อมูลของฉัน" })).toBeInTheDocument();
    key("ArrowRight"); // วนกลับแท็บแรก
    expect(tabs[0]).toHaveFocus();
    key("ArrowLeft");
    expect(tabs[3]).toHaveFocus();
    key("Home");
    expect(tabs[0]).toHaveFocus();
    expect(sel()).toEqual(["true", "false", "false", "false"]);
    expect(screen.getByText("ยังไม่มีสมุนไพรให้ตรวจ", { selector: ".status-line" })).toBeInTheDocument();
  });

  test("แก้โปรไฟล์ในหน้า ข้อมูลของฉัน แล้วระบบตรวจใหม่ด้วยค่าที่กรอก", async () => {
    localStorage.setItem("hg_tracker_v1", JSON.stringify({
      v: 1, items: [{ id: "a", kind: "herb", ref: "khing", label: "ขิง", start_date: "2020-01-01", end_date: null }],
      profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] },
    }));
    const tabs = await mount();
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    const analyzeBodies = () => f.mock.calls.filter((c) => c[0] === "/api/analyze").map((c) => JSON.parse(String(c[1].body)));
    await waitFor(() => expect(analyzeBodies()).toHaveLength(1));
    expect("pregnant" in analyzeBodies()[0].profile).toBe(false);
    fireEvent.click(tabs[3]);
    fireEvent.change(screen.getByLabelText("ตั้งครรภ์"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    await waitFor(() => expect(analyzeBodies()).toHaveLength(2));
    expect(analyzeBodies()[1].profile.pregnant).toBe(false);
  });

  test("ที่เก็บใช้ไม่ได้: แจ้ง ข้อมูลจะหายเมื่อปิดหน้านี้ ในทุกหน้า", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const tabs = await mount();
      for (const t of tabs) {
        fireEvent.click(t);
        expect(screen.getAllByText(/ข้อมูลจะหายเมื่อปิดหน้านี้/)).toHaveLength(1);
      }
      expect(screen.queryByText(/เสียหาย/)).toBeNull();
    } finally { vi.restoreAllMocks(); }
  });

  test("ข้อมูลที่บันทึกไว้เสีย: แจ้งในหน้า ช่วงนี้ ปิดได้; ที่เก็บปกติไม่มีแบนเนอร์หาย", async () => {
    localStorage.setItem("hg_tracker_v1", "{broken");
    await mount();
    expect(screen.getByText("ข้อมูลที่เก็บไว้เสียหาย จึงเริ่มต้นใหม่ให้")).toBeInTheDocument();
    expect(screen.queryByText(/ข้อมูลจะหายเมื่อปิดหน้านี้/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปิดข้อความ ข้อมูลเสียหาย" }));
    expect(screen.queryByText(/เสียหาย/)).toBeNull();
  });

  test("ข้ามเที่ยงคืน: วันนี้คำนวณใหม่ทุกครั้งที่ Home render (ไม่ค้างค่าตอนโหลดหน้า)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 9, 7, 23, 59));
      localStorage.setItem("hg_tracker_v1", JSON.stringify({
        v: 1, items: [{ id: "a", kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-07", end_date: null }],
        profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] },
      }));
      const tabs = await mount();
      expect(await screen.findByText(/^สมุนไพร · เริ่มใช้ .*\(ใช้มา 1 วัน\)$/)).toBeInTheDocument();
      vi.setSystemTime(new Date(2026, 9, 8, 0, 1));
      fireEvent.click(tabs[2]);
      fireEvent.click(tabs[0]);
      expect(await screen.findByText(/^สมุนไพร · เริ่มใช้ .*\(ใช้มา 2 วัน\)$/)).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  test("ข้อความแนะนำเภสัชกรชี้ไปหน้า ข้อมูลของฉัน (ไม่ใช่แท็บที่ไม่มีแล้ว)", async () => {
    localStorage.setItem("hg_tracker_v1", JSON.stringify({
      v: 1, items: [{ id: "a", kind: "herb", ref: "khing", label: "ขิง", start_date: "2020-01-01", end_date: null }],
      profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] },
    }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/meta" ? respond(META) : respond(body([flag()], { result: { pharmacist_review_required: true } })))));
    render(<App />);
    expect(await screen.findByText(/แนะนำให้ปรึกษาเภสัชกรก่อนใช้/)).toHaveTextContent("ดูใบสรุปเภสัชกรในหน้า ข้อมูลของฉัน");
    expect(document.body.textContent).not.toContain("ดูแท็บใบสรุปเภสัชกร");
  });
});

test("โหลด meta ไม่สำเร็จ: ข้อความไทย ไม่มีรหัสดิบ", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => respond({ error: "boom" }, 500)));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ: ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง");
});
