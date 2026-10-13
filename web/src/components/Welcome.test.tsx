import { fireEvent, render, screen } from "@testing-library/preact";
import { CloudSync, type Caller } from "../model/cloud";
import { DiaryStore } from "../model/diary";
import { ReminderStore } from "../model/reminder";
import { TrackerStore } from "../model/tracker";
import { GUIDE_STEPS, Welcome, WELCOME_KEY } from "./Welcome";

const mk = async (me: unknown) => {
  const caller: Caller = async (_m, url) => (url === "/api/auth/me" ? { status: me === null ? 404 : 200, data: me } : { status: 200, data: {} });
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const cloud = new CloudSync(new TrackerStore(st, () => "2026-10-13"), new DiaryStore(st, () => "2026-10-13"), new ReminderStore(st), caller);
  await cloud.init();
  return { cloud, st };
};

test("ครั้งแรก: เลือก guest แล้วดูไกด์จนจบ จำว่าเห็นแล้ว", async () => {
  const { cloud, st } = await mk({ user: null });
  const { container } = render(<Welcome cloud={cloud} storage={st} />);
  fireEvent.click(screen.getByRole("button", { name: "ใช้แบบ guest" }));
  for (let i = 0; i < GUIDE_STEPS.length - 1; i++) fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(screen.getByText(/ไม่ใช่การวินิจฉัย/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "เริ่มใช้งาน" }));
  expect(container).toBeEmptyDOMElement();
  expect(st.getItem(WELCOME_KEY)).toBe("1");
});

test("ข้ามไกด์ได้ และเปิดซ้ำไม่แสดงอีก", async () => {
  const { cloud, st } = await mk({ user: null });
  const r = render(<Welcome cloud={cloud} storage={st} />);
  fireEvent.click(screen.getByRole("button", { name: "ใช้แบบ guest" }));
  fireEvent.click(screen.getByRole("button", { name: "ข้าม" }));
  expect(st.getItem(WELCOME_KEY)).toBe("1");
  r.unmount();
  const again = render(<Welcome cloud={cloud} storage={st} />);
  expect(again.container).toBeEmptyDOMElement();
});

test("เลือกเข้าสู่ระบบ: แสดงฟอร์มบัญชี", async () => {
  const { cloud, st } = await mk({ user: null });
  render(<Welcome cloud={cloud} storage={st} />);
  fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ / สมัคร" }));
  expect(screen.getByLabelText("ชื่อผู้ใช้")).toBeInTheDocument();
});

test("เข้าสู่ระบบอยู่แล้ว หรือเซิร์ฟเวอร์ไม่มีระบบบัญชี: ข้ามหน้าเลือก ไปไกด์เลย", async () => {
  for (const me of [{ user: { handle: "abc" } }, null]) {
    const { cloud, st } = await mk(me);
    const r = render(<Welcome cloud={cloud} storage={st} />);
    expect(screen.queryByRole("button", { name: "ใช้แบบ guest" })).toBeNull();
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeInTheDocument();
    r.unmount();
  }
});
