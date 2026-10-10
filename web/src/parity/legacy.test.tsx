// เทสต์เทียบสถานการณ์ 0-14 ของ scripts/ui_dom_test.js (หน้าเก่า) ที่ยังไม่มีเทสต์ครอบคลุม ดูตาราง scenarios.md
// /api/analyze ตอบด้วยผลจริงของ engine ที่จับไว้ใน src/test/fixtures/*.json (สร้างด้วย web/scripts/gen_fixtures.py)
// payload ที่หน้าเว็บส่งต้องตรงกับ payload ใน fixture ทุกตัว ไม่งั้นเทสต์ล้ม (ข้อมูลผู้ใช้เป็นข้อมูลสมมติ)
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/preact";
import { App } from "../App";
import { useAnalysis } from "../hooks/useAnalysis";
import { todayISO } from "../model/dates";
import { TrackerStore, type Profile } from "../model/tracker";
import { respond, T } from "../test/fixtures";
import type { AnalyzePayload, AnalyzeResult, Meta, Summary } from "../types";

type Fx = { payload: AnalyzePayload; response: { result: AnalyzeResult; summary: Summary } };
const files = import.meta.glob<unknown>("../test/fixtures/*.json", { eager: true, import: "default" });
const fx = (name: string) => files[`../test/fixtures/${name}.json`] as Fx;
const META = files["../test/fixtures/meta.json"] as Meta;
const NO_FLAG = "ไม่พบคำเตือนในฐานข้อมูลนี้";
const NO_FLAG_NOTE = "นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร";
const STALE = "ผลก่อนแก้ไข (ยังไม่ได้ตรวจรายการล่าสุด)";
const PREG_UNCHECKED = /ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): .*การตั้งครรภ์/;
const SLOW = { timeout: 3000 };

// เทียบ payload โดยไม่สนลำดับคีย์
const canon = (x: unknown) => JSON.stringify(x, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);

let analyzeCalls: AnalyzePayload[];
let parseCalls: number;
let unmatched: unknown[];
let fail: boolean;
let gate: Promise<void> | null;

function serve(...names: string[]) {
  const cases = names.map(fx);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/meta") return respond(META);
    if (url === "/api/parse") { parseCalls++; return respond({ error: "no_key" }, 503); }
    if (url !== "/api/analyze") throw new Error(`unexpected ${url}`);
    const p = JSON.parse(String(init!.body));
    analyzeCalls.push(p);
    // ตรวจ payload ก่อนเสมอ (รวมทางที่จำลองล้มเหลว) หน้าเว็บต้องส่งค่าที่มี fixture จาก engine จริง
    const hit = cases.find((c) => canon(c.payload) === canon(p));
    if (!hit) { unmatched.push(p); return respond({ error: "no fixture" }, 500); }
    if (gate) await gate;
    if (fail) return respond({ error: "server_error", detail: "KeyError: boom" }, 500);
    return respond(hit.response);
  }));
}

function seed(items: ["herb" | "drug", string, string][], profile: Partial<Profile> = {}) {
  localStorage.setItem("hg_tracker_v1", JSON.stringify({
    v: 1,
    items: items.map(([kind, ref, label], i) => ({ id: `i${i}`, kind, ref, label, start_date: todayISO(), end_date: null })),
    profile: { age: null, pregnant: null, breastfeeding: null, conditions: [], ...profile },
  }));
}

async function mount() {
  render(<App />);
  await screen.findByRole("tablist", { name: "มุมมอง" });
}
const headline = (name: string) => {
  const s = fx(name).response.summary;
  return s.flags.length || s.aggregates.length ? s.headline_th : NO_FLAG;
};
const result = (name: string) => screen.findByRole("heading", { level: 2, name: headline(name) }, SLOW);
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const view = () => document.querySelector<HTMLElement>(".this-period")!;
const status = () => view().querySelector<HTMLElement>("[role=status]:not(.added-status)")!;
const activeRow = (label: string) => screen.getByText(label, { selector: ".active-list strong" }).closest("li") as HTMLElement;
const pharm = () => screen.getByRole("region", { name: "ใบสรุปสำหรับเภสัชกร" });
const sysText = () => document.body.textContent!.replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "");

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  analyzeCalls = []; parseCalls = 0; unmatched = []; fail = false; gate = null;
});
afterEach(() => {
  expect(unmatched).toEqual([]); // หน้าเว็บส่ง payload ที่ไม่มี fixture จาก engine จริง
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (window as { __xss?: number }).__xss;
});

