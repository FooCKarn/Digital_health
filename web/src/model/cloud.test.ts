import { CloudSync, type Caller } from "./cloud";
import { DiaryStore } from "./diary";
import { ReminderStore } from "./reminder";
import { TrackerStore, type KeyValueStorage } from "./tracker";

const TODAY = "2026-10-12";
const mem = (): KeyValueStorage => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };

function device() {
  const tracker = new TrackerStore(mem(), () => TODAY);
  const diary = new DiaryStore(mem(), () => TODAY);
  const reminder = new ReminderStore(mem());
  return { tracker, diary, reminder };
}

/** เซิร์ฟเวอร์จำลองในหน่วยความจำ: บัญชีเดียว สถานะเดียว เลขเวอร์ชันแบบเดียวกับของจริง */
function fakeServer(opts: { me?: number } = {}) {
  const s = { user: null as string | null, state: { version: 0, updated_at: null as string | null, tracker: null as any, diary: null as any, reminder: null as any }, calls: [] as string[], fail: false, putStatus: 0 };
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    s.calls.push(`${method} ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (s.fail) throw new TypeError("network");
    if (url === "/api/auth/me") return opts.me ? json(opts.me, {}) : json(200, { user: s.user ? { handle: s.user } : null });
    if (url === "/api/auth/register" || url === "/api/auth/login") {
      if (body.password === "wrong-password-1") return json(401, { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      s.user = body.handle; return json(200, { user: { handle: body.handle } });
    }
    if (url === "/api/auth/logout") { s.user = null; return json(200, { ok: true }); }
    if (url === "/api/account") {
      if (body.password !== "correct-horse-battery") return json(401, { error: "รหัสผ่านไม่ถูกต้อง" });
      s.user = null; s.state = { version: 0, updated_at: null, tracker: null, diary: null, reminder: null }; return json(200, { ok: true });
    }
    if (url === "/api/state" && method === "GET") return s.user ? json(200, { state: s.state }) : json(401, { error: "ยังไม่ได้เข้าสู่ระบบ" });
    if (url === "/api/state" && method === "PUT") {
      if (s.putStatus) return json(s.putStatus, { error: "ข้อมูลในคลาวด์ถูกแก้จากเครื่องอื่นแล้ว", state: s.state });
      if (body.base_version !== s.state.version) return json(409, { error: "ข้อมูลในคลาวด์ถูกแก้จากเครื่องอื่นแล้ว", state: s.state });
      s.state = { version: s.state.version + 1, updated_at: "2026-10-12T09:00:00Z", tracker: body.tracker ?? s.state.tracker, diary: body.diary ?? s.state.diary, reminder: body.reminder ?? s.state.reminder };
      return json(200, { state: s.state });
    }
    return json(404, {});
  });
  const caller: Caller = async (method, url, body) => {
    const res = await (f as unknown as typeof fetch)(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { s, f: caller };
}
const addHerb = (d: ReturnType<typeof device>, ref = "khing", label = "ขิง") => d.tracker.addItem({ kind: "herb", ref, label, start_date: "2026-10-10" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("เซิร์ฟเวอร์ไม่มีระบบบัญชี (404) = ซ่อนฟีเจอร์ ยังไม่เข้าสู่ระบบ = anonymous", async () => {
  const a = device(), b = device();
  const c1 = new CloudSync(a.tracker, a.diary, a.reminder, fakeServer({ me: 404 }).f);
  await c1.init();
  expect(c1.status).toBe("unavailable");
  const c2 = new CloudSync(b.tracker, b.diary, b.reminder, fakeServer().f);
  await c2.init();
  expect(c2.status).toBe("anonymous");
});

test("สมัครแล้วข้อมูลในเครื่องขึ้นคลาวด์ครั้งแรก (เวอร์ชัน 1) และสมัครมือเปล่าไม่ส่งข้อมูลว่าง", async () => {
  const { s, f } = fakeServer();
  const d = device();
  addHerb(d);
  d.diary.saveEntry({ date: TODAY, mood: 4, symptom: null, sys: null, dia: null, glucose: null, weight: 60 });
  const c = new CloudSync(d.tracker, d.diary, d.reminder, f);
  await c.init();
  expect(await c.register("somchai", "correct-horse-battery", "v1")).toBe(true);
  expect(c.status).toBe("ready");
  expect(s.state.version).toBe(1);
  expect(s.state.tracker.items[0].label).toBe("ขิง");
  expect(s.state.diary.entries[0].weight).toBe(60);

  const e = device();
  const fresh = fakeServer();
  const c2 = new CloudSync(e.tracker, e.diary, e.reminder, fresh.f);
  await c2.register("empty-user", "correct-horse-battery", "v1");
  expect(fresh.s.calls.filter((x) => x.startsWith("PUT"))).toHaveLength(0);
});

test("เข้าสู่ระบบจากเครื่องใหม่ (ว่าง) ดึงข้อมูลจากคลาวด์มาใส่", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a);
  a.reminder.setTime("20:00");
  await new CloudSync(a.tracker, a.diary, a.reminder, f).register("somchai", "correct-horse-battery", "v1");
  const b = device();
  const cb = new CloudSync(b.tracker, b.diary, b.reminder, f);
  expect(await cb.login("somchai", "correct-horse-battery")).toBe(true);
  expect(b.tracker.state.items.map((i) => i.label)).toEqual(["ขิง"]);
  expect(b.reminder.state.time).toBe("20:00");
  expect(s.state.version).toBeGreaterThanOrEqual(1);
});

test("สองฝั่งมีข้อมูลต่างกัน: รอให้ผู้ใช้เลือก ไม่รวม/ไม่ทับเอง; เลือกคลาวด์ = แทนที่เครื่องนี้, เลือกเครื่องนี้ = ทับคลาวด์", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a, "khing", "ขิง");
  await new CloudSync(a.tracker, a.diary, a.reminder, f).register("somchai", "correct-horse-battery", "v1");

  const b = device();
  addHerb(b, "garlic", "กระเทียม");
  const cb = new CloudSync(b.tracker, b.diary, b.reminder, f);
  await cb.login("somchai", "correct-horse-battery");
  expect(cb.status).toBe("conflict");
  expect(b.tracker.state.items.map((i) => i.label)).toEqual(["กระเทียม"]);
  expect(s.state.tracker.items[0].label).toBe("ขิง");
  await cb.resolve("cloud");
  expect(b.tracker.state.items.map((i) => i.label)).toEqual(["ขิง"]);
  expect(cb.status).toBe("ready");

  const c = device();
  addHerb(c, "garlic", "กระเทียม");
  const cc = new CloudSync(c.tracker, c.diary, c.reminder, f);
  await cc.login("somchai", "correct-horse-battery");
  expect(cc.status).toBe("conflict");
  await cc.resolve("local");
  expect(s.state.tracker.items[0].label).toBe("กระเทียม");
  expect(cc.status).toBe("ready");
});

test("แก้ไขข้อมูลแล้วซิงก์อัตโนมัติแบบหน่วงเวลา (รวมหลายการแก้เป็นครั้งเดียว); ตอนนำข้อมูลจากคลาวด์มาใส่ไม่ส่งกลับ", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a);
  const c = new CloudSync(a.tracker, a.diary, a.reminder, f);
  await c.register("somchai", "correct-horse-battery", "v1");
  const puts = () => s.calls.filter((x) => x.startsWith("PUT")).length;
  const base = puts();
  addHerb(a, "garlic", "กระเทียม");
  a.diary.toggleTaken(a.tracker.active()[0].id, TODAY);
  expect(puts()).toBe(base);
  await vi.advanceTimersByTimeAsync(1600);
  expect(puts()).toBe(base + 1);
  expect(s.state.tracker.items).toHaveLength(2);

  const b = device();
  const cb = new CloudSync(b.tracker, b.diary, b.reminder, f);
  await cb.login("somchai", "correct-horse-battery");
  const putsAfterPull = puts();
  await vi.advanceTimersByTimeAsync(3000);
  expect(puts()).toBe(putsAfterPull);
});

test("ล้างข้อมูลในเครื่องไม่ทำให้คลาวด์ว่างตาม (ไม่ส่งข้อมูลว่างอัตโนมัติ)", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a);
  const c = new CloudSync(a.tracker, a.diary, a.reminder, f);
  await c.register("somchai", "correct-horse-battery", "v1");
  a.tracker.clearAll(); a.diary.clearAll();
  await vi.advanceTimersByTimeAsync(3000);
  expect(s.state.tracker.items).toHaveLength(1);
  await c.clearCloudData();                                   // ลบข้อมูลคลาวด์ต้องกดเอง
  expect(s.state.tracker.items).toHaveLength(0);
  expect(c.status).toBe("ready");
});

test("ชนกับเครื่องอื่นตอนส่ง (409) = conflict พร้อมข้อมูลล่าสุด ข้อมูลในเครื่องไม่หาย; เครือข่ายล้ม = error และข้อมูลในเครื่องอยู่ครบ", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a);
  const c = new CloudSync(a.tracker, a.diary, a.reminder, f);
  await c.register("somchai", "correct-horse-battery", "v1");
  s.state = { ...s.state, version: 7 };                        // อีกเครื่องแก้ไปแล้ว
  addHerb(a, "garlic", "กระเทียม");
  await vi.advanceTimersByTimeAsync(1600);
  expect(c.status).toBe("conflict");
  expect(a.tracker.state.items).toHaveLength(2);
  await c.resolve("local");
  expect(c.status).toBe("ready");

  s.fail = true;
  addHerb(a, "turmeric", "ขมิ้น");
  await vi.advanceTimersByTimeAsync(1600);
  expect(c.status).toBe("error");
  expect(a.tracker.state.items).toHaveLength(3);
  expect(c.message).toContain("ข้อมูลในเครื่องยังอยู่ครบ");
});

test("รหัสผ่านผิด = ข้อความไทยจากเซิร์ฟเวอร์ ยังเป็น anonymous; ออกจากระบบหยุดซิงก์; ลบบัญชีต้องใช้รหัสผ่านที่ถูก", async () => {
  const { s, f } = fakeServer();
  const a = device();
  addHerb(a);
  const c = new CloudSync(a.tracker, a.diary, a.reminder, f);
  await c.init();
  expect(await c.login("somchai", "wrong-password-1")).toBe(false);
  expect(c.status).toBe("anonymous");
  expect(c.message).toBe("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  await c.register("somchai", "correct-horse-battery", "v1");
  await c.logout();
  expect(c.status).toBe("anonymous");
  const before = s.calls.length;
  addHerb(a, "garlic", "กระเทียม");
  await vi.advanceTimersByTimeAsync(3000);
  expect(s.calls.length).toBe(before);
  await c.login("somchai", "correct-horse-battery");
  expect(await c.deleteAccount("wrong-password-1")).toBe(false);
  expect(c.handle).toBe("somchai");
  expect(await c.deleteAccount("correct-horse-battery")).toBe(true);
  expect(c.status).toBe("anonymous");
  expect(a.tracker.state.items.length).toBeGreaterThan(0);     // ข้อมูลในเครื่องยังอยู่
});
