import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ApiError, getMeta } from "./api";
import { ChatFab } from "./chat/ChatFab";
import { ChatPanel, type OpenRequest } from "./chat/ChatPanel";
import { AskFlag, ChatStore, getSessionStorage } from "./chat/chatStore";
import { Assistant, type GoTo } from "./components/Assistant";
import { Diary } from "./components/Diary";
import { History } from "./components/History";
import { Policy } from "./components/Policy";
import { MyData } from "./components/MyData";
import { ThisPeriodView } from "./components/ThisPeriod";
import { useAnalysis } from "./hooks/useAnalysis";
import { todayISO } from "./model/dates";
import { getLocalStorage } from "./model/storage";
import { TrackerStore } from "./model/tracker";
import { DiaryStore } from "./model/diary";
import type { Meta } from "./types";

const VIEWS = [
  { id: "now", label: "ช่วงนี้" },
  { id: "assistant", label: "ผู้ช่วย" },
  { id: "diary", label: "บันทึก" },
  { id: "mine", label: "ข้อมูลของฉัน" },
] as const;

export function App() {
  const store = useMemo(() => new TrackerStore(getLocalStorage(), () => todayISO()), []);
  const diary = useMemo(() => new DiaryStore(getLocalStorage(), () => todayISO()), []);
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
        <div class="appbar">
        <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6 6 4 12 9 20c1-1 2-2 3-4 1 2 2 3 3 4 5-8 3-14-3-18z"/></svg></span>
        <div>
          <h1>HerbGuard TTM</h1>
          <p class="meta">ตัวติดตามสมุนไพรและยาของฉัน · ตรวจคำเตือนจากหนังสือ TTM first</p>
        </div>
        </div>
        <p class="proto-banner"><strong>ต้นแบบ ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลผู้ป่วยจริง</strong></p>
      </header>
      <main>
        {meta ? <Home store={store} diary={diary} meta={meta} /> : error ? (
          <div class="err" role="alert">
            <span>{`โหลดข้อมูลไม่สำเร็จ: ${error}`}</span>{" "}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</button>
          </div>
        ) : <p>กำลังโหลด…</p>}
      </main>
      <footer>
        <details class="opt-box noprint">
          <summary>เกี่ยวกับเครื่องมือนี้</summary>
          <p>HerbGuard TTM เป็นต้นแบบช่วยดูว่าสมุนไพรไทยที่ใช้ร่วมกับยาแผนปัจจุบันมีคำเตือนอะไรบ้าง ตัดสินด้วยกฎที่เขียนเป็นโค้ด ไม่ได้ให้ AI ตัดสิน</p>
          <p>แหล่งข้อมูล: หนังสือแนวทางการใช้ยาสมุนไพรในการดูแลอาการเจ็บป่วยเบื้องต้น (TTM first) ครอบคลุมเพียงบางส่วนของ 50 ชนิดในเล่ม (ดูจำนวนจริงในผลตรวจ) ส่วนข้อห้ามของ “ตำรับยาบำรุงโลหิต” มาจากแนวทางการตั้งตำรับยาบำรุงโลหิตของสถาบันการแพทย์แผนไทย</p>
          <p>ข้อจำกัด: ข้อมูลยังเป็นร่าง ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ ไม่ใช่การวินิจฉัยหรือสั่งยา การไม่พบคำเตือนไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร</p>
        </details>
        <Policy />
        {meta && <p class="meta">{meta.disclaimer_th}</p>}
      </footer>
    </>
  );
}

