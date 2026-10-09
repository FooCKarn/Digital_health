// แชตผู้ช่วย AI: แปลงจากสถานการณ์ 15-23 ของ scripts/ui_dom_test.js (ข้อมูลสมมติเท่านั้น)
// ข้ออ้างเรื่อง "เนื้อหาคำตอบ" ของเซิร์ฟเวอร์ (1669, ปฏิเสธขนาดยา, ไม่พบข้อมูล ฯลฯ) ตรวจใน engine/tests (pytest)
// ที่นี่จำลอง /api/ask ด้วยรูปคำตอบจริง {answer:{source,text_th,cites,follow_ups,rejected_reason}} แล้วตรวจการแสดงผล
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { App } from "../App";
import { body, flag, META, respond } from "../test/fixtures";
import type { AskAnswer, Cite, Meta } from "../types";
import base from "../styles/base.css?raw";
import { CHAT_KEY, CHAT_MAX, ChatStore } from "./chatStore";

const STL = "ผลตรวจกำลังอัปเดตหลังคุณแก้ข้อมูล ถามอีกครั้งเมื่อผลใหม่ขึ้น จะได้คำตอบที่ตรงกับข้อมูลล่าสุด";
const FOLLOW = ["ทำไมถึงขึ้นธง", "ควรถามเภสัชกรว่าอะไร", "ข้อมูลนี้มาจากไหน", "คำถามที่สี่"];
const MCHAT: Meta = { ...META, chat_followups_th: FOLLOW };
const HEADLINE = "พบธงเตือน 1 รายการจากฐานข้อมูลนี้";

const cite = (over: Partial<Cite> = {}): Cite => ({
  item_id: "khing:drug_cautions:0", herb_id: "khing", herb_name_th: "ขิง", source_page: 12, pdf_page: 30,
  evidence_quote: "วลีทดสอบจากหนังสือ", verified: false, ...over,
});
const ans = (over: Partial<AskAnswer> = {}): AskAnswer => ({
  source: "database", text_th: "ขิง: ข้อความทดสอบจากฐานข้อมูลนี้", cites: [cite()],
  follow_ups: FOLLOW.slice(0, 2), rejected_reason: null, ...over,
});

// ---- fetch จำลอง: /api/ask ตอบตามคิว (ไม่มีคิว = คำตอบปกติ); /api/analyze กั้นได้ ----
type Reply = () => Response | Promise<Response>;
let askQueue: Reply[];
let analyzeGate: Promise<void> | null;
let fetchMock: ReturnType<typeof vi.fn>;
const deferred = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };

function stubFetch(meta: Meta = MCHAT) {
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/meta") return respond(meta);
    if (url === "/api/analyze") { if (analyzeGate) await analyzeGate; return respond(body([flag()])); }
    if (url === "/api/ask") return (askQueue.shift() ?? (() => respond({ answer: ans() })))();
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}
const askBodies = () => fetchMock.mock.calls.filter((c) => c[0] === "/api/ask").map((c) => JSON.parse(String(c[1].body)));
const analyzeBodies = () => fetchMock.mock.calls.filter((c) => c[0] === "/api/analyze").map((c) => JSON.parse(String(c[1].body)));

function seed(drugs = ["warfarin"]) {
  const items = [{ id: "h1", kind: "herb", ref: "khing", label: "ขิง", start_date: "2020-01-01", end_date: null },
    ...drugs.map((d, i) => ({ id: `d${i}`, kind: "drug", ref: d, label: d, start_date: "2020-01-01", end_date: null }))];
  localStorage.setItem("hg_tracker_v1", JSON.stringify({ v: 1, items, profile: { age: 60, pregnant: null, breastfeeding: null, conditions: [] } }));
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); askQueue = []; analyzeGate = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const fab = () => screen.getByRole("button", { name: "เปิดผู้ช่วย AI" });
const panel = () => document.getElementById("chatPanel")!;
const input = () => screen.getByRole("textbox", { name: "พิมพ์คำถามถึงผู้ช่วย AI" }) as HTMLInputElement;
const sendBtn = () => screen.getByRole("button", { name: "ส่งคำถาม" });
const log = () => screen.getByRole("log", { name: "บทสนทนา" });
const answers = () => [...panel().querySelectorAll<HTMLElement>(".cmsg.a:not(.wait)")];
const errors = () => [...panel().querySelectorAll<HTMLElement>(".cmsg.err")];
const stored = () => JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "null");
const notBusy = () => expect(sendBtn()).toHaveAttribute("aria-disabled", "false");
/** ข้อความที่ระบบแสดง ไม่นับคำถามที่ผู้ใช้พิมพ์เอง */
const sysText = () => { const c = document.body.cloneNode(true) as HTMLElement; c.querySelectorAll(".cmsg.u").forEach((u) => u.remove()); return c.textContent ?? ""; };

