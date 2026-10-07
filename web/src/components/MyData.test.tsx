import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import type { Analysis } from "../hooks/useAnalysis";
import { buildPayload } from "../model/panel";
import { STORAGE_KEY, TrackerStore, type KeyValueStorage } from "../model/tracker";
import { body, flag, META, respond, T } from "../test/fixtures";
import { MyData } from "./MyData";

// ที่เก็บในหน่วยความจำ แทน localStorage (ข้อมูลสมมติเท่านั้น)
function memStorage(init: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const ana = (over: Partial<Analysis> = {}): Analysis => ({
  status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry: () => {}, ...over,
});
const okA = (b = body()) => ana({ status: "ok", result: b.result, summary: b.summary, current: true });

let store: TrackerStore;
let mem: ReturnType<typeof memStorage>;
beforeEach(() => {
  mem = memStorage();
  store = new TrackerStore(mem, () => T, { knownConditions: Object.keys(META.conditions) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const show = (a: Analysis = ana(), s = store) => render(<MyData store={s} meta={META} today={T} analysis={a} />);
const herb = (ref = "khing", label = "ขิง") => store.addItem({ kind: "herb", ref, label, start_date: T });

describe("โปรไฟล์", () => {
  test("ตั้งครรภ์เป็น select 3 ค่า ไม่มี checkbox; ค่าเริ่ม ไม่ระบุ ไม่ส่งคีย์ pregnant; เปลี่ยนเป็น ไม่ใช่ ส่ง false", async () => {
    const user = userEvent.setup();
    herb();
    show();
    const preg = screen.getByLabelText("ตั้งครรภ์") as HTMLSelectElement;
    expect(preg.tagName).toBe("SELECT");
    expect([...preg.options].map((o) => o.text)).toEqual(["ไม่ระบุ", "ใช่", "ไม่ใช่"]);
    expect(screen.getByLabelText("ให้นมบุตร").tagName).toBe("SELECT");
    // ควรไม่เตือน: ไม่ระบุ -> ไม่มีคีย์ (engine แสดง ไม่ได้ตรวจ)
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    let p = buildPayload(store.active(), store.state.profile, T)!;
    expect("pregnant" in p.profile).toBe(false);
    expect("breastfeeding" in p.profile).toBe(false);
    // ควรส่ง: ผู้ใช้เลือก ไม่ใช่ -> false
    await user.selectOptions(preg, "ไม่ใช่");
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    p = buildPayload(store.active(), store.state.profile, T)!;
    expect(p.profile.pregnant).toBe(false);
    expect(screen.getByText(/บันทึกแล้ว/)).toBeInTheDocument();
  });

  test("อายุผิด (ไม่ใช่จำนวนเต็ม/เกิน 120) -> ข้อความไทย และไม่บันทึกอะไรเลย; อายุว่าง = null", async () => {
    const user = userEvent.setup();
    show();
    const age = screen.getByLabelText("อายุ (ปี)");
    await user.selectOptions(screen.getByLabelText("ตั้งครรภ์"), "ใช่");
    for (const bad of ["121", "3.5", "-1", "abc"]) {
      await user.clear(age);
      await user.type(age, bad);
      await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
      expect(screen.getByText("อายุต้องเป็นจำนวนเต็ม 0-120 ปี หรือเว้นว่างถ้าไม่ระบุ")).toBeInTheDocument();
      expect(age).toHaveAttribute("aria-invalid", "true");
      expect(store.state.profile).toEqual({ age: null, pregnant: null, breastfeeding: null, conditions: [] });
    }
    await user.clear(age);
    await user.type(age, "45");
    await user.click(screen.getByLabelText("ความดันโลหิตสูง"));
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    expect(store.state.profile).toEqual({ age: 45, pregnant: "yes", breastfeeding: null, conditions: ["htn"] });
    await user.clear(age);
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    expect(store.state.profile.age).toBeNull();
  });
});

describe("ส่งออก/นำเข้า/ลบ", () => {
  test("ส่งออกแล้วนำเข้าในเครื่องใหม่ได้ข้อมูลเดิม; ลิงก์ Blob ถูก revoke", async () => {
    herb();
    store.setProfile({ age: 30, pregnant: "no", breastfeeding: null, conditions: ["htn"] });
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }); // jsdom ไม่มีสองฟังก์ชันนี้
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const first = show();
    fireEvent.click(screen.getByRole("button", { name: "ส่งออกข้อมูล (JSON)" }));
    expect(click).toHaveBeenCalled();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:x"));
    const text = await blob!.text();
    first.unmount();

    const other = new TrackerStore(memStorage(), () => T, { knownConditions: Object.keys(META.conditions) });
    show(ana(), other);
    fireEvent.change(screen.getByLabelText("นำเข้าข้อมูลจากไฟล์ JSON"), { target: { files: [new File([text], "d.json", { type: "application/json" })] } });
    await screen.findByText("นำเข้าข้อมูลแล้ว");
    expect(other.state).toEqual(store.state);
  });

  test("ไฟล์ผิดรูป -> ข้อความไทย และข้อมูลเดิมไม่เปลี่ยน", async () => {
    herb();
    const before = JSON.stringify(store.state);
    show();
    const input = screen.getByLabelText("นำเข้าข้อมูลจากไฟล์ JSON");
    vi.stubGlobal("confirm", () => true);
    fireEvent.change(input, { target: { files: [new File(["{not json"], "x.json")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("นำเข้าไม่สำเร็จ: ไฟล์ไม่ใช่ JSON ที่อ่านได้ (ข้อมูลเดิมไม่เปลี่ยน)");
    fireEvent.change(input, { target: { files: [new File(['{"v":2}'], "x.json")] } });
    expect(await screen.findByText(/เวอร์ชันที่ไม่รองรับ/)).toBeInTheDocument();
    expect(JSON.stringify(store.state)).toBe(before);
    expect(mem.data.get(STORAGE_KEY)).toBe(before);
  });

  test("นำเข้าทับข้อมูลที่มีอยู่ต้องยืนยัน; ยกเลิก = ไม่เปลี่ยน", async () => {
    herb();
    const before = JSON.stringify(store.state);
    show();
    vi.stubGlobal("confirm", () => false);
    const good = JSON.stringify({ v: 1, items: [], profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] } });
    fireEvent.change(screen.getByLabelText("นำเข้าข้อมูลจากไฟล์ JSON"), { target: { files: [new File([good], "x.json")] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.stringify(store.state)).toBe(before);
  });

  test("ลบข้อมูลทั้งหมดต้องกดยืนยัน แล้วล้างรายการ โปรไฟล์ และ localStorage", async () => {
    const user = userEvent.setup();
    herb();
    store.setProfile({ age: 30, pregnant: "yes", breastfeeding: null, conditions: [] });
    show();
    await user.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    // ยังไม่ลบจนกว่าจะยืนยัน
    expect(store.state.items).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(store.state.items).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    await user.click(screen.getByRole("button", { name: "ยืนยันลบข้อมูลทั้งหมด" }));
    expect(store.state.items).toHaveLength(0);
    expect(store.state.profile).toEqual({ age: null, pregnant: null, breastfeeding: null, conditions: [] });
    expect(mem.data.has(STORAGE_KEY)).toBe(false);
    expect(screen.getByText("ลบข้อมูลทั้งหมดแล้ว")).toBeInTheDocument();
    // ฟอร์มโปรไฟล์กลับเป็นค่าว่าง
    expect((screen.getByLabelText("ตั้งครรภ์") as HTMLSelectElement).value).toBe("");
  });
});

describe("ข้อความแจ้ง", () => {
  test("ข้อมูลอยู่ในเครื่องเสมอ; localStorage ใช้ได้ -> ไม่มีแบนเนอร์หาย/เสียหาย", () => {
    show();
    expect(screen.getByText(/ข้อมูลอยู่ในเครื่องของคุณเท่านั้น/)).toBeInTheDocument();
    expect(screen.queryByText(/ข้อมูลจะหายเมื่อปิดหน้านี้/)).toBeNull();
    expect(screen.queryByText(/เสียหาย/)).toBeNull();
    expect(screen.getByText(/ห้ามใส่ชื่อจริง/)).toBeInTheDocument();
  });

  test("persistent=false -> ข้อมูลจะหายเมื่อปิดหน้านี้; ข้อมูลเสีย -> แจ้งว่าเริ่มใหม่แล้ว", () => {
    show(ana(), new TrackerStore(null, () => T));
    expect(screen.getByText(/ข้อมูลจะหายเมื่อปิดหน้านี้/)).toBeInTheDocument();
    const bad = new TrackerStore(memStorage({ [STORAGE_KEY]: "{broken" }), () => T);
    show(ana(), bad);
    expect(screen.getByText("ข้อมูลที่บันทึกไว้เสียหาย เริ่มใหม่ให้แล้ว")).toBeInTheDocument();
  });
});

describe("ใบสรุปเภสัชกร", () => {
  const region = () => screen.getByRole("region", { name: "ใบสรุปสำหรับเภสัชกร" });

  test("ผลปัจจุบัน: ขอบเขต disclaimer ตารางธง คำถามต่อ ยังไม่ได้ตรวจ และปุ่มดาวน์โหลด/พิมพ์", () => {
    herb();
    const b = body([flag({ verified: false, message_th: "ข้อความธงหนึ่ง" })], {
      coverage: { not_checked: ["age"], unknown_inputs: ["ยาแปลก"] },
      summary: { follow_up_questions_th: ["ใช้มานานเท่าไร"], draft_notice_th: "มีข้อมูลร่าง" },
    });
    show(okA(b));
    const r = region();
    expect(within(r).getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
    expect(within(r).getByRole("note")).toHaveTextContent(META.disclaimer_th);
    expect(within(r).getByText(b.summary.headline_th)).toBeInTheDocument();
    expect(within(r).getByRole("table")).toHaveTextContent("ข้อความธงหนึ่ง");
    expect(within(r).getByRole("table")).toHaveTextContent("ร่าง: ยังไม่ผ่านการตรวจ");
    expect(within(r).getByText("ใช้มานานเท่าไร")).toBeInTheDocument();
    expect(within(r).getByText("ยังไม่ได้ตรวจ: ยาแปลก, อายุ")).toBeInTheDocument();
    expect(within(r).getByText("มีข้อมูลร่าง")).toBeInTheDocument();
    const dl = within(r).getByRole("button", { name: "ดาวน์โหลดใบสรุป (JSON)" });
    expect(dl.closest(".noprint")).not.toBeNull();
    const pr = within(r).getByRole("button", { name: "พิมพ์ / บันทึกเป็น PDF" });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    fireEvent.click(pr);
    expect(print).toHaveBeenCalled();
  });

  test("ไม่มีธง: หัวข้อ ไม่พบธงเตือนในฐานข้อมูลนี้ คู่ข้อความว่าไม่ได้แปลว่าใช้ได้", () => {
    herb();
    show(okA(body()));
    expect(within(region()).getByText("ไม่พบธงเตือนในฐานข้อมูลนี้")).toBeInTheDocument();
    expect(within(region()).getByText("นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร")).toBeInTheDocument();
  });

  test("ผลไม่ใช่ปัจจุบัน: ไม่แสดงเนื้อหาเก่าเป็นปัจจุบัน (ไม่มีตาราง/หัวข้อผล) แต่ยังมีขอบเขต", () => {
    herb();
    const b = body([flag({ message_th: "ธงเก่า" })]);
    show(ana({ status: "loading", result: b.result, summary: b.summary, current: false }));
    const r = region();
    expect(within(r).queryByRole("table")).toBeNull();
    expect(within(r).queryByText("ธงเก่า")).toBeNull();
    expect(within(r).queryByText(b.summary.headline_th)).toBeNull();
    expect(within(r).queryByRole("button", { name: "ดาวน์โหลดใบสรุป (JSON)" })).toBeNull();
    expect(within(r).getByText(/กำลังตรวจ/)).toBeInTheDocument();
    expect(within(r).getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
  });

  test("ข้อความจากเซิร์ฟเวอร์ที่ฝัง HTML แสดงเป็นข้อความ", () => {
    herb();
    const evil = '<img src=x onerror="window.__y=1">';
    const { container } = show(okA(body([flag({ message_th: evil, evidence_quote: evil })], { summary: { headline_th: evil, follow_up_questions_th: [evil] } })));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
    expect((window as any).__y).toBeUndefined();
  });

  test("ไม่มีคำว่า ปลอดภัย ในหน้า", () => {
    herb();
    show(okA(body([flag({ severity: "avoid" })], { result: { pharmacist_review_required: true } })));
    expect(document.body.textContent).not.toContain("ปลอดภัย");
  });
});

describe("ข้อเสนอแนะ", () => {
  test("ส่งเฉพาะฟิลด์ตาม schema เดิม ไม่แนบสมุนไพร/ยา/โปรไฟล์ของผู้ใช้", async () => {
    const user = userEvent.setup();
    herb();
    store.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T });
    store.setProfile({ age: 30, pregnant: "yes", breastfeeding: null, conditions: ["htn"] });
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: JSON.parse(String(init!.body)) }); return respond({ ok: true }); }));
    show(okA(body([flag({ flag_id: "F-1" }), flag({ flag_id: "F-2" })])));
    await user.click(screen.getByText(/ช่วยเราปรับปรุง/, { selector: "summary" }));
    await user.selectOptions(screen.getByLabelText(/ความเห็นต่อธงที่ 1/), "เห็นด้วย");
    await user.selectOptions(screen.getByLabelText(/ความเห็นต่อธงที่ 2/), "ไม่แน่ใจ");
    await user.selectOptions(screen.getByLabelText("คุณคือ"), "เภสัชกร");
    await user.type(screen.getByLabelText("ความเห็น"), "ทดสอบ");
    expect(screen.getByLabelText("ความเห็น")).toHaveAttribute("maxlength", "500");
    expect(screen.getByLabelText("ความเห็น").getAttribute("placeholder")).toContain("ห้ามใส่ข้อมูลส่วนตัว");
    await user.click(screen.getByRole("button", { name: "ส่งความเห็น" }));
    await screen.findByText("ขอบคุณ ส่งแล้ว");
    expect(calls).toHaveLength(1);
    const p = calls[0].body;
    expect(calls[0].url).toBe("/api/feedback");
    expect(Object.keys(p).sort()).toEqual(["case_id", "comment", "entries", "reviewer_role", "session_id", "time_spent_sec"]);
    expect(p.entries).toEqual([{ flag_id: "F-1", agree: true }, { flag_id: "F-2", agree: "unsure" }]);
    expect(p.reviewer_role).toBe("pharmacist");
    expect(p.comment).toBe("ทดสอบ");
    const s = JSON.stringify(p);
    for (const w of ["warfarin", "htn", "khing", "ขิง", "pregnant", "profile", "age"]) expect(s).not.toContain(w);
  });
});

test("อภิธานศัพท์ อธิบายชั้นหลักฐาน A/B/C และ ร่าง", () => {
  show();
  expect(screen.getByText(/ชั้น A:/)).toBeInTheDocument();
  expect(screen.getByText(/ชั้น B:/)).toBeInTheDocument();
  expect(screen.getByText(/ชั้น C:/)).toBeInTheDocument();
  expect(screen.getByText(/^ร่าง:/)).toBeInTheDocument();
});