describe("0) โครงหน้า", () => {
  test("0.3 h1 เดียว อยู่ใน header + main + footer", async () => {
    serve();
    await mount();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).closest("header")).not.toBeNull();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("ห้ามกรอกข้อมูลผู้ป่วยจริง");
    // footer มี disclaimer จาก meta เหมือน #foot ของหน้าเดิม
    await waitFor(() => expect(screen.getByRole("contentinfo")).toHaveTextContent(META.disclaimer_th));
    expect(within(screen.getByRole("contentinfo")).getByText("เกี่ยวกับเครื่องมือนี้")).toBeInTheDocument();
  });

  test("0.5 ผลจริงจาก engine: ข้อความทั้งหน้า (ทุกแท็บ) ไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ", async () => {
    seed([["herb", "khing", "ขิง"], ["herb", "garlic", "กระเทียม"], ["drug", "warfarin", "warfarin"]], { age: 60 });
    serve("khing_garlic_warfarin_60");
    await mount();
    await result("khing_garlic_warfarin_60");
    for (const t of ["ช่วงนี้", "บันทึก", "ข้อมูลของฉัน"]) {
      tab(t);
      expect(sysText()).not.toContain("ปลอดภัย");
    }
  });
});

describe("1) เลือกรายการ", () => {
  test("1.1 รายการให้เลือกครบตาม meta จริง: สมุนไพรและยาทุกตัวในแผ่นเพิ่ม โรค/สภาวะทุกข้อในโปรไฟล์", async () => {
    serve();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
    const pick = within(screen.getByRole("group", { name: "รายการที่เลือกได้" })).getAllByRole("button").map((b) => b.textContent);
    expect(META.herbs.length).toBeGreaterThanOrEqual(21);
    for (const h of META.herbs) expect(pick).toContain(`${h.name_th} (สมุนไพร)`);
    for (const d of META.drugs) expect(pick).toContain(`${d} (ยา)`);
    tab("ข้อมูลของฉัน");
    const conds = Object.values(META.conditions);
    expect(conds.length).toBeGreaterThanOrEqual(20);
    for (const c of conds) expect(screen.getByRole("checkbox", { name: c })).toBeInTheDocument();
  });

  test("1.7 กดเพิ่มโดยยังไม่เลือก: ข้อความไทย role=alert และไม่เพิ่มอะไร", async () => {
    serve();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
    const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
    fireEvent.click(within(d).getByRole("button", { name: "เพิ่ม" }));
    expect(within(d).getByRole("alert")).toHaveTextContent("เลือกสมุนไพรหรือยาก่อน");
    expect(screen.getByText("ยังไม่มีรายการ")).toBeInTheDocument();
  });

  test("1.10 เพิ่มแล้วประกาศ เพิ่ม X แล้ว ในพื้นที่ประกาศแยกจากผลตรวจ (เพิ่มเองและเพิ่มจากข้อเสนอ AI)", async () => {
    serve("khing_only", "khing_warfarin");
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
    const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
    fireEvent.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
    fireEvent.click(within(d).getByRole("button", { name: "เพิ่ม" }));
    const added = view().querySelector<HTMLElement>(".added-status")!;
    expect(added).toHaveAttribute("role", "status");
    expect(added).toHaveTextContent("เพิ่ม ขิง แล้ว");
    expect(added).not.toBe(status());
    expect(screen.getByRole("button", { name: "+ เพิ่ม" })).toHaveFocus();
    await result("khing_only");
    expect(status()).toHaveTextContent(NO_FLAG); // ผลตรวจประกาศแยกกัน
    expect(added).toHaveTextContent("เพิ่ม ขิง แล้ว");
    // เปิดแผ่นเพิ่มใหม่: ล้างข้อความเดิม (ไม่ประกาศซ้ำ)
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
    expect(added).toHaveTextContent("");
    // เพิ่มจากข้อเสนอ AI ที่ผู้ใช้ติ๊กยืนยัน
    vi.mocked(fetch).mockImplementationOnce(async () => respond({ herbs: [], drugs: ["warfarin"], unmatched: [], dropped: 0 }));
    fireEvent.input(screen.getByLabelText(/พิมพ์ข้อความ เช่น/), { target: { value: "กิน warfarin" } });
    fireEvent.click(screen.getByRole("button", { name: "แยกรายการด้วย AI" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /warfarin/ }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันเพิ่ม 1 รายการ" }));
    expect(added).toHaveTextContent("เพิ่ม warfarin แล้ว");
    await result("khing_warfarin");
  });

  test("1.12 หยุดใช้/ลบแถวแล้วโฟกัสไปหัวข้อ กำลังใช้อยู่ (ไม่หลุดไปที่ body)", async () => {
    seed([["herb", "khing", "ขิง"], ["herb", "garlic", "กระเทียม"], ["drug", "warfarin", "warfarin"]], { age: 60 });
    serve("khing_garlic_warfarin_60", "khing_garlic_60");
    await mount();
    await result("khing_garlic_warfarin_60");
    const heading = screen.getByRole("heading", { name: "กำลังใช้อยู่" });
    fireEvent.click(screen.getByRole("button", { name: "หยุดใช้ warfarin" }));
    expect(heading).toHaveFocus();
    await result("khing_garlic_60");
    vi.stubGlobal("confirm", () => true);
    screen.getByRole("button", { name: "ลบ กระเทียม" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "ลบ กระเทียม" }));
    expect(screen.queryByText("กระเทียม", { selector: ".active-list strong" })).toBeNull();
    expect(screen.getByRole("heading", { name: "กำลังใช้อยู่" })).toHaveFocus();
  });
});

test("2) ไม่มีรายการเลย: ข้อความไทย ไม่ส่ง /api/analyze ไม่มี error; เพิ่มสมุนไพรแล้วข้อความหายและตรวจทันที", async () => {
  serve("khing_only");
  await mount();
  expect(screen.getByText("ยังไม่มีสมุนไพรให้ตรวจ", { selector: ".status-line" })).toBeInTheDocument();
  expect(status()).toHaveTextContent("ยังไม่มีสมุนไพรให้ตรวจ");
  await new Promise((r) => setTimeout(r, 400)); // เลยช่วงหน่วง 300 ms
  expect(analyzeCalls).toHaveLength(0);
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
  fireEvent.click(within(d).getByRole("button", { name: "ขิง (สมุนไพร)" }));
  fireEvent.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  expect(screen.queryByText("ยังไม่มีสมุนไพรให้ตรวจ", { selector: ".status-line" })).toBeNull();
  await result("khing_only");
  expect(analyzeCalls).toEqual([fx("khing_only").payload]);
});

describe("3-4) ขิง + กระเทียม + warfarin อายุ 60 (ผลจริงจาก engine)", () => {
  beforeEach(() => {
    seed([["herb", "khing", "ขิง"], ["herb", "garlic", "กระเทียม"], ["drug", "warfarin", "warfarin"]], { age: 60 });
    serve("khing_garlic_warfarin_60");
  });

  test("3.1-3.9 รายการ หัวข้อผล+ประกาศ ขอบเขตก่อนคำเตือน คำเตือนเป็น ul/li มีไอคอน+คำ แถวหลักฐาน ดูหลักฐาน(พับ) และแจ้งไม่ได้ตรวจตั้งครรภ์", async () => {
    await mount();
    const h = await result("khing_garlic_warfarin_60");
    // 3.1 รายการที่กำลังใช้ (แทนแถวที่เลือก + ชิปยา + สรุปจำนวน)
    for (const [label, kind] of [["ขิง", "สมุนไพร"], ["กระเทียม", "สมุนไพร"], ["warfarin", "ยา"]]) expect(activeRow(label)).toHaveTextContent(new RegExp(`${kind} · เริ่มใช้ .*\\(ใช้มา 1 วัน\\)`));
    // 3.2 หัวข้อผลจาก engine และประกาศในพื้นที่ประกาศ (ไม่ย้ายโฟกัสเอง เพราะตรวจอัตโนมัติทุกครั้งที่แก้)
    expect(h.textContent).toMatch(/^พบคำเตือน/);
    expect(status()).toHaveTextContent(h.textContent!);
    // 3.3 ขอบเขต + ไม่ใช่การวินิจฉัย อยู่ก่อนรายการคำเตือน
    const scope = view().querySelector(".scope")!;
    const list = view().querySelector("ul.flags")!;
    expect(scope.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(scope as HTMLElement).getByRole("note")).toHaveTextContent(META.disclaimer_th);
    // 3.4 คำเตือนเป็นรายการ ul/li ทุกข้อมีไอคอน (aria-hidden) + คำ
    const items = [...view().querySelectorAll<HTMLElement>("ul.flags > li")];
    const { flags, aggregates } = fx("khing_garlic_warfarin_60").response.result;
    expect(items.length).toBe(flags.length + aggregates.length);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const li of items) {
      expect(li.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(li.querySelector(".badge > span")!.textContent!.length).toBeGreaterThan(2);
    }
    // 3.5 แถวหลักฐาน
    const cards = items.filter((li) => li.querySelector(".ev"));
    expect(cards).toHaveLength(flags.length);
    for (const c of cards) {
      const chips = [...c.querySelectorAll(".ev .chip")].map((x) => x.textContent!);
      expect(chips.some((x) => /^ชั้นหลักฐาน [AC]$|\(ชั้นหลักฐาน [AC]\)$/.test(x))).toBe(true);
      expect(chips.some((x) => /^หน้า \d+( \(หน้า \d+ ในไฟล์ PDF\))?$/.test(x))).toBe(true);
      expect(chips.some((x) => x.startsWith("ยังรอ") || x === "ตรวจแล้ว")).toBe(true);
      expect(chips.some((x) => /^กฎ R\d$|\(กฎ R\d\)$/.test(x))).toBe(true);
    }
    expect(view().textContent).toContain("ยังรอผู้เชี่ยวชาญตรวจ (ใช้สาธิต)"); // fixture ทุกคำเตือนยัง verified:false
    // 3.6-3.7 ดูหลักฐาน: พับไว้ วลีสั้น <= 250 ตัวอักษร หน้าพิมพ์/หน้า PDF ข้อความเต็มอยู่ในเล่ม
    const evd = [...view().querySelectorAll<HTMLDetailsElement>("li details.evd")];
    expect(evd.length).toBeGreaterThanOrEqual(2);
    for (const x of evd) {
      expect(x.open).toBe(false);
      expect(x.querySelector("summary")!.textContent).toBe("ดูหลักฐาน");
      expect(x.querySelector("blockquote")!.textContent).toMatch(/^“.{2,250}”$/);
      expect(x.textContent).toMatch(/หน้า \d+ \(หน้า \d+ ในไฟล์ PDF\)/);
      expect(x.textContent).toMatch(/ข้อความเต็มและบริบทอยู่ในเล่ม/);
    }
    // 3.9 ไม่ได้ตอบตั้งครรภ์ + ขิงมีกฎตั้งครรภ์ -> แจ้ง ไม่ได้ตรวจ
    expect(view().textContent).toMatch(PREG_UNCHECKED);
  });

  test("4.5-4.6 + 3.8 ใบสรุปเภสัชกร: คอลัมน์บังคับ caption h3 ภาษาไทยไม่มีรหัสภายใน มีโปรไฟล์ อายุ: 60 ปี; ส่วน เพิ่มเติม พับไว้และใช้ h3", async () => {
    await mount();
    await result("khing_garlic_warfarin_60");
    tab("ข้อมูลของฉัน");
    const r = pharm();
    const th = within(r).getAllByRole("columnheader").map((x) => x.textContent);
    for (const c of ["ความรุนแรง", "ชั้นหลักฐาน", "หน้า", "สถานะข้อมูล", "กฎ", "วลีหลักฐาน (ไว้ตรวจเทียบ)"]) expect(th).toContain(c);
    expect(r.querySelector("table caption")).not.toBeNull();
    expect(r.querySelectorAll("h3").length).toBeGreaterThanOrEqual(2);
    expect(r.textContent).not.toMatch(/\[(avoid|caution|info)\]|verified|\b(avoid|caution|info)\b/);
    expect(r.textContent).toContain("อายุ: 60 ปี");
    // 3.8 'เพิ่มเติม' (อภิธานศัพท์ชั้นหลักฐาน) พับไว้และใช้หัวข้อ h3
    const more = [...document.querySelectorAll<HTMLDetailsElement>("details")].find((x) => x.textContent!.includes("ชั้นหลักฐาน A/B/C"))!;
    expect(more.open).toBe(false);
    expect(more.querySelector("h3")).not.toBeNull();
  });
});

test("5) หยุดใช้ยาหลังได้ผล: ผลเดิมไม่แสดงเป็นปัจจุบันระหว่างตรวจใหม่ แล้วตรวจอัตโนมัติและประกาศผลใหม่", async () => {
  seed([["herb", "khing", "ขิง"], ["herb", "garlic", "กระเทียม"], ["drug", "warfarin", "warfarin"]], { age: 60 });
  serve("khing_garlic_warfarin_60", "khing_garlic_60");
  await mount();
  await result("khing_garlic_warfarin_60");
  let open!: () => void;
  gate = new Promise<void>((r) => { open = r; });
  fireEvent.click(screen.getByRole("button", { name: "หยุดใช้ warfarin" }));
  expect(screen.queryByText("warfarin", { selector: ".active-list strong" })).toBeNull();
  // ผลเดิมถูกติดป้ายว่าเป็นผลก่อนแก้ไข ไม่ใช่หัวข้อผล และไม่ถูกประกาศเป็นผลปัจจุบัน
  expect(screen.getByRole("heading", { level: 2, name: STALE })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: headline("khing_garlic_warfarin_60") })).toBeNull();
  expect(status()).toHaveTextContent("");
  await act(async () => { gate = null; open(); });
  const h = await result("khing_garlic_60");
  expect(status()).toHaveTextContent(h.textContent!); // ไม่เงียบ: ผลใหม่ถูกประกาศ
  expect(analyzeCalls.at(-1)).toEqual(fx("khing_garlic_60").payload);
});

