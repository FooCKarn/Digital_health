import { act, renderHook } from "@testing-library/preact";
import { TrackerStore } from "../model/tracker";
import { body, flag, respond, T } from "../test/fixtures";
import { useAnalysis } from "./useAnalysis";

const FIXED = "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง";

function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = (ms = 300) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); });

let store: TrackerStore;
beforeEach(() => {
  vi.useFakeTimers();
  store = new TrackerStore(null, () => T);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const add = (kind: "herb" | "drug", ref: string) => act(() => void store.addItem({ kind, ref, label: ref, start_date: T }));

test("(ก) เปลี่ยนรายการสองครั้ง ใช้ผลครั้งหลังเท่านั้น ผลช้าของครั้งแรกถูกทิ้ง", async () => {
  const d1 = deferred(), d2 = deferred();
  const f = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
  vi.stubGlobal("fetch", f);
  const { result } = renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick();
  expect(f).toHaveBeenCalledTimes(1);
  await add("herb", "fathalai");
  await tick();
  expect(f).toHaveBeenCalledTimes(2);
  // คำขอแรกถูกยกเลิก
  expect((f.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true);
  // ผลแรกมาถึงหลังข้อมูลเปลี่ยน: ต้องไม่แสดงเป็นผลปัจจุบัน
  d1.resolve(respond(body([flag({ message_th: "ผลเก่า" })])));
  await settle();
  expect(result.current.result).toBeNull();
  expect(result.current.status).toBe("loading");
  d2.resolve(respond(body([flag({ message_th: "ผลใหม่" })])));
  await settle();
  expect(result.current.status).toBe("ok");
  expect(result.current.result!.flags[0].message_th).toBe("ผลใหม่");
});

test("หน่วงเวลา 300 ms ก่อนเรียก", async () => {
  const f = vi.fn(async () => respond(body()));
  vi.stubGlobal("fetch", f);
  renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick(299);
  expect(f).not.toHaveBeenCalled();
  await tick(1);
  expect(f).toHaveBeenCalledTimes(1);
});

test("(ข) ไม่มีสมุนไพร (มีแต่ยา) ไม่เรียก fetch และสถานะ idle", async () => {
  const f = vi.fn(async () => respond(body()));
  vi.stubGlobal("fetch", f);
  const { result } = renderHook(() => useAnalysis(store, T));
  await add("drug", "warfarin");
  await tick(1000);
  expect(f).not.toHaveBeenCalled();
  expect(result.current.status).toBe("idle");
  expect(result.current.result).toBeNull();
});

test("(ค) ตรวจล้มเหลว คงผลเก่า stale=true ข้อความไทยตายตัว ไม่ล้างรายการ; (ง) retry เรียกใหม่และล้าง error", async () => {
  const f = vi.fn(async () => respond(body([flag({ message_th: "ผลแรก" })])));
  vi.stubGlobal("fetch", f);
  const { result } = renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick();
  await settle();
  expect(result.current.status).toBe("ok");

  f.mockImplementation(async () => respond({ error: "server_error", detail: "boom" }, 500));
  await add("herb", "fathalai");
  await tick();
  await settle();
  expect(result.current.status).toBe("error");
  expect(result.current.stale).toBe(true);
  expect(result.current.error).toBe(FIXED);
  expect(result.current.result!.flags[0].message_th).toBe("ผลแรก");
  expect(store.active()).toHaveLength(2);

  f.mockImplementation(async () => respond(body([flag({ message_th: "ผลใหม่" })])));
  act(() => result.current.retry());
  await tick();
  await settle();
  expect(f).toHaveBeenCalledTimes(3);
  expect(result.current.status).toBe("ok");
  expect(result.current.error).toBeNull();
  expect(result.current.stale).toBe(false);
  expect(result.current.result!.flags[0].message_th).toBe("ผลใหม่");
});

test("คำขอที่ถูกยกเลิกไม่กลายเป็น error", async () => {
  const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) =>
    init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
  vi.stubGlobal("fetch", f);
  const { result, unmount } = renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick();
  await add("herb", "fathalai");
  await settle();
  expect(result.current.error).toBeNull();
  expect(result.current.status).toBe("loading");
  unmount();
});

test("แก้โปรไฟล์ = ตรวจใหม่", async () => {
  const f = vi.fn(async () => respond(body()));
  vi.stubGlobal("fetch", f);
  renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick();
  await settle();
  act(() => void store.setProfile({ age: 30, pregnant: null, breastfeeding: null, conditions: [] }));
  await tick();
  expect(f).toHaveBeenCalledTimes(2);
  expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).profile.age).toBe(30);
});

test("current: true เฉพาะเมื่อผลตรงกับข้อมูล ณ render นี้ (รวม render ก่อน effect ทำงาน)", async () => {
  const f = vi.fn(async () => respond(body()));
  vi.stubGlobal("fetch", f);
  const log: { n: number; current: boolean; status: string }[] = [];
  const { result } = renderHook(() => {
    const r = useAnalysis(store, T);
    log.push({ n: store.active().length, current: r.current, status: r.status });
    return r;
  });
  await add("herb", "khing");
  await tick();
  await settle();
  expect(result.current.current).toBe(true); // ไม่ควรเตือน: ผลปัจจุบัน
  f.mockImplementation(() => new Promise(() => {}));
  await add("drug", "warfarin");
  const after = log.filter((e) => e.n === 2);
  expect(after.some((e) => e.status === "ok")).toBe(true); // มี render ก่อน effect ตั้ง loading จริง
  expect(after.every((e) => !e.current)).toBe(true);
  expect(result.current.result).not.toBeNull();
});

test("ผลที่มาถึงหลัง unmount ไม่ถูกนำไปใช้", async () => {
  const d = deferred();
  const f = vi.fn().mockReturnValue(d.promise);
  vi.stubGlobal("fetch", f);
  const { result, unmount } = renderHook(() => useAnalysis(store, T));
  await add("herb", "khing");
  await tick();
  const before = result.current;
  unmount();
  d.resolve(respond(body()));
  await settle();
  expect(result.current).toBe(before);
});
