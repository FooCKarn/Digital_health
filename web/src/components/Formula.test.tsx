import { fireEvent, render, screen, within } from "@testing-library/preact";
import { ActiveList } from "./ActiveList";
import { AddSheet } from "./AddSheet";
import { FlagCard } from "./FlagCard";
import { ChatStore } from "../chat/chatStore";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";
import type { Analysis } from "../hooks/useAnalysis";
import { flag, META, T } from "../test/fixtures";

const mem = (): KeyValueStorage => { const d = new Map<string, string>(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) }; };
const idle: Analysis = { status: "idle", result: null, summary: null, stale: false, current: false, error: null, retry() {} };

test("แผงเพิ่มรายการมีตัวเลือก ตำรับ แยกจากสมุนไพร พร้อมคำอธิบายขอบเขต และเพิ่มเป็นชนิด ตำรับ", () => {
  const store = new TrackerStore(mem(), () => T);
  render(<AddSheet meta={META} store={store} today={T} onClose={() => {}} />);
  const pick = screen.getByRole("button", { name: "ตำรับทดสอบ (ตำรับ)" });
  expect(screen.queryByText("คำอธิบายขอบเขตทดสอบ")).toBeNull();
  fireEvent.click(pick);
  expect(screen.getByText("คำอธิบายขอบเขตทดสอบ")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม" }));
  expect(store.active().map((i) => [i.kind, i.ref])).toEqual([["formula", "tonic"]]);
});

test("ค้นหาในแผงเพิ่มรายการกรองตำรับด้วย", () => {
  const store = new TrackerStore(mem(), () => T);
  render(<AddSheet meta={META} store={store} today={T} onClose={() => {}} />);
  fireEvent.input(screen.getByLabelText("ค้นหา หรือพิมพ์ชื่อยา"), { target: { value: "ขิง" } });
  expect(screen.queryByRole("button", { name: "ตำรับทดสอบ (ตำรับ)" })).toBeNull();
  expect(screen.getByRole("button", { name: "ขิง (สมุนไพร)" })).toBeInTheDocument();
});

test("รายการที่กำลังใช้บอกชนิดว่า ตำรับ", () => {
  const store = new TrackerStore(mem(), () => T);
  store.addItem({ kind: "formula", ref: "tonic", label: "ตำรับทดสอบ", start_date: T });
  render(<ActiveList store={store} today={T} analysis={idle} />);
  expect(screen.getByText("ตำรับ · วันที่ 1")).toBeInTheDocument();
});

test("การ์ดธงอ้างเอกสารต้นทางของธงนั้น: ตำรับอ้างแนวทางตำรับ ไม่ใช่เล่ม TTM first; ธงสมุนไพรยังอ้างเล่มเดิม", () => {
  const { unmount } = render(<ul><FlagCard flag={flag({ herb_id: "tonic", source_page: 4, pdf_page: 5, source_doc_th: "แนวทางการตั้งตำรับยาบำรุงโลหิต" })} /></ul>);
  fireEvent.click(screen.getByText("ดูหลักฐาน"));
  expect(screen.getByText(/แนวทางการตั้งตำรับยาบำรุงโลหิต หน้า 4 \(หน้า 5 ในไฟล์ PDF\)/)).toBeInTheDocument();
  expect(screen.queryByText(/TTM first/)).toBeNull();
  unmount();
  render(<ul><FlagCard flag={flag()} /></ul>);
  fireEvent.click(screen.getByText("ดูหลักฐาน"));
  expect(screen.getByText(/หนังสือแนวทางการใช้ยาสมุนไพรฯ \(TTM first\) หน้า 12/)).toBeInTheDocument();
});

test("ประวัติแชตเก็บชื่อเอกสารต้นทางของการอ้างอิงตำรับ และไม่เติมคีย์ให้การอ้างอิงเดิม", () => {
  const st = mem();
  const chat = new ChatStore(st as unknown as Storage);
  chat.add({ r: "a", t: "ตอบ", src: "database", old: false, cites: [
    { item_id: "a", herb_id: "tonic", herb_name_th: "ตำรับ", source_page: 4, pdf_page: 5, evidence_quote: "วลี", verified: false, source_doc_th: "แนวทางตำรับ" },
    { item_id: "b", herb_id: "khing", herb_name_th: "ขิง", source_page: 80, pdf_page: 88, evidence_quote: "วลี", verified: false },
  ] } as never);
  const again = new ChatStore(st as unknown as Storage);
  const m = again.msgs.find((x) => x.r === "a");
  expect(m && m.r === "a" && m.cites[0].source_doc_th).toBe("แนวทางตำรับ");
  expect(m && m.r === "a" && "source_doc_th" in m.cites[1]).toBe(false);
  void within;
});
