import { act, fireEvent, render, screen, within } from "@testing-library/preact";
import base from "../styles/base.css?raw";
import { TrackerStore } from "../model/tracker";
import { body, flag, flush, META, respond, T } from "../test/fixtures";
import type { Flag } from "../types";
import { ThisPeriod } from "./ThisPeriod";

const NO_FLAG = "ไม่พบธงเตือนในฐานข้อมูลนี้";
const NO_FLAG_NOTE = "นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร";

let store: TrackerStore;
beforeEach(() => { vi.useFakeTimers(); store = new TrackerStore(null, () => T); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const add = (kind: "herb" | "drug", ref: string, label = ref) => store.addItem({ kind, ref, label, start_date: T });

/** แสดงผลแล้วรอให้ตรวจเสร็จ (fake timers) */
async function show(b: ReturnType<typeof body>) {
  const f = vi.fn(async () => respond(b));
  vi.stubGlobal("fetch", f);
  const view = render(<ThisPeriod store={store} meta={META} today={T} />);
  await flush();
  screen.getByRole("heading", { name: b.result.flags.length ? b.summary.headline_th : NO_FLAG });
  return { ...view, fetch: f };
}

const row = (label: string) => screen.getByText(label, { selector: "strong" }).closest("li") as HTMLElement;
// พื้นที่ประกาศผลตรวจ (แยกจากพื้นที่ประกาศการเพิ่ม .added-status)
const resultStatus = () => document.querySelector<HTMLElement>(".this-period > [role=status]:not(.added-status)")!;
const hasRow = (label: string) => screen.queryByText(label, { selector: "strong" }) !== null;

test("(จ) ไม่มีธง + ไม่ได้กรอกอายุ: เห็นทั้งสถานะและรายการที่ไม่ได้ตรวจ พร้อมขอบเขตและ disclaimer", async () => {
  add("herb", "khing", "ขิง");
  await show(body([], { coverage: { not_checked: ["age", "pregnancy"] } }));
  expect(screen.getByText(NO_FLAG_NOTE)).toBeInTheDocument();
  expect(screen.getByText("ไม่ได้ตรวจเงื่อนไข (ไม่ได้กรอก): อายุ, การตั้งครรภ์")).toBeInTheDocument();
  expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(META.disclaimer_th);
  expect(within(row("ขิง")).getByText(NO_FLAG)).toBeInTheDocument();
  expect(resultStatus()).toHaveTextContent(NO_FLAG);
});

test("(ฉ) ยาที่อยู่ใน unknown_inputs ได้ 'ยังไม่มีข้อมูลตรวจ'; ยาที่รู้จักไม่ได้ป้ายไม่พบธง", async () => {
  add("herb", "khing", "ขิง");
  add("drug", "ยาแปลก");
  add("drug", "warfarin");
  await show(body([], { coverage: { unknown_inputs: ["ยาแปลก"] }, summary: { drugs_as_entered: ["ยาแปลก", "warfarin"] } }));
  const u = row("ยาแปลก");
  expect(within(u).getByText("ยังไม่มีข้อมูลตรวจ")).toBeInTheDocument();
  expect(u.textContent).not.toContain("ไม่พบธง");
  const w = row("warfarin");
  expect(w.querySelector("[data-kind='no_flag']")).toBeNull();
  expect(w.textContent).not.toContain("ไม่พบธง");
  // ผลตรวจไม่มีธงเลย: ห้ามชี้ไปแผงที่ว่าง และห้ามสื่อว่ายานี้ไม่มีธง/ปลอดภัย
  expect(within(w).getByText("ผลตรวจไม่ได้แยกรายตัวยา")).toBeInTheDocument();
  expect(w.textContent).not.toContain("ดูธงในแผงด้านบน");
  expect(w.textContent).not.toContain("ปลอดภัย");
  expect(screen.getByText(/ยังไม่ได้ตรวจ เพราะไม่มีในฐานข้อมูล: ยาแปลก/)).toBeInTheDocument();
});

test("(ช) กลุ่ม avoid เปิด กลุ่มอื่นพับ, กลุ่ม other แสดง, แบนเนอร์เด่นเมื่อมี avoid, ขอบเขตอยู่เหนือธงแรก", async () => {
  add("herb", "khing", "ขิง");
  const flags: Flag[] = [
    flag({ flag_id: "a", severity: "avoid", message_th: "ธง avoid" }),
    flag({ flag_id: "c", severity: "caution", message_th: "ธง caution" }),
    flag({ flag_id: "i", severity: "info", message_th: "ธง info" }),
    flag({ flag_id: "o", severity: "weird" as Flag["severity"], message_th: "ธงแปลก" }),
  ];
  const { container } = await show(body(flags));
  const g = (k: string) => container.querySelector<HTMLDetailsElement>(`details[data-group='${k}']`)!;
  expect(g("avoid").open).toBe(true);
  expect(g("caution").open).toBe(true); // ควรระวังเปิดไว้ ผู้ใช้ไม่พลาด
  expect(g("info").open).toBe(false);
  expect(g("other").open).toBe(false);
  expect(within(g("other")).getByText("ธงแปลก")).toBeInTheDocument();
  expect(g("other").querySelector("summary")!.textContent).toContain("ธงอื่น ๆ");
  expect(screen.getByText(/1 รายการที่ควรหลีกเลี่ยง/, { selector: ".banner-avoid *, .banner-avoid" })).toBeInTheDocument();
  const chip = container.querySelector(".scope-chip")!;
  const first = container.querySelector(".flag-card")!;
  expect(chip.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector(".disclaimer")!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // แถบสรุปลิงก์ข้ามไปกลุ่ม และเปิดกลุ่มที่พับไว้
  const link = screen.getByRole("link", { name: /ควรระวัง 1/ });
  expect(link.getAttribute("href")).toBe("#group-caution");
  fireEvent.click(link);
  expect(g("caution").open).toBe(true);
  // แถวสมุนไพรที่มีธงใช้ระดับสูงสุดจาก engine
  expect(within(row("ขิง")).getByText("ควรหลีกเลี่ยง")).toBeInTheDocument();
});

test("ไม่มีแบนเนอร์เมื่อไม่มี avoid", async () => {
  add("herb", "khing");
  const { container } = await show(body([flag({ severity: "caution" })]));
  expect(container.querySelector(".banner-avoid")).toBeNull();
});

test("(ซ) ข้อความจากเซิร์ฟเวอร์ที่ฝัง HTML แสดงเป็นข้อความ ไม่สร้าง element", async () => {
  add("herb", "khing");
  const evil = '<img src=x onerror="window.__x=1">';
  const { container } = await show(body([flag({ message_th: evil, evidence_quote: evil })], { summary: { headline_th: evil } }));
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
  expect((window as any).__x).toBeUndefined();
});

test("(ฌ) ไม่มีคำว่า ปลอดภัย ใน DOM ทั้งมุมมองไม่มีธงและมีธง", async () => {
  add("herb", "khing");
  add("drug", "warfarin");
  const a = await show(body([], { coverage: { not_checked: ["age"] } }));
  expect(document.body.textContent).not.toContain("ปลอดภัย");
  a.unmount();
  await show(body([flag({ severity: "avoid", verified: false })], { result: { pharmacist_review_required: true } }));
  expect(document.body.textContent).not.toContain("ปลอดภัย");
});

test("(ญ) ธง verified:false แสดงสถานะร่าง และประกาศร่างจาก summary.draft_notice_th", async () => {
  add("herb", "khing");
  const notice = "ข้อมูลบางรายการยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ (สถานะ: ร่าง)";
  const { container } = await show(body([flag({ verified: false })], { summary: { draft_notice_th: notice } }));
  expect(screen.getByText(notice)).toBeInTheDocument();
  const card = container.querySelector(".flag-card")!;
  expect(card.textContent).toContain("ยังรอผู้เชี่ยวชาญตรวจ (ใช้สาธิต)");
  expect(card.textContent).toContain("ชั้นหลักฐาน A");
  expect(card.textContent).toContain("หน้า 12");
  expect(card.textContent).toContain("หน้า 30 ในไฟล์ PDF");
  const ev = card.querySelector("details.evd")!;
  expect(ev.querySelector("summary")!.textContent).toBe("ดูหลักฐาน");
  expect(ev.textContent).toContain("วลีทดสอบ");
});

test("ต้องปรึกษาเภสัชกร + aggregate แสดง", async () => {
  add("herb", "khing");
  await show(body([flag({ severity: "caution" })], {
    result: {
      pharmacist_review_required: true,
      aggregates: [{ mechanism_tag: "bleed", label_th: "เลือดออก", sources: [], count: 2, severity: "caution", flag_ids: ["f1"], message_th: "ข้อความรวม" }],
    },
  }));
  expect(screen.getByText(/แนะนำให้ปรึกษาเภสัชกรก่อนใช้/)).toBeInTheDocument();
  expect(screen.getByText("ภาระความเสี่ยงรวม (เลือดออก) · ควรระวัง")).toBeInTheDocument();
  expect(screen.getByText("ข้อความรวม")).toBeInTheDocument();
});

test("มีแต่ยา: ยังไม่มีสมุนไพรให้ตรวจ ไม่เรียก API ไม่แสดงไม่พบธง แต่ยังมีขอบเขต", async () => {
  add("drug", "warfarin");
  const f = vi.fn(async () => respond(body()));
  vi.stubGlobal("fetch", f);
  render(<ThisPeriod store={store} meta={META} today={T} />);
  expect(screen.getByText("ยังไม่มีสมุนไพรให้ตรวจ", { selector: ".status-line" })).toBeInTheDocument();
  await flush(1000);
  expect(f).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(NO_FLAG);
  expect(within(row("warfarin")).getByText("ยังไม่มีข้อมูลตรวจ")).toBeInTheDocument();
  expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
});

test("โรคในโปรไฟล์ที่ระบบไม่รู้จักถูกระบุว่าไม่ได้ตรวจ", async () => {
  store.setProfile({ age: 40, pregnant: null, breastfeeding: null, conditions: ["htn", "zzz"] });
  add("herb", "khing");
  await show(body());
  expect(screen.getByText(/ไม่ได้ตรวจเงื่อนไข \(ระบบไม่รู้จัก\): zzz/)).toBeInTheDocument();
});

test("ตรวจล้มเหลวหลังมีผล: คงผลเก่า ป้ายผลเก่า ปุ่มลองใหม่ ขอบเขตยังอยู่", async () => {
  add("herb", "khing");
  const { fetch: f } = await show(body([flag({ message_th: "ผลแรก" })]));
  f.mockImplementation(async () => respond({ error: "x" }, 500));
  act(() => void add("herb", "fathalai"));
  await flush();
  expect(screen.getByRole("alert")).toHaveTextContent("ผลนี้เก่า ตรวจไม่สำเร็จ: ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง");
  expect(screen.getByText("ผลแรก")).toBeInTheDocument();
  expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
  f.mockImplementation(async () => respond(body([flag({ message_th: "ผลสอง" })])));
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await flush();
  expect(screen.getByText("ผลสอง")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("หยุดใช้: แถวหายจากรายการทันที; ลบ: หายเช่นกัน", async () => {
  add("herb", "khing", "ขิง");
  add("drug", "warfarin");
  await show(body());
  fireEvent.click(screen.getByRole("button", { name: "หยุดใช้ ขิง" }));
  expect(hasRow("ขิง")).toBe(false);
  expect(store.history()).toHaveLength(1);
  vi.stubGlobal("confirm", () => false);
  fireEvent.click(screen.getByRole("button", { name: "ลบ warfarin" }));
  expect(row("warfarin")).toBeInTheDocument();
  vi.stubGlobal("confirm", () => true);
  fireEvent.click(screen.getByRole("button", { name: "ลบ warfarin" }));
  expect(hasRow("warfarin")).toBe(false);
  expect(store.state.items).toHaveLength(1);
});

test("แถวแสดงชนิดและวันที่ N; ระหว่างตรวจ สมุนไพรใหม่แสดง กำลังตรวจ…", async () => {
  store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-01" });
  await show(body());
  expect(within(row("ขิง")).getByText(/^สมุนไพร · เริ่มใช้ .*\(ใช้มา 7 วัน\)$/)).toBeInTheDocument();
  act(() => void add("herb", "fathalai", "ฟ้าทะลายโจร"));
  expect(within(row("ฟ้าทะลายโจร")).getByText("กำลังตรวจ…")).toBeInTheDocument();
});

test("ปุ่มในรายการสูงอย่างน้อย 44px", async () => {
  const style = document.createElement("style");
  style.textContent = base;
  document.head.append(style);
  add("herb", "khing", "ขิง");
  await show(body());
  for (const b of within(row("ขิง")).getAllByRole("button")) expect(getComputedStyle(b).minHeight).toBe("44px");
  style.remove();
});

describe("ผลเก่าห้ามแสดงเป็นผลปัจจุบัน (C1/I1)", () => {
  const noFlagInRow = (label: string) => {
    expect(row(label).textContent).not.toContain(NO_FLAG);
    expect(row(label).querySelector("[data-kind='no_flag'],[data-kind='avoid'],[data-kind='caution'],[data-kind='info']")).toBeNull();
  };

  test("เพิ่มยาระหว่างรอผลใหม่: แถวขิงไม่แสดง ไม่พบธง และหัวข้อเป็นผลก่อนแก้ไข", async () => {
    add("herb", "khing", "ขิง");
    const { fetch: f } = await show(body());
    expect(within(row("ขิง")).getByText(NO_FLAG)).toBeInTheDocument(); // ควรไม่เตือน: ผลปัจจุบันแสดงตามปกติ
    f.mockImplementation(() => new Promise(() => {}));
    act(() => void add("drug", "warfarin"));
    // ทันทีหลังแก้ (ก่อน effect/หน่วงเวลา)
    noFlagInRow("ขิง");
    expect(within(row("ขิง")).getByText("กำลังตรวจ…")).toBeInTheDocument();
    await flush();
    noFlagInRow("ขิง");
    expect(screen.queryByRole("heading", { name: NO_FLAG })).toBeNull();
    expect(screen.queryByText("นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร")).toBeNull();
    expect(screen.getByRole("heading", { name: "ผลก่อนแก้ไข (ยังไม่ได้ตรวจรายการล่าสุด)" })).toBeInTheDocument();
    expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  test("แก้โปรไฟล์แล้วตรวจล้มเหลว: แถวได้ ยังไม่มีข้อมูลตรวจ ไม่ใช่ป้ายระดับจากผลเก่า; ธงเก่ายังเห็นใต้หัวข้อผลก่อนแก้ไข", async () => {
    add("herb", "khing", "ขิง");
    const { fetch: f } = await show(body([flag({ severity: "caution", message_th: "ธงเก่า" })]));
    expect(within(row("ขิง")).getByText("ควรระวัง")).toBeInTheDocument();
    f.mockImplementation(async () => respond({ error: "x" }, 500));
    act(() => void store.setProfile({ age: 70, pregnant: null, breastfeeding: null, conditions: [] }));
    await flush();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    noFlagInRow("ขิง");
    expect(within(row("ขิง")).getByText("ยังไม่มีข้อมูลตรวจ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ผลก่อนแก้ไข (ยังไม่ได้ตรวจรายการล่าสุด)" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /พบธงเตือน/ })).toBeNull();
    expect(screen.getByText("ธงเก่า")).toBeInTheDocument();
  });

  test("ไม่มีธง + ตรวจล้มเหลวหลังเพิ่มยา: ไม่มีข้อความ ไม่พบธง ในหน้าเลย", async () => {
    add("herb", "khing", "ขิง");
    const { fetch: f } = await show(body());
    f.mockImplementation(async () => respond({ error: "x" }, 500));
    act(() => void add("drug", "warfarin"));
    await flush();
    expect(document.body.textContent).not.toContain(NO_FLAG);
    expect(resultStatus()).toHaveTextContent("");
  });
});