test("6) กระชาย อายุ 30 (ผลจริง): ไม่พบคำเตือน ไม่มีรายการคำเตือน มีบรรทัดไม่ได้แปลว่าใช้ได้ + ขอบเขต ไม่มีสไตล์ผ่าน/เขียว ไม่เตือนเงื่อนไขที่ไม่มีกฎ", async () => {
  seed([["herb", "krachai", "กระชาย"]], { age: 30 });
  serve("krachai_30");
  await mount();
  await screen.findByRole("heading", { level: 2, name: NO_FLAG }, SLOW);
  expect(fx("krachai_30").response.result.flags).toHaveLength(0);
  expect(view().querySelector("ul.flags")).toBeNull();
  expect(view().querySelector(".nonote")!.textContent).toBe(NO_FLAG_NOTE);
  expect(view().querySelector(".scope")).not.toBeNull();
  expect(view().querySelector("[class*=ok],[class*=success],[class*=green]")).toBeNull();
  expect(view().textContent).not.toMatch(/ไม่ได้ตรวจเงื่อนไข/);
  expect(status()).toHaveTextContent(NO_FLAG);
});

test("7) ชื่อยาที่พิมพ์เองฝัง HTML/สคริปต์ (ผลจริง): แสดงเป็นข้อความ ไม่สร้าง element ไม่รันสคริปต์", async () => {
  const evil = fx("khing_unknown_drug").payload.drugs[0];
  seed([["herb", "khing", "ขิง"]]);
  serve("khing_only", "khing_unknown_drug");
  await mount();
  await result("khing_only");
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  const d = screen.getByRole("dialog", { name: "เพิ่มสมุนไพรหรือยา" });
  fireEvent.input(within(d).getByLabelText("ค้นหา หรือพิมพ์ชื่อยา"), { target: { value: evil } });
  fireEvent.click(within(d).getByRole("button", { name: /ใช้ชื่อยา/ }));
  fireEvent.click(within(d).getByRole("button", { name: "เพิ่ม" }));
  await waitFor(() => expect(analyzeCalls.at(-1)).toEqual(fx("khing_unknown_drug").payload), SLOW);
  await screen.findByText(/ยังไม่ได้ตรวจ เพราะไม่มีในฐานข้อมูล/, {}, SLOW);
  expect(document.querySelector("img, script:not([type])")).toBeNull();
  expect((window as { __xss?: number }).__xss).toBeUndefined();
  expect(view().textContent).toContain("<img src=x");
  expect(within(activeRow(evil)).getByText("ยังไม่มีข้อมูลตรวจ")).toBeInTheDocument();
});