async function mount(opts: { checked?: boolean; meta?: Meta } = {}) {
  stubFetch(opts.meta);
  render(<App />);
  await screen.findByRole("button", { name: "เปิดผู้ช่วย AI" });
  if (opts.checked) await screen.findByRole("heading", { name: HEADLINE });
}
function type(q: string) { fireEvent.input(input(), { target: { value: q } }); }
function send(q: string) { type(q); fireEvent.click(sendBtn()); }
async function askN(q: string, n: number) {
  send(q);
  await waitFor(() => { expect(answers()).toHaveLength(n); notBusy(); });
  return answers()[n - 1];
}
async function errN(q: string, n: number) {
  send(q);
  await waitFor(() => { expect(errors()).toHaveLength(n); notBusy(); });
  return errors()[n - 1];
}
const stopItem = (label: string) => fireEvent.click(screen.getByRole("button", { name: `หยุดใช้ ${label}` }));

describe("15) ปุ่มลอย เปิด/ปิด โฟกัส Esc", () => {
  test("15.1 ปุ่มลอยมีชื่อ aria-expanded=false aria-controls ชี้แผงที่มีอยู่จริง และแผงปิดอยู่", async () => {
    await mount();
    expect(fab()).toHaveAttribute("aria-expanded", "false");
    expect(fab()).toHaveAttribute("aria-controls", "chatPanel");
    expect(panel()).not.toBeNull();
    expect(panel()).not.toBeVisible();
  });

  test("15.2 กดแล้วเปิด โฟกัสไปช่องพิมพ์ aria-expanded=true; กดอีกครั้งปิด", async () => {
    await mount();
    fireEvent.click(fab());
    expect(panel()).toBeVisible();
    await waitFor(() => expect(input()).toHaveFocus());
    expect(fab()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(fab());
    expect(panel()).not.toBeVisible();
    expect(fab()).toHaveAttribute("aria-expanded", "false");
  });

  test("15.3 แผงเป็น dialog มีชื่อ ไม่เป็น modal และบทสนทนาเป็น log ที่มี aria-live", async () => {
    await mount();
    fireEvent.click(fab());
    const d = screen.getByRole("dialog", { name: "ผู้ช่วย AI (ต้นแบบ)" });
    expect(d).toBe(panel());
    expect(d).not.toHaveAttribute("aria-modal", "true");
    expect(log()).toHaveAttribute("aria-live", "polite");
  });

  test("15.4 แถบคงที่: ไม่ใช่การวินิจฉัย · ห้ามพิมพ์ข้อมูลส่วนตัว + ขอบเขต สมุนไพร X จาก 50 ชนิด · N กลุ่มยา", async () => {
    await mount();
    fireEvent.click(fab());
    const notice = within(panel()).getByText(/ไม่ใช่การวินิจฉัย/);
    expect(notice).toHaveTextContent("ไม่ใช่การวินิจฉัย · ข้อมูลยังเป็นร่าง · ตอบจากฐานข้อมูลของเครื่องมือนี้เท่านั้น · ห้ามพิมพ์ข้อมูลส่วนตัว");
    expect(within(panel()).getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeVisible();
  });

  test("15.5 ชิปเริ่มต้นมาจาก meta.chat_followups_th (3 ข้อแรก) ไม่ฝังในหน้า", async () => {
    await mount();
    fireEvent.click(fab());
    const chips = within(screen.getByRole("group", { name: "คำถามแนะนำ" })).getAllByRole("button");
    expect(chips.map((b) => b.textContent)).toEqual(FOLLOW.slice(0, 3));
  });

  test("15.5b meta ไม่มีคำถามแนะนำ = ไม่มีชิป", async () => {
    await mount({ meta: META });
    fireEvent.click(fab());
    expect(screen.queryByRole("group", { name: "คำถามแนะนำ" })).toBeNull();
  });

  test("15.6 Esc ปิดแผงและคืนโฟกัสให้ปุ่มลอย", async () => {
    await mount();
    fireEvent.click(fab());
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(panel()).not.toBeVisible();
    expect(fab()).toHaveFocus();
    expect(fab()).toHaveAttribute("aria-expanded", "false");
  });

  test("15.7 ปุ่มปิดในแผงก็คืนโฟกัสให้ปุ่มลอย", async () => {
    await mount();
    fireEvent.click(fab());
    fireEvent.click(screen.getByRole("button", { name: "ปิดผู้ช่วย AI" }));
    expect(panel()).not.toBeVisible();
    expect(fab()).toHaveFocus();
  });

  test("15.8 ใช้ได้ทุกแท็บ (ติดตั้งระดับ App นอกแผงแท็บ)", async () => {
    await mount();
    for (const t of screen.getAllByRole("tab")) {
      fireEvent.click(t);
      expect(fab()).toBeInTheDocument();
      expect(screen.getByRole("tabpanel").contains(panel())).toBe(false);
    }
  });
});

describe("16) ถาม-ตอบ ป้ายที่มา หลักฐาน ประวัติ", () => {
  test("16.1 ฟองผู้ใช้ + ฟองผู้ช่วยพร้อมป้าย ข้อความจากฐานข้อมูล", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    const a = await askN("ขิงกับยากันเลือดเป็นลิ่ม", 1);
    expect(panel().querySelectorAll(".cmsg.u")).toHaveLength(1);
    expect(a.querySelector(".src")).toHaveTextContent("ข้อความจากฐานข้อมูล");
    expect(a).toHaveTextContent("ขิง: ข้อความทดสอบจากฐานข้อมูลนี้");
    expect(log()).toHaveAttribute("aria-busy", "false");
  });

  test("16.2 ดูหลักฐาน (พับไว้) แสดงรหัสรายการ หน้า หน้า PDF สถานะตรวจ และวลี", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    const a = await askN("ขิงกับยากันเลือดเป็นลิ่ม", 1);
    const ev = a.querySelector("details")!;
    expect(ev).not.toBeNull();
    expect(ev.open).toBe(false);
    expect(ev.querySelector("summary")).toHaveTextContent(/^ดูหลักฐาน: ขิง$/);
    expect(ev.textContent).toMatch(/หน้า 12 \(หน้า 30 ในไฟล์ PDF\)/);
    expect(ev.textContent).toContain("khing:drug_cautions:0");
    expect(ev.textContent).toContain("ร่าง: ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ");
    expect(ev.querySelector("blockquote")).toHaveTextContent("“วลีทดสอบจากหนังสือ”");
  });

  test("16.3 ประวัติอยู่ใน sessionStorage hg_chat_v1 = {v:1,msgs} เก็บแค่ข้อความ ไม่มีโปรไฟล์/ยา/วันที่/รายการสมุนไพร", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    await askN("ขิงกับยากันเลือดเป็นลิ่ม", 1);
    const saved = stored();
    expect(Object.keys(saved).sort()).toEqual(["msgs", "v"]);
    expect(saved.v).toBe(1);
    expect(saved.msgs).toHaveLength(2);
    expect(saved.msgs[0]).toEqual({ r: "u", t: "ขิงกับยากันเลือดเป็นลิ่ม" });
    for (const m of saved.msgs) for (const k of Object.keys(m)) expect(["r", "t", "src", "cites", "old"]).toContain(k);
    const raw = sessionStorage.getItem(CHAT_KEY)!;
    expect(raw).not.toMatch(/\b(age|profile|pregnant|breastfeeding|conditions|drugs|herbs|start_date|days_in_use|warfarin)\b/);
    expect(raw).not.toContain("2020-01-01");
  });

  test("16.4 ส่ง /api/ask ด้วย herbs/drugs/profile ของรายการปัจจุบัน + question + context_herbs เท่านั้น ไม่ส่งประวัติแชต", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    await askN("คำถามแรก", 1);
    await askN("คำถามที่สอง", 2);
    const [b1, b2] = askBodies();
    expect(Object.keys(b2).sort()).toEqual(["context_herbs", "drugs", "herbs", "profile", "question"]);
    const { herbs, drugs, profile } = analyzeBodies().at(-1);
    expect({ herbs: b1.herbs, drugs: b1.drugs, profile: b1.profile }).toEqual({ herbs, drugs, profile });
    expect(b2.question).toBe("คำถามที่สอง");
    expect(JSON.stringify(b2)).not.toContain("คำถามแรก");
    expect(b1.context_herbs).toEqual([]);
    expect(b2.context_herbs).toEqual(["khing"]); // จากหลักฐานของคำตอบล่าสุด
  });

  test("16.5 ชิปเปลี่ยนตาม follow_ups ของคำตอบ และกดชิปแล้วถามได้", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    await askN("ขิงกับยากันเลือดเป็นลิ่ม", 1);
    const chips = within(screen.getByRole("group", { name: "คำถามแนะนำ" })).getAllByRole("button");
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[0]);
    await waitFor(() => { expect(answers()).toHaveLength(2); notBusy(); });
    expect(askBodies()[1].question).toBe("ทำไมถึงขึ้นธง");
    expect(answers()[1]).toHaveTextContent("ขิง");
  });

  test("16.6 โหลดหน้าใหม่ในแท็บเดิม: ประวัติ 4 ข้อความกลับมา", async () => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, msgs: [
      { r: "u", t: "ถาม 1" }, { r: "a", t: "ตอบ 1", src: "database", cites: [cite()] },
      { r: "u", t: "ถาม 2" }, { r: "a", t: "ตอบ 2", src: "refusal", cites: [] },
    ] }));
    await mount();
    expect(panel().querySelectorAll(".cmsg.u, .cmsg.a")).toHaveLength(4);
  });

  test("16.7 ล้างประวัติ: หน้าจอและ sessionStorage ว่าง + ประกาศ + โฟกัสช่องพิมพ์", async () => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, msgs: [{ r: "u", t: "ถาม 1" }, { r: "a", t: "ตอบ 1", src: "database", cites: [] }] }));
    await mount();
    fireEvent.click(fab());
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติแชต" }));
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
    expect(stored()?.msgs ?? []).toHaveLength(0);
    expect(within(panel()).getByRole("status")).toHaveTextContent("ล้างประวัติแชตแล้ว");
    expect(input()).toHaveFocus();
  });

  test("16.8 ล้างประวัติแล้วชิปกลับเป็นค่าเริ่มต้นจาก meta", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ follow_ups: ["ชิปจากคำตอบ"] }) }));
    await askN("ขิง", 1);
    const chips = () => within(screen.getByRole("group", { name: "คำถามแนะนำ" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips()).toEqual(["ชิปจากคำตอบ"]);
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติแชต" }));
    expect(chips()).toEqual(FOLLOW.slice(0, 3));
  });
});