/** สามมุมมองใช้ผลตรวจชุดเดียว (เรียก /api/analyze ที่เดียว) */
function Home({ store, diary, meta }: { store: TrackerStore; diary: DiaryStore; meta: Meta }) {
  // คำนวณทุกครั้งที่ render (Home render ใหม่เมื่อข้อมูล/แท็บเปลี่ยน) เปิดหน้าข้ามเที่ยงคืนแล้ววันที่ใช้จึงขยับตาม
  // ponytail: ไม่มีตัวจับเวลาเที่ยงคืน ถ้าหน้าค้างไว้เฉย ๆ จะขยับเมื่อมีการโต้ตอบครั้งถัดไป
  const today = todayISO();
  const a = useAnalysis(store, today, Object.keys(meta.conditions));
  const [tab, setTab] = useState(0);
  const [hideRecovered, setHideRecovered] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const chat = useMemo(() => new ChatStore(getSessionStorage()), []);
  const [chatOpen, setChatOpen] = useState<OpenRequest>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const openChat = (prefill?: string) => setChatOpen((o) => ({ n: (o?.n ?? 0) + 1, prefill }));
  const closeChat = () => { setChatOpen(null); fab.current?.focus(); };
  const herbName = (id: string) => meta.herbs.find((h) => h.id === id)?.name_th ?? meta.formulas?.find((f) => f.id === id)?.name_th ?? id;
  const askFlag = useMemo(() => ({ herbName, ask: (f: { herb_id: string }) => openChat(`อธิบายคำเตือนของ${herbName(f.herb_id)}`) }), [meta]);

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
        <p class="warn" role="status">ข้อมูลจะหายเมื่อปิดหน้านี้ (เบราว์เซอร์ไม่ให้บันทึก) ถ้าอยากเก็บ ให้ส่งออกไฟล์ในหน้า ข้อมูลของฉัน</p>
      )}
      {store.recovered && !hideRecovered && (
        <p class="warn row-actions" role="alert">
          <span>ข้อมูลที่เก็บไว้เสียหาย จึงเริ่มต้นใหม่ให้</span>
          <button type="button" aria-label="ปิดข้อความ ข้อมูลเสียหาย" onClick={() => setHideRecovered(true)}>ปิด</button>
        </p>
      )}
      <div class="tabs noprint" role="tablist" aria-label="มุมมอง" onKeyDown={onKey}>
        {VIEWS.map((x, i) => (
          <button key={x.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tab-${x.id}`}
            aria-selected={i === tab} aria-controls={i === tab ? `panel-${x.id}` : undefined} tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}>
            <TabIcon id={x.id} />
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      <AskFlag.Provider value={askFlag}>
        <div role="tabpanel" id={`panel-${v.id}`} aria-labelledby={`tab-${v.id}`} tabIndex={0}>
          {v.id === "now" ? <ThisPeriodView store={store} meta={meta} today={today} analysis={a} diary={diary} />
            : v.id === "assistant" ? (
              <>
                <Assistant store={store} diary={diary} meta={meta} today={today} analysis={a} ask={(q) => openChat(q)}
                  go={(to: GoTo) => setTab(VIEWS.findIndex((x) => x.id === to))}>
                  <ChatPanel inline chat={chat} store={store} meta={meta} today={today} open={chatOpen ?? { n: 0 }} onClose={closeChat} />
                </Assistant>
              </>
            )
            : v.id === "diary" ? <><Diary diary={diary} store={store} today={today} analysis={a} /><History store={store} /></>
            : <MyData store={store} meta={meta} today={today} analysis={a} onClearAll={() => { chat.clear(); diary.clearAll(); }} />}
        </div>
      </AskFlag.Provider>
      {/* แชตอยู่ระดับ App นอกแผงแท็บ ใช้ได้ทุกแท็บ ใช้ store/meta/analysis ชุดเดียวกัน */}
      {v.id !== "assistant" && (
        <div class="chat-ui">
          <ChatFab open={!!chatOpen} btnRef={fab} onClick={() => (chatOpen ? closeChat() : openChat())} />
          <ChatPanel chat={chat} store={store} meta={meta} today={today} open={chatOpen} onClose={closeChat} />
        </div>
      )}
    </>
  );
}

const TAB_PATH: Record<string, string> = {
  assistant: "M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4ZM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9Z",
  now: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z",
  diary: "M6 3h12v18H6ZM9 8h6M9 12h6M9 16h3",
  mine: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
};
function TabIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d={TAB_PATH[id]} />
    </svg>
  );
}