test("8.3 แยกรายการด้วย AI โดยไม่พิมพ์: ข้อความ พิมพ์ข้อความก่อน โฟกัสกลับช่องข้อความ ไม่เรียก /api/parse", async () => {
  serve();
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  fireEvent.click(screen.getByRole("button", { name: "แยกรายการด้วย AI" }));
  expect(await screen.findByText("พิมพ์ข้อความก่อน")).toBeInTheDocument();
  expect(screen.getByLabelText(/พิมพ์ข้อความ เช่น/)).toHaveFocus();
  expect(parseCalls).toBe(0);
});

test("9) รางจืด + มะแว้งเครือ + metformin + เบาหวาน อายุ 58 (ผลจริง): แสดง ภาระความเสี่ยงรวม และโรคที่เลือกถูกส่งและแสดงในใบสรุป", async () => {
  seed([["herb", "rangchuet", "รางจืด"], ["herb", "maweang_khruea", "มะแว้งเครือ"], ["drug", "metformin", "metformin"]], { age: 58, conditions: ["diabetes"] });
  serve("r3_diabetes_58");
  await mount();
  await result("r3_diabetes_58");
  expect(fx("r3_diabetes_58").response.result.aggregates.length).toBeGreaterThan(0);
  expect([...view().querySelectorAll("ul.flags > li .badge")].some((s) => s.textContent!.includes("ภาระความเสี่ยงรวม"))).toBe(true);
  expect(analyzeCalls[0].profile.conditions).toEqual(["diabetes"]);
  tab("ข้อมูลของฉัน");
  expect(pharm().textContent).toMatch(/โรค\/สภาวะ: .*เบาหวาน/);
});

