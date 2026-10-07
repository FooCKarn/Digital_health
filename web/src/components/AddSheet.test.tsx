import { render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { TrackerStore } from "../model/tracker";
import { body, flag, META, respond, T } from "../test/fixtures";
import { ThisPeriod } from "./ThisPeriod";

let store: TrackerStore;
let calls: { url: string; body: any }[];
let handlers: Record<string, () => Response | Promise<Response>>;

beforeEach(() => {
  store = new TrackerStore(null, () => T);
  calls = [];
  handlers = { "/api/analyze": () => respond(body([])) };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return handlers[url]?.() ?? respond({}, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const setup = () => {
  const user = userEvent.setup();
  render(<ThisPeriod store={store} meta={META} today={T} />);
  return user;
};
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /เพิ่ม/ }));
  const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
  await waitFor(() => expect(within(d).getByLabelText("ค้นหา หรือพิมพ์ชื่อยา")).toHaveFocus());
  return d;
};

test("เพิ่มขิง เริ่ม 3 วันก่อน -> รายการแสดง 'วันที่ 4'", async () => {
  const user = setup();
  const d = await open(user);
  await waitFor(() => expect(screen.getByLabelText("ค้นหา หรือพิมพ์ชื่อยา")).toHaveFocus());
  await user.type(within(d).getByLabelText("ค้นหา หรือพิมพ์ชื่อยา"), "ขิง");
  expect(within(d).queryByRole("button", { name: /ฟ้าทะลายโจร/ })).toBeNull();
  await user.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  const date = within(d).getByLabelText("วันที่เริ่มใช้") as HTMLInputElement;
  expect(date.max).toBe(T);
  expect(date.value).toBe(T);
  await user.clear(date);
  await user.type(date, "2026-10-04");
  await user.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  expect(store.active()).toHaveLength(1);
  expect(store.active()[0]).toMatchObject({ kind: "herb", ref: "khing", start_date: "2026-10-04" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(await screen.findByText(/วันที่ 4/)).toBeInTheDocument();
});

test("วันที่ในอนาคต -> ข้อความอยู่ติดช่องวันที่ ไม่เพิ่ม", async () => {
  const user = setup();
  const d = await open(user);
  await user.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  const date = within(d).getByLabelText("วันที่เริ่มใช้");
  await user.clear(date);
  await user.type(date, "2026-10-09");
  await user.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  const err = within(d).getByRole("alert");
  expect(err).toHaveTextContent("วันที่เริ่มเป็นอนาคตไม่ได้");
  expect(date).toHaveAccessibleDescription("วันที่เริ่มเป็นอนาคตไม่ได้");
  expect(date.nextElementSibling).toBe(err);
  expect(store.active()).toHaveLength(0);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("Esc ปิดและคืนโฟกัสไปปุ่มเพิ่ม", async () => {
  const user = setup();
  const opener = screen.getByRole("button", { name: /เพิ่ม/ });
  await open(user);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});

test("พิมพ์ชื่อยาที่ไม่อยู่ในรายการแล้วเพิ่มได้", async () => {
  const user = setup();
  const d = await open(user);
  await user.type(within(d).getByLabelText("ค้นหา หรือพิมพ์ชื่อยา"), "ยาแปลก");
  await user.click(within(d).getByRole("button", { name: /ใช้ชื่อยา/ }));
  await user.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  expect(store.active()).toMatchObject([{ kind: "drug", ref: "ยาแปลก", label: "ยาแปลก" }]);
});

test("ซ้ำ -> ข้อความผิดพลาดจาก store อยู่ติดรายการที่เลือก", async () => {
  store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
  const user = setup();
  const d = await open(user);
  await user.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  await user.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  expect(within(d).getByRole("alert")).toHaveTextContent("มีรายการนี้อยู่แล้ว");
  expect(store.active()).toHaveLength(1);
});

test("ParseBox เสนอรายการแต่ยังไม่เพิ่มจนกว่าติ๊กและยืนยัน", async () => {
  handlers["/api/parse"] = () => respond({ herbs: [{ id: "khing", days_in_use: 3 }], drugs: ["warfarin"], unmatched: ["xx"], dropped: 1 });
  const user = setup();
  const d = await open(user);
  await user.type(within(d).getByLabelText(/พิมพ์ข้อความ/), "ขิง 3 วัน warfarin");
  await user.click(within(d).getByRole("button", { name: "แยกรายการด้วย AI" }));
  const khing = await within(d).findByRole("checkbox", { name: /ขิง/ });
  expect(within(d).getByText(/xx/)).toBeInTheDocument();
  expect(store.active()).toHaveLength(0);
  const confirm = within(d).getByRole("button", { name: /ยืนยันเพิ่ม 0/ });
  await user.click(confirm);
  expect(store.active()).toHaveLength(0);
  await user.click(khing);
  await user.click(within(d).getByRole("button", { name: /ยืนยันเพิ่ม 1/ }));
  expect(store.active()).toMatchObject([{ kind: "herb", ref: "khing", start_date: "2026-10-05" }]);
});

test("/api/parse 503 -> ข้อความไทยตายตัว ไม่พัง", async () => {
  handlers["/api/parse"] = () => respond({ error: "no_key", detail: "SECRET-DETAIL" }, 503);
  const user = setup();
  const d = await open(user);
  await user.type(within(d).getByLabelText(/พิมพ์ข้อความ/), "ขิง");
  await user.click(within(d).getByRole("button", { name: "แยกรายการด้วย AI" }));
  expect(await within(d).findByText("ใช้ AI ไม่ได้ในขณะนี้ กรอกเองได้ตามปกติ")).toBeInTheDocument();
  expect(d.textContent).not.toContain("SECRET-DETAIL");
  expect(within(d).getByLabelText("ค้นหา หรือพิมพ์ชื่อยา")).toBeInTheDocument();
});

test("ปุ่มที่กำลังทำงานเป็น aria-disabled และไม่ยิงซ้ำเมื่อกดสองครั้ง", async () => {
  let release!: () => void;
  handlers["/api/parse"] = () => new Promise<Response>((r) => { release = () => r(respond({ herbs: [], drugs: [], unmatched: [], dropped: 0 })); });
  const user = setup();
  const d = await open(user);
  await user.type(within(d).getByLabelText(/พิมพ์ข้อความ/), "ขิง");
  const btn = within(d).getByRole("button", { name: "แยกรายการด้วย AI" });
  await user.dblClick(btn);
  expect(btn).toHaveAttribute("aria-disabled", "true");
  expect(calls.filter((c) => c.url === "/api/parse")).toHaveLength(1);
  release();
  await waitFor(() => expect(btn).toHaveAttribute("aria-disabled", "false"));
});

describe("ExplainBox", () => {
  const explainBtn = () => screen.queryByRole("button", { name: "ตัวเลือก: ให้ AI เรียบเรียงภาษา" });

  test("ซ่อนเมื่อผลที่แสดงยังไม่ใช่ผลปัจจุบัน (กำลังตรวจครั้งแรก/ไม่มีสมุนไพร)", async () => {
    setup();
    expect(explainBtn()).toBeNull();
    store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
    await waitFor(() => expect(explainBtn()).not.toBeNull());
  });

  test("ข้อความจากเซิร์ฟเวอร์แสดงเป็นข้อความ + ป้ายที่มา (template ระบุตามจริง)", async () => {
    store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
    handlers["/api/analyze"] = () => respond(body([flag()]));
    handlers["/api/explain"] = () => respond({ explanation: { source: "template", rejected_reason: "x", summary_th: "<img src=x onerror=alert(1)>สรุป", items: [{ flag_id: "f1", text_th: "<b>ตัวหนา</b>" }], disclaimer_th: "ไม่ใช่การวินิจฉัย" } });
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "ตัวเลือก: ให้ AI เรียบเรียงภาษา" }));
    const box = (await screen.findByText(/ข้อความสำรองจากฐานข้อมูล/)).closest("section") as HTMLElement;
    expect(box.querySelector("img, b")).toBeNull();
    expect(box).toHaveTextContent("<img src=x onerror=alert(1)>สรุป");
    expect(box).toHaveTextContent("<b>ตัวหนา</b>");
    expect(calls.find((c) => c.url === "/api/explain")!.body.herbs).toEqual([{ id: "khing", days_in_use: 1 }]);
    expect(document.body.textContent).not.toContain("ปลอดภัย");
  });

  test("คำอธิบายหายเมื่อข้อมูลเปลี่ยน (ไม่ใช่ผลปัจจุบัน)", async () => {
    store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
    handlers["/api/analyze"] = () => respond(body([flag()]));
    handlers["/api/explain"] = () => respond({ explanation: { source: "llm", rejected_reason: null, summary_th: "สรุปทดสอบ", items: [], disclaimer_th: "d" } });
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "ตัวเลือก: ให้ AI เรียบเรียงภาษา" }));
    expect(await screen.findByText("สรุปทดสอบ")).toBeInTheDocument();
    store.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T });
    await waitFor(() => expect(screen.queryByText("สรุปทดสอบ")).toBeNull());
  });
});
