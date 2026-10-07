import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ApiError, getMeta } from "./api";
import { ChatFab } from "./chat/ChatFab";
import { ChatPanel, type OpenRequest } from "./chat/ChatPanel";
import { AskFlag, ChatStore, getSessionStorage } from "./chat/chatStore";
import { History } from "./components/History";
import { MyData } from "./components/MyData";
import { ThisPeriodView } from "./components/ThisPeriod";
import { useAnalysis } from "./hooks/useAnalysis";
import { todayISO } from "./model/dates";
import { getLocalStorage } from "./model/storage";
import { TrackerStore } from "./model/tracker";
import type { Meta } from "./types";

const VIEWS = [
  { id: "now", label: "ช่วงนี้" },
  { id: "history", label: "ที่เคยใช้" },
  { id: "mine", label: "ข้อมูลของฉัน" },
] as const;

export function App() {
  const store = useMemo(() => new TrackerStore(getLocalStorage(), () => todayISO()), []);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    getMeta()
      .then((m) => {
        if (!live) return;
        // รู้รหัสโรคจากเซิร์ฟเวอร์แล้ว ตรวจโปรไฟล์เดิมซ้ำ (รหัสที่ไม่รู้จักถูกปฏิเสธ และแผงจะแจ้งว่าไม่ได้ตรวจ)
        store.setKnownConditions(Object.keys(m.conditions));
        store.setProfile(store.state.profile);
        setMeta(m);
      })
      .catch((e) => live && setError(e instanceof ApiError ? e.thaiMessage : new ApiError("network").thaiMessage));
    return () => { live = false; };
  }, [attempt]);

  // header/footer ข้อความเดิมจาก public/index.html (สถานการณ์เดิม 0)
  return (
    <>
      <header>
        <h1>HerbGuard TTM</h1>
        <p class="meta">ตรวจธงเตือนการใช้สมุนไพรร่วมกับยา จากหนังสือ TTM first · <strong>ต้นแบบ ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลผู้ป่วยจริง</strong></p>
      </header>
      <main>
        {meta ? <Home store={store} meta={meta} today={todayISO()} /> : error ? (
          <div class="err" role="alert">
            <span>{`โหลดข้อมูลไม่สำเร็จ: ${error}`}</span>{" "}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</button>
          </div>
        ) : <p>กำลังโหลด…</p>}
      </main>
      <footer>
        <details class="opt-box noprint">
          <summary>เกี่ยวกับเครื่องมือนี้</summary>
          <p>HerbGuard TTM เป็นต้นแบบเครื่องมือสนับสนุนการตัดสินใจ ตรวจธงเตือนเมื่อใช้สมุนไพรไทยร่วมกับยาแผนปัจจุบัน โดยใช้กฎที่เขียนเป็นโค้ด AI ไม่ได้เป็นผู้ตัดสินว่ามีธงหรือไม่</p>
          <p>แหล่งข้อมูล: หนังสือแนวทางการใช้ยาสมุนไพรในการดูแลอาการเจ็บป่วยเบื้องต้น (TTM first) ครอบคลุมเพียงบางส่วนของ 50 ชนิดในเล่ม (ดูจำนวนจริงในผลตรวจ)</p>
          <p>ข้อจำกัด: ข้อมูลยังเป็นร่าง ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ ไม่ใช่การวินิจฉัยหรือสั่งยา การไม่พบธงเตือนไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร</p>
        </details>
        {meta && <p class="meta">{meta.disclaimer_th}</p>}
      </footer>
    </>
  );
}

/** สามมุมมองใช้ผลตรวจชุดเดียว (เรียก /api/analyze ที่เดียว) */
function Home({ store, meta, today }: { store: TrackerStore; meta: Meta; today: string }) {
  const a = useAnalysis(store, today, Object.keys(meta.conditions));
  const [tab, setTab] = useState(0);
  const [hideRecovered, setHideRecovered] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const chat = useMemo(() => new ChatStore(getSessionStorage()), []);
  const [chatOpen, setChatOpen] = useState<OpenRequest>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const openChat = (prefill?: string) => setChatOpen((o) => ({ n: (o?.n ?? 0) + 1, prefill }));
  const closeChat = () => { setChatOpen(null); fab.current?.focus(); };
  const herbName = (id: string) => meta.herbs.find((h) => h.id === id)?.name_th ?? id;
  const askFlag = useMemo(() => ({ herbName, ask: (f: { herb_id: string }) => openChat(`อธิบายธงของ${herbName(f.herb_id)}`) }), [meta]);

  // แท็บแบบ roving tabindex: ลูกศรซ้าย/ขวา (วน), Home, End เหมือนหน้าเดิม
  const onKey = (e: KeyboardEvent) => {
    const n = VIEWS.length;
    const next = e.key === "ArrowRight" ? (tab + 1) % n : e.key === "ArrowLeft" ? (tab + n - 1) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setTab(next);
    tabs.current[next]?.focus();
  };

  const v = VIEWS[tab];
  return (
    <>
      {/* สเปก §9: แจ้งทุกหน้า ไม่ใช่เฉพาะหน้า ข้อมูลของฉัน */}
      {!store.persistent && (
        <p class="warn" role="status">ข้อมูลจะหายเมื่อปิดหน้านี้ (เบราว์เซอร์ไม่อนุญาตให้บันทึก) ส่งออกไฟล์ในหน้า ข้อมูลของฉัน ถ้าต้องการเก็บ</p>
      )}
      {store.recovered && !hideRecovered && (
        <p class="warn row-actions" role="alert">
          <span>ข้อมูลที่บันทึกไว้เสียหาย เริ่มใหม่ให้แล้ว</span>
          <button type="button" aria-label="ปิดข้อความ ข้อมูลเสียหาย" onClick={() => setHideRecovered(true)}>ปิด</button>
        </p>
      )}
      <div class="tabs noprint" role="tablist" aria-label="มุมมอง" onKeyDown={onKey}>
        {VIEWS.map((x, i) => (
          <button key={x.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tab-${x.id}`}
            aria-selected={i === tab} aria-controls={i === tab ? `panel-${x.id}` : undefined} tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}>
            {x.label}
          </button>
        ))}
      </div>
      <AskFlag.Provider value={askFlag}>
        <div role="tabpanel" id={`panel-${v.id}`} aria-labelledby={`tab-${v.id}`} tabIndex={0}>
          {v.id === "now" ? <ThisPeriodView store={store} meta={meta} today={today} analysis={a} />
            : v.id === "history" ? <History store={store} />
            : <MyData store={store} meta={meta} today={today} analysis={a} onClearAll={() => chat.clear()} />}
        </div>
      </AskFlag.Provider>
      {/* แชตอยู่ระดับ App นอกแผงแท็บ ใช้ได้ทุกแท็บ ใช้ store/meta/analysis ชุดเดียวกัน */}
      <div class="chat-ui">
        <ChatFab open={!!chatOpen} btnRef={fab} onClick={() => (chatOpen ? closeChat() : openChat())} />
        <ChatPanel chat={chat} store={store} meta={meta} today={today} open={chatOpen} onClose={closeChat} />
      </div>
    </>
  );
}