describe("10) ตั้งครรภ์ ใช่ / ไม่ใช่ / ไม่ระบุ (ผลจริง)", () => {
  test.each([
    ["yes", "khing_30_preg_yes", true, false],
    ["no", "khing_30_preg_no", false, false],
    [null, "khing_30_preg_unspecified", false, true],
  ] as const)("10 ตั้งครรภ์=%s -> fixture %s คำเตือน=%s ไม่ได้ตรวจ=%s", async (pregnant, name, expectFlag, expectUnchecked) => {
    seed([["herb", "khing", "ขิง"]], { age: 30, pregnant });
    serve(name);
    await mount();
    await result(name);
    const t = view().textContent!;
    expect(/ไม่แนะนำให้ใช้ขิงบรรเทาคลื่นไส้อาเจียนในสตรีมีครรภ์/.test(t)).toBe(expectFlag);
    expect(PREG_UNCHECKED.test(t)).toBe(expectUnchecked);
  });
});

/** ชื่อที่โปรแกรมอ่านหน้าจอใช้ (แบบย่อ เหมือนสคริปต์เดิม) */
function accName(e: Element): string {
  const al = e.getAttribute("aria-label");
  if (al?.trim()) return al.trim();
  const lb = e.getAttribute("aria-labelledby");
  if (lb) { const t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim(); if (t) return t; }
  if (e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l?.textContent?.trim()) return l.textContent.trim(); }
  const wl = e.closest("label");
  if (wl?.textContent?.trim()) return wl.textContent.trim();
  if (e.tagName === "BUTTON" && e.textContent?.trim()) return e.textContent.trim();
  return "";
}