describe("17) ฉุกเฉิน การปฏิเสธ ไม่มีผลตรวจ", () => {
  test("17.1 ฉุกเฉิน: role=alert ป้าย ข้อควรทราบเร่งด่วน", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ source: "emergency", text_th: "อาการรุนแรง โทร 1669 ทันที", cites: [] }) }));
    const m = await askN("หายใจไม่ออกหลังกินขิง", 1);
    expect(m).toHaveAttribute("role", "alert");
    expect(m).toHaveClass("emerg");
    expect(m.querySelector(".src")).toHaveTextContent("ข้อควรทราบเร่งด่วน");
    expect(m).toHaveTextContent("1669");
  });

  test("17.2 ปฏิเสธ: ป้าย ตอบไม่ได้ / ไม่มีข้อมูล; AI เรียบเรียง: ป้ายของตัวเอง; ไม่ใช่ฉุกเฉินไม่มี role=alert", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ source: "refusal", text_th: "เครื่องมือนี้ไม่แนะนำขนาดยา", cites: [] }) }));
    askQueue.push(() => respond({ answer: ans({ source: "llm", text_th: "ขิง: เรียบเรียงแล้ว" }) }));
    const r = await askN("ขิงกินวันละกี่เม็ด", 1);
    expect(r.querySelector(".src")).toHaveTextContent("ตอบไม่ได้ / ไม่มีข้อมูล");
    expect(r).not.toHaveAttribute("role");
    const l = await askN("ขิงกับยา", 2);
    expect(l.querySelector(".src")).toHaveTextContent("AI เรียบเรียงจากข้อความที่ค้นได้");
  });

  test("17.3 ยังไม่มีสมุนไพร: ยังถามได้ ส่งแค่ question + context_herbs และแสดงคำตอบ ยังไม่มีผลตรวจ ของเซิร์ฟเวอร์", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ source: "refusal", text_th: "ยังไม่มีผลตรวจ กรอกสมุนไพรแล้วกดตรวจก่อน", cites: [] }) }));
    const m = await askN("ทำไมถึงขึ้นธง", 1);
    expect(m).toHaveTextContent("ยังไม่มีผลตรวจ");
    expect(Object.keys(askBodies()[0]).sort()).toEqual(["context_herbs", "question"]);
    expect(m.querySelector(".stl")).toBeNull();
  });

  test("17.4 ข้อความของระบบทั้งหน้าไม่มีคำว่า ปลอดภัย (ไม่นับคำถามที่ผู้ใช้พิมพ์)", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ text_th: "ยังไม่มีผลตรวจ ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม" }) }));
    await askN("ขิงกับ warfarin ปลอดภัยไหม", 1);
    expect(document.body.textContent).toContain("ปลอดภัยไหม"); // คำของผู้ใช้ยังแสดงตามที่พิมพ์
    expect(sysText()).not.toContain("ปลอดภัย");
  });
});

