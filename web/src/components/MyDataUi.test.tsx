import { fireEvent, render, screen, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import type { Analysis } from "../hooks/useAnalysis";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import { META, T } from "../test/fixtures";
import { MyData } from "./MyData";

const mem = (): KeyValueStorage => { const d = new Map<string, string>(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry: () => {} };
const condNames = Object.values(META.conditions);

function show() {
  const store = new TrackerStore(mem(), () => T, { knownConditions: Object.keys(META.conditions) });
  render(<MyData store={store} meta={META} today={T} analysis={idle} />);
  return store;
}

describe("เลือกโรค/สภาวะแบบชิป", () => {
  test("ติ๊กแล้วขึ้นในแถบ เลือกแล้ว + นับจำนวน; กด × เอาออกได้; บันทึกลง store จริง", async () => {
    const user = userEvent.setup();
    const store = show();
    const first = condNames[0];
    expect(screen.getByText(`เลือกแล้ว 0 จาก ${condNames.length}`)).toBeInTheDocument();
    await user.click(screen.getByLabelText(first));
    expect(screen.getByLabelText(first)).toBeChecked();
    expect(screen.getByText(`เลือกแล้ว 1 จาก ${condNames.length}`)).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "โรค/สภาวะที่เลือกไว้" });
    expect(within(strip).getByText(first)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
    expect(store.state.profile.conditions).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: `เอาออก ${first}` }));
    expect(screen.getByLabelText(first)).not.toBeChecked();
    expect(screen.queryByRole("list", { name: "โรค/สภาวะที่เลือกไว้" })).toBeNull();
  });

  test("ค้นหากรองรายการ (ซ่อนที่ไม่ตรง) แต่ช่องที่เลือกไว้ยังอยู่ใน state; ไม่พบ = ข้อความบอก; Enter ในช่องค้นหาไม่ส่งฟอร์ม", async () => {
    const user = userEvent.setup();
    const store = show();
    const a = condNames[0];
    await user.click(screen.getByLabelText(a));
    const q = screen.getByLabelText("ค้นหาโรค/สภาวะ");
    const chips = () => [...document.querySelectorAll<HTMLElement>("label.chip-opt")];
    await user.type(q, a.slice(0, 2)); // ตรง -> ไม่ถูกซ่อน
    expect(chips().filter((l) => l.hidden)).toHaveLength(chips().length - chips().filter((l) => l.textContent!.includes(a.slice(0, 2))).length);
    expect(document.querySelector<HTMLDetailsElement>("details.cond-all")!.open).toBe(true);
    await user.type(q, "{Enter}");
    expect(screen.queryByText(/บันทึกแล้ว/)).toBeNull(); // Enter ไม่ได้ submit
    expect(store.state.profile.conditions).toHaveLength(0);
    await user.clear(q);
    await user.type(q, "zzzไม่มีแน่นอน");
    expect(chips().every((l) => l.hidden)).toBe(true);
    expect(screen.getByText("ไม่พบรายการที่ตรงกับคำค้น")).toBeInTheDocument();
    await user.clear(q);
    expect(chips().every((l) => !l.hidden)).toBe(true);
    expect(screen.getByLabelText(a)).toBeChecked(); // ค่าที่เลือกไม่หายเพราะการค้นหา
  });

  test("ตั้งครรภ์/ให้นมบุตรยังเป็น select 3 ค่า และบอกชัดเมื่อยังไม่ระบุ", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getAllByText("ยังไม่ระบุ: จะไม่ตรวจข้อนี้")).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("ตั้งครรภ์"), "ไม่ใช่");
    expect(screen.getAllByText("ยังไม่ระบุ: จะไม่ตรวจข้อนี้")).toHaveLength(1);
    expect(screen.getByLabelText("ตั้งครรภ์").tagName).toBe("SELECT");
  });
});

describe("สำรอง/ลบข้อมูล", () => {
  test("ลบ 2 ขั้น: เปิดกล่องแล้วโฟกัสอยู่ที่ ยกเลิก; ยกเลิกแล้วโฟกัสกลับปุ่มลบ และไม่ลบอะไร", async () => {
    const user = userEvent.setup();
    const store = show();
    store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T });
    await user.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    const box = screen.getByRole("group", { name: "ยืนยันการลบ" });
    expect(within(box).getByRole("button", { name: "ยกเลิก" })).toHaveFocus();
    await user.click(within(box).getByRole("button", { name: "ยกเลิก" }));
    expect(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" })).toHaveFocus();
    expect(store.state.items).toHaveLength(1);
  });

  test("ปุ่มนำเข้าเป็น label ไทยผูกกับ input[type=file] (ไม่มีข้อความ Choose File ภาษาอังกฤษ)", () => {
    show();
    const input = screen.getByLabelText("นำเข้าข้อมูลจากไฟล์") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input).toHaveClass("sr-only");
    expect(input.closest("label")).toHaveClass("file-btn");
  });
});

test("ส่วนอธิบายชั้นหลักฐานและช่วยเราปรับปรุงเป็น details แยกกัน ปิดไว้ก่อน และไม่มีคำว่าปลอดภัย", () => {
  show();
  const ds = [...document.querySelectorAll("details.opt-box")] as HTMLDetailsElement[];
  expect(ds).toHaveLength(2);
  expect(ds.every((d) => !d.open)).toBe(true);
  expect(ds[0].textContent).toContain("ชั้นหลักฐาน A/B/C");
  expect(ds[1].textContent).not.toContain("ชั้นหลักฐาน A/B/C");
  fireEvent.click(screen.getByText("ช่วยเราปรับปรุง (ทดลองใช้)", { selector: "summary" }));
  expect(document.body.textContent).not.toMatch(/ปลอดภัย/);
});