function checkA11y(where: string) {
  const ctrls = [...document.querySelectorAll("button, select, input:not([type=hidden]), textarea")];
  expect(ctrls.filter((e) => !accName(e)).map((e) => `${where}: ${e.outerHTML.slice(0, 60)}`)).toEqual([]);
  // ชื่อที่โปรแกรมอ่านเสียงมีคำที่เห็นอยู่ด้วย (สั่งด้วยเสียงได้)
  const mismatch = [...document.querySelectorAll("button[aria-label]")]
    .filter((b) => b.textContent!.trim() && !["×", "‹", "›"].includes(b.textContent!.trim()) && !b.getAttribute("aria-label")!.includes(b.textContent!.trim()));
  expect(mismatch.map((b) => `${where}: ${b.textContent}`)).toEqual([]);
  expect(document.querySelectorAll("div[aria-label]:not([role])")).toHaveLength(0);
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  const refs = [...document.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby]")]
    .flatMap((e) => ["aria-controls", "aria-labelledby", "aria-describedby"].flatMap((a) => (e.getAttribute(a) ?? "").split(/\s+/).filter(Boolean)));
  expect(refs.filter((r) => !document.getElementById(r))).toEqual([]);
}

test("11) โครงสร้างการเข้าถึง (ผลจริง สมุนไพร+ยา+โรค): ทุกปุ่ม/ช่องมีชื่อ ชื่อมีคำที่เห็น ปุ่มลบขึ้นต้น ลบ ไม่มี div aria-label ลอย id ไม่ซ้ำ aria อ้าง id จริง ฟอร์มมีชื่อ ช่องความเห็นใช้ลำดับ+ชื่อสมุนไพร", async () => {
  seed([["herb", "rangchuet", "รางจืด"], ["herb", "maweang_khruea", "มะแว้งเครือ"], ["drug", "metformin", "metformin"]], { age: 58, conditions: ["diabetes"] });
  serve("r3_diabetes_58");
  await mount();
  await result("r3_diabetes_58");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("tabindex", "0");
  fireEvent.click(screen.getByRole("button", { name: "+ เพิ่ม" }));
  fireEvent.click(screen.getByRole("button", { name: "เปิดผู้ช่วย AI" }));
  checkA11y("ช่วงนี้ + แผ่นเพิ่ม + แชต");
  const removes = [...document.querySelectorAll(".active-list button")].filter((b) => b.textContent === "ลบ");
  expect(removes.length).toBe(3);
  for (const b of removes) expect(b.getAttribute("aria-label")).toMatch(/^ลบ \S/);
  expect(new Set(removes.map((b) => b.getAttribute("aria-label"))).size).toBe(3);

  tab("ข้อมูลของฉัน");
  for (const x of document.querySelectorAll("details")) x.open = true;
  checkA11y("ข้อมูลของฉัน");
  const form = document.querySelector("form.profile-form")!;
  expect(document.getElementById(form.getAttribute("aria-labelledby")!)).toHaveTextContent("ข้อมูลสุขภาพที่ใช้ตรวจ");
  const ids = fx("r3_diabetes_58").response.result.flags.map((f) => f.flag_id);
  const names = [...document.querySelectorAll(".feedback select")].map(accName).filter((n) => n.startsWith("ความเห็นต่อคำเตือน"));
  expect(names[0]).toMatch(/^ความเห็นต่อคำเตือนที่ 1 \(มะแว้งเครือ\)/);
  for (const n of names) for (const id of ids) expect(n).not.toContain(id);

  tab("บันทึก");
  checkA11y("บันทึก");
});