describe("18) storage เสีย/ใช้ไม่ได้ + ผลตรวจเปลี่ยน + ปุ่มถามเรื่องธง", () => {
  test("18.1 sessionStorage เป็น JSON พัง: แชตยังใช้ได้", async () => {
    sessionStorage.setItem(CHAT_KEY, "{not json");
    await mount();
    fireEvent.click(fab());
    expect(await askN("รางจืดกับยาเบาหวาน", 1)).toBeInTheDocument();
  });

  test("18.2 setItem โยน error (โควตา/โหมดส่วนตัว): แชตยังใช้ได้", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await mount();
    fireEvent.click(fab());
    expect(await askN("รางจืดกับยาเบาหวาน", 1)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติแชต" }));
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
  });

  test("18.3 เข้าถึง sessionStorage ไม่ได้เลย (getter โยน): แชตยังใช้ได้", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
    await mount();
    fireEvent.click(fab());
    expect(await askN("รางจืดกับยาเบาหวาน", 1)).toBeInTheDocument();
  });

  test("18.4 การ์ดธงมีปุ่ม ถามเรื่องธงนี้ ชื่อขึ้นต้นด้วยคำที่เห็น; กดแล้วเปิดแชต เติมคำถาม โฟกัส ไม่ส่งเอง", async () => {
    seed(); await mount({ checked: true });
    const b = screen.getByRole("button", { name: "ถามเรื่องธงนี้: ขิง" });
    expect(b).toHaveTextContent(/^ถามเรื่องธงนี้$/);
    fireEvent.click(b);
    expect(panel()).toBeVisible();
    await waitFor(() => expect(input()).toHaveFocus());
    expect(input().value).toBe("อธิบายธงของขิง");
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
    expect(askBodies()).toHaveLength(0);
  });

  test("18.5 แก้ข้อมูลหลังคุยแล้ว: แชตแจ้งว่าคำตอบก่อนหน้าอาจไม่ตรง (ไม่ซ้ำ)", async () => {
    seed(["warfarin", "simvastatin"]); await mount({ checked: true });
    fireEvent.click(fab());
    await askN("อธิบายธงของขิง", 1);
    stopItem("warfarin");
    stopItem("simvastatin");
    const notes = [...panel().querySelectorAll(".cmsg.n")];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("ผลตรวจเปลี่ยนแล้ว คำตอบก่อนหน้าอาจไม่ตรงกับข้อมูลปัจจุบัน");
  });

  test("18.6 โหลดหน้าใหม่ที่มีประวัติ: แจ้งว่าคำตอบเก่าอาจไม่ตรง", async () => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, msgs: [{ r: "u", t: "ถาม" }, { r: "a", t: "ตอบ", src: "database", cites: [] }] }));
    await mount();
    await waitFor(() => expect(panel().querySelector(".cmsg.n")).toHaveTextContent("ผลตรวจเปลี่ยนแล้ว"));
  });
});

