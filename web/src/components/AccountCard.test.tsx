import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { AccountCard } from "./AccountCard";
import { POLICY_VERSION } from "./Policy";
import { CloudSync, type Caller } from "../model/cloud";
import { DiaryStore } from "../model/diary";
import { ReminderStore } from "../model/reminder";
import { TrackerStore, type KeyValueStorage } from "../model/tracker";

const TODAY = "2026-10-12";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };

function setup(me: { user: { handle: string } | null } | 404, extra: Record<string, (b: any) => { status: number; data: any }> = {}) {
  const tracker = new TrackerStore(mem(), () => TODAY), diary = new DiaryStore(mem(), () => TODAY), reminder = new ReminderStore(mem());
  const calls: string[] = [];
  const caller: Caller = async (method, url, body) => {
    calls.push(`${method} ${url} ${body ? JSON.stringify(body) : ""}`.trim());
    const h = extra[`${method} ${url}`];
    if (h) return h(body);
    if (url === "/api/auth/me") return me === 404 ? { status: 404, data: null } : { status: 200, data: me };
    if (url === "/api/state" && method === "GET") return { status: 200, data: { state: { version: 0, updated_at: null, tracker: null, diary: null, reminder: null } } };
    return { status: 404, data: null };
  };
  const cloud = new CloudSync(tracker, diary, reminder, caller);
  render(<AccountCard cloud={cloud} />);
  return { cloud, calls, tracker };
}

test("เซิร์ฟเวอร์ไม่มีระบบบัญชี: ไม่แสดงการ์ดเลย", async () => {
  const { cloud } = setup(404);
  await cloud.init();
  expect(screen.queryByText(/บัญชีและซิงก์ข้อมูล/)).toBeNull();
});

test("ยังไม่เข้าสู่ระบบ: อธิบายว่าข้อมูลอยู่ในเครื่องและการสมัครไม่บังคับ; สมัครต้องติ๊กยอมรับนโยบายก่อน และบอกว่ากู้รหัสผ่านไม่ได้", async () => {
  const { cloud, calls } = setup({ user: null }, {
    "POST /api/auth/register": (b) => ({ status: 200, data: { user: { handle: b.handle } } }),
  });
  await cloud.init();
  expect(await screen.findByText(/ข้อมูลอยู่ในเครื่องนี้เท่านั้น/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "สมัครบัญชี" }));
  expect(screen.getByText(/กู้รหัสผ่านที่ลืมให้ไม่ได้/)).toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "สมัครและซิงก์ข้อมูล" });
  expect(submit).toBeDisabled();
  fireEvent.input(screen.getByLabelText("ชื่อผู้ใช้"), { target: { value: "somchai" } });
  fireEvent.input(screen.getByLabelText("รหัสผ่าน"), { target: { value: "correct-horse-battery" } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(submit).not.toBeDisabled();
  fireEvent.click(submit);
  await waitFor(() => expect(screen.getByText("somchai")).toBeInTheDocument());
  expect(calls.some((c) => c.startsWith("POST /api/auth/register") && c.includes(POLICY_VERSION))).toBe(true);
});

test("เข้าสู่ระบบผิด: แสดงข้อความไทยจากเซิร์ฟเวอร์ ไม่เข้า", async () => {
  const { cloud } = setup({ user: null }, { "POST /api/auth/login": () => ({ status: 401, data: { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" } }) });
  await cloud.init();
  fireEvent.input(await screen.findByLabelText("ชื่อผู้ใช้"), { target: { value: "somchai" } });
  fireEvent.input(screen.getByLabelText("รหัสผ่าน"), { target: { value: "wrong-password-1" } });
  fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  expect(cloud.handle).toBeNull();
});

test("เข้าสู่ระบบอยู่: แสดงชื่อ ออกจากระบบได้ และลบบัญชีต้องใส่รหัสผ่านยืนยัน", async () => {
  const { cloud, calls } = setup({ user: { handle: "somchai" } }, {
    "POST /api/auth/logout": () => ({ status: 200, data: { ok: true } }),
    "DELETE /api/account": (b) => (b.password === "correct-horse-battery" ? { status: 200, data: { ok: true } } : { status: 401, data: { error: "รหัสผ่านไม่ถูกต้อง" } }),
  });
  await cloud.init();
  expect(await screen.findByText("somchai")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลบบัญชี" }));
  fireEvent.input(screen.getByLabelText("ใส่รหัสผ่านเพื่อยืนยัน"), { target: { value: "wrong-password-1" } });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบบัญชี" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("รหัสผ่านไม่ถูกต้อง");
  expect(cloud.handle).toBe("somchai");
  fireEvent.input(screen.getByLabelText("ใส่รหัสผ่านเพื่อยืนยัน"), { target: { value: "correct-horse-battery" } });
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบบัญชี" }));
  await waitFor(() => expect(cloud.handle).toBeNull());
  expect(calls.filter((c) => c.startsWith("DELETE /api/account"))).toHaveLength(2);
});

test("ข้อมูลสองฝั่งต่างกัน: ขึ้นให้เลือก ไม่รวมให้เอง", async () => {
  const { cloud, tracker } = setup({ user: { handle: "somchai" } }, {
    "GET /api/state": () => ({ status: 200, data: { state: { version: 3, updated_at: "x", diary: null, reminder: null,
      tracker: { v: 1, items: [{ id: "r1", kind: "herb", ref: "garlic", label: "กระเทียม", start_date: "2026-10-01", end_date: null }], profile: { age: null, pregnant: null, breastfeeding: null, conditions: [] } } } } }),
  });
  tracker.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-10" });
  await cloud.init();
  expect(await screen.findByText(/ต่างกัน ระบบจะไม่รวมหรือทับให้เอง/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ใช้ข้อมูลในคลาวด์" }));
  await waitFor(() => expect(tracker.state.items.map((i) => i.label)).toEqual(["กระเทียม"]));
});

test("openSignal: กางการ์ดบัญชีที่พับอยู่ และโฟกัสเข้าไปในการ์ด", async () => {
  const caller: Caller = async (_m, url) => (url === "/api/auth/me" ? { status: 200, data: { user: null } } : { status: 200, data: {} });
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  const cloud = new CloudSync(new TrackerStore(st, () => "2026-10-13"), new DiaryStore(st, () => "2026-10-13"), new ReminderStore(st), caller);
  await cloud.init();
  Element.prototype.scrollIntoView = vi.fn();
  const { container, rerender } = render(<AccountCard cloud={cloud} openSignal={0} />);
  const d = container.querySelector("details")!;
  expect(d.open).toBe(false);
  rerender(<AccountCard cloud={cloud} openSignal={1} />);
  expect(d.open).toBe(true);
  expect(d.contains(document.activeElement)).toBe(true);
});