test("12) แก้รายการหลายครั้งภายในช่วงหน่วง: ส่งคำขอเดียวด้วยข้อมูลล่าสุด (แทนการกันกดปุ่ม ตรวจ ซ้ำ)", async () => {
  vi.useFakeTimers();
  try {
    const store = new TrackerStore(null, () => T);
    const f = vi.fn(async () => respond(fx("khing_only").response));
    vi.stubGlobal("fetch", f);
    renderHook(() => useAnalysis(store, T));
    act(() => void store.addItem({ kind: "herb", ref: "khing", label: "ขิง", start_date: T }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => void store.addItem({ kind: "drug", ref: "warfarin", label: "warfarin", start_date: T }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).drugs).toEqual(["warfarin"]);
  } finally { vi.useRealTimers(); }
});

test("13) ตรวจล้มเหลวหลังแก้ข้อมูล: ข้อความไทย role=alert ใบสรุปเภสัชกรไม่แสดงผลเก่า; ลองใหม่สำเร็จแล้วใบสรุปแสดงผลใหม่", async () => {
  seed([["herb", "khing", "ขิง"], ["herb", "garlic", "กระเทียม"], ["drug", "warfarin", "warfarin"]], { age: 60 });
  serve("khing_garlic_warfarin_60", "khing_garlic_60");
  await mount();
  await result("khing_garlic_warfarin_60");
  tab("ข้อมูลของฉัน");
  expect(within(pharm()).getByRole("table")).toBeInTheDocument(); // 13.1
  tab("ช่วงนี้");
  fail = true;
  fireEvent.click(screen.getByRole("button", { name: "หยุดใช้ warfarin" }));
  const alert = await screen.findByRole("alert", {}, SLOW);
  expect(alert).toHaveTextContent("ตรวจไม่สำเร็จ");
  expect(alert.textContent).not.toMatch(/KeyError|server_error|500/);
  tab("ข้อมูลของฉัน");
  expect(within(pharm()).queryByRole("table")).toBeNull(); // ใบสรุปเก่าไม่ค้างเป็นผลปัจจุบัน
  expect(pharm()).toHaveTextContent("ยังไม่มีผลตรวจของรายการล่าสุด");
  tab("ช่วงนี้");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await result("khing_garlic_60");
  tab("ข้อมูลของฉัน");
  // ผลใหม่ (ไม่มี warfarin = engine ไม่พบคำเตือน) แสดงในใบสรุปเป็นผลปัจจุบัน
  expect(within(pharm()).getByText(NO_FLAG)).toBeInTheDocument();
  expect(pharm()).toHaveTextContent("ยา (ตามที่กรอก): ไม่มี");
  expect(pharm()).not.toHaveTextContent("ยังไม่มีผลตรวจของรายการล่าสุด");
});

test("14) อายุ 200: ข้อความผูกกับช่อง โฟกัสที่ช่อง ไม่บันทึก/ไม่ตรวจใหม่; แก้ค่าแล้วข้อความหาย; เว้นว่าง = ไม่ระบุ", async () => {
  seed([["herb", "khing", "ขิง"]]);
  serve("khing_only");
  await mount();
  await result("khing_only");
  const n = analyzeCalls.length;
  tab("ข้อมูลของฉัน");
  const age = screen.getByLabelText("อายุ (ปี)");
  fireEvent.input(age, { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
  expect(screen.getByRole("alert")).toHaveTextContent("0-120");
  expect(age).toHaveAttribute("aria-invalid", "true");
  expect(age).toHaveAccessibleDescription(/0-120/);
  expect(age).toHaveFocus();
  fireEvent.input(age, { target: { value: "30" } });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(age).toHaveAttribute("aria-invalid", "false");
  fireEvent.input(age, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลสุขภาพ" }));
  expect(screen.getByText(/บันทึกแล้ว/)).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 400));
  expect(analyzeCalls).toHaveLength(n); // ไม่ระบุอายุ = payload เดิม ไม่มีคีย์ age
  expect("age" in analyzeCalls[0].profile).toBe(false);
});