describe("19) API ล้มเหลว + ปุ่มกำลังทำงาน + ความเข้าถึง", () => {
  test("19.1 เครือข่ายล่ม: ข้อความ role=alert ภาษาไทย และคำถามของผู้ใช้ยังอยู่", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => { throw new TypeError("Failed to fetch"); });
    const e = await errN("รางจืดกับยาเบาหวาน", 1);
    expect(e).toHaveAttribute("role", "alert");
    expect(e).toHaveTextContent("ถามไม่สำเร็จ: เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    expect(panel().querySelectorAll(".cmsg.u")).toHaveLength(1);
    expect(stored().msgs.map((m: { r: string }) => m.r)).toEqual(["u"]); // ข้อความผิดพลาดไม่ลงประวัติ
  });

  test("19.2 ทุกปุ่ม/ช่องในแชตมีชื่อ ชื่อมีคำที่เห็น และไม่มี div ที่มี aria-label โดยไม่มี role", async () => {
    await mount();
    fireEvent.click(fab());
    const ctrls = [fab(), ...panel().querySelectorAll<HTMLElement>("button, input")];
    for (const c of ctrls) {
      const name = c.getAttribute("aria-label") || (c.id && document.querySelector(`label[for="${c.id}"]`)?.textContent) || c.textContent;
      expect(name?.trim()).toBeTruthy();
      const seen = c.tagName === "BUTTON" ? c.textContent!.trim() : "";
      if (seen && c.getAttribute("aria-label")) expect(c.getAttribute("aria-label")).toContain(seen);
    }
    expect(document.querySelectorAll("div[aria-label]:not([role])")).toHaveLength(0);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("19.3 ช่องพิมพ์จำกัด 300 ตัวอักษร", async () => {
    await mount();
    fireEvent.click(fab());
    expect(input().maxLength).toBe(300);
  });

  test("19.4 คำถามฝัง HTML แสดงเป็นข้อความธรรมดา", async () => {
    await mount();
    fireEvent.click(fab());
    const x = '<img src=x onerror="window.__xss=1">';
    await askN(x, 1);
    expect(panel().querySelector("img")).toBeNull();
    expect([...panel().querySelectorAll(".cmsg.u")].some((u) => u.textContent === x)).toBe(true);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  test("19.5 คำตอบ/หลักฐานจากเซิร์ฟเวอร์ที่ฝัง <img onerror> ไม่สร้าง element", async () => {
    await mount();
    fireEvent.click(fab());
    const x = '<img src=x onerror="window.__xss=2">';
    askQueue.push(() => respond({ answer: ans({ text_th: x, cites: [cite({ evidence_quote: x, herb_name_th: x })] }) }));
    const a = await askN("ขิง", 1);
    expect(panel().querySelector("img")).toBeNull();
    expect(a.textContent).toContain(x);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  test("19.6 ระหว่างรอ: ปุ่มส่ง aria-disabled (ไม่ใช่ disabled) กดซ้ำ/กดชิปไม่ส่งซ้อน และมีฟอง กำลังค้นข้อมูล…", async () => {
    await mount();
    fireEvent.click(fab());
    const d = deferred();
    askQueue.push(async () => { await d.p; return respond({ answer: ans() }); });
    send("คำถาม");
    await waitFor(() => expect(sendBtn()).toHaveAttribute("aria-disabled", "true"));
    expect(sendBtn()).not.toBeDisabled();
    expect(log()).toHaveAttribute("aria-busy", "true");
    expect(within(log()).getByText("กำลังค้นข้อมูล…")).toBeInTheDocument();
    send("ซ้ำ");
    fireEvent.click(within(screen.getByRole("group", { name: "คำถามแนะนำ" })).getAllByRole("button")[0]);
    expect(askBodies()).toHaveLength(1);
    await act(async () => { d.open(); });
    await waitFor(() => { expect(answers()).toHaveLength(1); notBusy(); });
    expect(within(log()).queryByText("กำลังค้นข้อมูล…")).toBeNull();
    expect(input()).toHaveFocus();
  });
});

describe("20) ตรวจแล้วไม่พบธง แล้วถาม ปลอดภัยไหม", () => {
  test("20.1 คำตอบ ไม่พบธงเตือนในฐานข้อมูลนี้ แสดงตามเซิร์ฟเวอร์ และระบบไม่มีคำว่า ปลอดภัย", async () => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ text_th: "ไม่พบธงเตือนในฐานข้อมูลนี้ นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร", cites: [] }) }));
    const m = await askN("กระชายปลอดภัยไหม", 1);
    expect(m).toHaveTextContent("ไม่พบธงเตือนในฐานข้อมูลนี้");
    expect(sysText()).not.toContain("ปลอดภัย");
  });
});

describe("21) แก้ข้อมูลแล้วถามต่อ / แก้ระหว่างรอ -> ป้ายผลตรวจเดิม", () => {
  test("21.1-21.5 ป้ายผลเดิม: ไม่มีเมื่อข้อมูลไม่เปลี่ยน; ไม่มีเมื่อถามหลังแก้ขณะตรวจใหม่ยังค้าง (เซิร์ฟเวอร์คำนวณจากข้อมูลปัจจุบัน); ไม่มีหลังตรวจเสร็จ; มีเมื่อแก้ระหว่างรอคำตอบ; เก็บในประวัติ", async () => {
    seed(["warfarin", "simvastatin"]); await mount({ checked: true });
    fireEvent.click(fab());
    const m1 = await askN("ทำไมถึงขึ้นธง", 1);
    expect(m1.querySelector(".stl")).toBeNull(); // 21.1

    const gate = deferred();
    analyzeGate = gate.p; // ตรวจใหม่ค้างอยู่ ผลที่เห็นยังเป็นของข้อมูลก่อนแก้
    stopItem("warfarin");
    const m2 = await askN("ทำไมถึงขึ้นธง", 2);
    const m3 = await askN("ควรถามเภสัชกรว่าอะไร", 3);
    for (const m of [m2, m3]) expect(m.querySelector(".stl")).toBeNull(); // 21.2 ถามด้วยข้อมูลปัจจุบัน ไม่ใช่คำตอบเก่า
    expect(askBodies()[1].drugs).toEqual(["simvastatin"]); // ส่งข้อมูลหลังแก้จริง

    analyzeGate = null;
    await act(async () => { gate.open(); });
    await waitFor(() => expect(screen.queryByText("ผลก่อนแก้ไข (ยังไม่ได้ตรวจรายการล่าสุด)")).toBeNull());
    const m4 = await askN("ทำไมถึงขึ้นธง", 4);
    expect(m4.querySelector(".stl")).toBeNull(); // 21.3

    const d = deferred();
    askQueue.push(async () => { await d.p; return respond({ answer: ans() }); });
    send("ทำไมถึงขึ้นธง");
    await waitFor(() => expect(askBodies()).toHaveLength(5));
    stopItem("simvastatin"); // แก้ระหว่างรอคำตอบ
    await act(async () => { d.open(); });
    await waitFor(() => { expect(answers()).toHaveLength(5); notBusy(); });
    expect(answers()[4].querySelector(".stl")).toHaveTextContent(STL); // 21.4

    expect(stored().msgs.filter((x: { old?: boolean }) => x.old)).toHaveLength(1); // 21.5
  });
});

describe("22) ล้างประวัติระหว่างรอ + ข้อความผิดพลาดภาษาไทย", () => {
  test("22.1 ล้างประวัติระหว่างรอ: คำตอบที่มาทีหลังถูกทิ้ง ไม่ค้างในแชตหรือประวัติ", async () => {
    await mount();
    fireEvent.click(fab());
    const d = deferred();
    askQueue.push(async () => { await d.p; return respond({ answer: ans() }); });
    send("รางจืดกับยาเบาหวาน");
    await waitFor(() => expect(askBodies()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติแชต" }));
    expect(within(log()).queryByText("กำลังค้นข้อมูล…")).toBeNull();
    await act(async () => { d.open(); });
    await waitFor(notBusy);
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
    expect(stored()?.msgs ?? []).toHaveLength(0);
  });

  test("22.1b ล้างระหว่างรอแล้วคำขอล้มเหลว: ไม่แสดงข้อผิดพลาดค้าง", async () => {
    await mount();
    fireEvent.click(fab());
    const d = deferred();
    askQueue.push(async () => { await d.p; return respond({ error: "x" }, 500); });
    send("รางจืด");
    await waitFor(() => expect(askBodies()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติแชต" }));
    await act(async () => { d.open(); });
    await waitFor(notBusy);
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
  });

  test.each([
    ["22.2 500 -> ข้อความไทยตายตัว ไม่โชว์รหัสภายใน", () => respond({ error: "server_error", detail: "KeyError: boom" }, 500), "เชื่อมต่อไม่ได้", /server_error|KeyError|500/],
    ["22.3 ตอบ 200 แต่ไม่ใช่ JSON -> ข้อความไทยตายตัว", () => new Response("not json", { status: 200 }), "เชื่อมต่อไม่ได้", /JSON|SyntaxError/],
    ["22.3b ตอบ 200 แต่รูปผิด -> ข้อความไทยตายตัว", () => respond({ answer: { text: 1 } }), "เชื่อมต่อไม่ได้", /undefined|text_th/],
    ["22.4 400 ข้อความไม่ใช่ไทย -> คำถามหรือข้อมูลไม่ถูกต้อง", () => respond({ error: "bad thing" }, 400), "คำถามหรือข้อมูลไม่ถูกต้อง", /bad thing/],
    ["22.5 400 ข้อความไทยจากเซิร์ฟเวอร์ -> แสดงตามเดิม", () => respond({ error: "question ต้องเป็นข้อความ 1-300 ตัวอักษร" }, 400), "question ต้องเป็นข้อความ 1-300 ตัวอักษร", /bad_request/],
    ["22.6 503 -> คงข้อความไทยจากเซิร์ฟเวอร์", () => respond({ error: "llm_unavailable", message: "บริการ AI ใช้ไม่ได้ชั่วคราว" }, 503), "บริการ AI ใช้ไม่ได้ชั่วคราว", /llm_unavailable/],
    ["22.6b 503 ข้อความไม่ใช่ไทย -> ข้อความไทยตายตัว", () => respond({ error: "llm_unavailable", message: "GEMINI down" }, 503), "เชื่อมต่อไม่ได้", /GEMINI|llm_unavailable/],
  ] as const)("%s", async (_n, reply, want, never) => {
    await mount();
    fireEvent.click(fab());
    askQueue.push(reply);
    const e = await errN("รางจืด", 1);
    expect(e).toHaveAttribute("role", "alert");
    expect(e).toHaveTextContent(want);
    expect(e.textContent).not.toMatch(never);
  });
});

describe("23) ถาม กินได้ไหม เรื่องที่ไม่ได้กรอก", () => {
  test("23.1 คำตอบคำเตือนจากฐานข้อมูลพร้อมหลักฐานแสดงครบ (เนื้อหาตรวจใน pytest)", async () => {
    seed([]); await mount({ checked: true });
    fireEvent.click(fab());
    askQueue.push(() => respond({ answer: ans({ text_th: "ขิง: ไม่ควรรับประทานร่วมกับยาต้านการแข็งตัวของเลือด" }) }));
    const m = await askN("ขิงกับวาร์ฟารินกินได้ไหม", 1);
    expect(m).toHaveTextContent("ไม่ควรรับประทาน");
    expect(m).not.toHaveTextContent("ไม่พบธงเตือน");
    expect(m.querySelector("details")).not.toBeNull();
  });
});

describe("ลบข้อมูลทั้งหมด + ที่เก็บแชต", () => {
  test("ลบข้อมูลทั้งหมด ล้างประวัติแชตใน sessionStorage และในหน่วยความจำ", async () => {
    seed(); await mount({ checked: true });
    fireEvent.click(fab());
    await askN("ขิงกับยา", 1);
    expect(stored().msgs).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "ข้อมูลของฉัน" }));
    fireEvent.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบข้อมูลทั้งหมด" }));
    expect(sessionStorage.getItem(CHAT_KEY)).toBeNull();
    expect(panel().querySelectorAll(".cmsg")).toHaveLength(0);
  });

  test("ChatStore เก็บสูงสุด 50 ข้อความ และตัดฟิลด์แปลก/ข้อความที่รูปผิดตอนโหลด", () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const c = new ChatStore(st);
    for (let i = 0; i < CHAT_MAX + 5; i++) c.add({ r: "u", t: `q${i}` });
    expect(c.msgs).toHaveLength(CHAT_MAX);
    expect(JSON.parse(mem.get(CHAT_KEY)!).msgs).toHaveLength(CHAT_MAX);
    expect(c.msgs[0]).toEqual({ r: "u", t: "q5" });
    mem.set(CHAT_KEY, JSON.stringify({ v: 1, msgs: [
      { r: "u", t: "ok", profile: { age: 60 } }, { r: "x", t: "bad" }, { r: "a", t: 5 }, { r: "a", t: "y".repeat(4001), src: "database", cites: [] },
      { r: "a", t: "ตอบ", src: "database", cites: [{ ...cite(), drugs: ["warfarin"] }] },
    ] }));
    const d = new ChatStore(st);
    expect(d.msgs).toEqual([{ r: "u", t: "ok" }, { r: "a", t: "ตอบ", src: "database", cites: [cite()] }]);
  });
});

test("CSS แชตจำกัดขอบเขต: ทุก selector ที่แตะ .cmsg/.chat-* ขึ้นต้นด้วย #chatPanel และไม่มี .msg ลอย", () => {
  const selectors = [...base.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
  const chat = selectors.filter((x) => /\.cmsg|\.chat-(log|form|chips|notice)/.test(x));
  expect(chat.length).toBeGreaterThan(5);
  for (const x of chat) expect(x.startsWith("#chatPanel")).toBe(true);
  for (const x of selectors) if (/(^|\s)\.msg(?![\w-])/.test(x)) expect(x).toMatch(/\.flag-card \.msg/);
});
