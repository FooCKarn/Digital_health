import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ApiError, getMeta } from "./api";
import { LangToggle } from "./components/LangToggle";
import { getLang, pick, t, useLang } from "./i18n";
import { ChatFab } from "./chat/ChatFab";
import { ChatPanel, type OpenRequest } from "./chat/ChatPanel";
import { AskFlag, ChatStore, getSessionStorage } from "./chat/chatStore";
import { Assistant, type GoTo } from "./components/Assistant";
import { Diary } from "./components/Diary";
import { History } from "./components/History";
import { Welcome } from "./components/Welcome";
import { Policy } from "./components/Policy";
import { MyData } from "./components/MyData";
import { ThisPeriodView } from "./components/ThisPeriod";
import { useAnalysis } from "./hooks/useAnalysis";
import { todayISO } from "./model/dates";
import { getLocalStorage } from "./model/storage";
import { TrackerStore } from "./model/tracker";
import { AssistantLog } from "./model/assistantLog";
import { DiaryStore } from "./model/diary";
import { CloudSync } from "./model/cloud";
import { ReminderStore, hhmm } from "./model/reminder";
import type { Meta } from "./types";
import { entryName } from "./texts";

const VIEWS = [
  { id: "now", th: "ช่วงนี้", en: "This period" },
  { id: "assistant", th: "ผู้ช่วย", en: "Assistant" },
  { id: "diary", th: "บันทึก", en: "Diary" },
  { id: "mine", th: "ข้อมูลของฉัน", en: "My data" },
] as const;

export function App() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t("ใบพลู: ตรวจคำเตือนสมุนไพรไทยร่วมกับยา (ต้นแบบ)", "Baiplu: check warnings for Thai herbs used with medicines (prototype)");
  }, [lang]);
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

  return (
    <>
      <header>
        <div class="appbar">
        <img class="logo" src="/logo.svg" alt="" width="56" height="56" />
        <div>
          <h1>{t("ใบพลู", "Baiplu")}</h1>
          <p class="meta">{t("ติดตามสมุนไพรและยา ตรวจคำเตือนให้", "Track your herbs and medicines, and check for warnings")}</p>
        </div>
        <LangToggle />
        </div>
        <p class="proto-banner"><strong>{t("ต้นแบบ ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลผู้ป่วยจริง", "Prototype. Use made-up data only. Do not enter real patient information.")}</strong></p>
      </header>
      <main>
        {meta ? <Home store={store} diary={diary} meta={meta} /> : error ? (
          <div class="err" role="alert">
            <span>{`${t("โหลดข้อมูลไม่สำเร็จ", "Couldn't load data")}: ${error}`}</span>{" "}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>{t("ลองใหม่", "Try again")}</button>
          </div>
        ) : <p>{t("กำลังโหลด…", "Loading…")}</p>}
      </main>
      <footer>
        <details class="opt-box noprint">
          <summary>{t("เกี่ยวกับเครื่องมือนี้", "About this tool")}</summary>
          <p>{t("ใบพลู เป็นต้นแบบช่วยดูว่าสมุนไพรไทยที่ใช้ร่วมกับยาแผนปัจจุบันมีคำเตือนอะไรบ้าง ตัดสินด้วยกฎที่เขียนเป็นโค้ด ไม่ได้ให้ AI ตัดสิน",
            "Baiplu is a prototype that shows which warnings apply when Thai herbs are used together with conventional medicines. Warnings come from rules written in code, not from an AI's judgment.")}</p>
          <p>{t("แหล่งข้อมูล: หนังสือแนวทางการใช้ยาสมุนไพรในการดูแลอาการเจ็บป่วยเบื้องต้น (TTM first) ครอบคลุมเพียงบางส่วนของ 50 ชนิดในเล่ม (ดูจำนวนจริงในผลตรวจ) ส่วนข้อห้ามของ “ตำรับยาบำรุงโลหิต” มาจากแนวทางการตั้งตำรับยาบำรุงโลหิตของสถาบันการแพทย์แผนไทย",
            "Source: the guidebook on using herbal medicines for common minor ailments (TTM first). It covers only some of the 50 herbs in the book (see the actual count in your results). The contraindications for the blood-tonic formula (“ตำรับยาบำรุงโลหิต”) come from the Institute of Thai Traditional Medicine's guidelines for that formula.")}</p>
          <p>{t("ข้อจำกัด: ข้อมูลยังเป็นร่าง ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ ไม่ใช่การวินิจฉัยหรือสั่งยา การไม่พบคำเตือนไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร",
            "Limits: the data is a draft and experts haven't reviewed it. This is not a diagnosis or a prescription. No warning doesn't mean a combination is suitable to use. Ask a pharmacist.")}</p>
        </details>
        <Policy />
        {meta && <p class="meta">{pick(meta.disclaimer_th, meta.disclaimer_en)}</p>}
      </footer>
    </>
  );
}

/** สามมุมมองใช้ผลตรวจชุดเดียว (เรียก /api/analyze ที่เดียว) */
function Home({ store, diary, meta }: { store: TrackerStore; diary: DiaryStore; meta: Meta }) {
  // คำนวณทุกครั้งที่ render (Home render ใหม่เมื่อข้อมูล/แท็บเปลี่ยน) เปิดหน้าข้ามเที่ยงคืนแล้ววันที่ใช้จึงขยับตาม
  // ไม่มีตัวจับเวลาเที่ยงคืน ถ้าเปิดหน้าค้างไว้ วันที่จะขยับเมื่อมีการโต้ตอบครั้งถัดไป
  const today = todayISO();
  const a = useAnalysis(store, today, Object.keys(meta.conditions));
  const [tab, setTab] = useState(0);
  const reminder = useMemo(() => new ReminderStore(getLocalStorage()), []);
  const cloud = useMemo(() => new CloudSync(store, diary, reminder), [store, diary, reminder]);
  const [, setCloudV] = useState(0);
  useEffect(() => { const off = cloud.subscribe(() => setCloudV((v) => v + 1)); void cloud.init(); return off; }, [cloud]);
  const assistantLog = useMemo(() => new AssistantLog(), []); // บทสนทนาหน้าผู้ช่วย: อยู่ในหน่วยความจำ ไม่ลงที่เก็บ
  const [reminderBanner, setReminderBanner] = useState(false);
  // เตือนให้บันทึกการใช้: ทำงานตอนเปิดหน้านี้ค้างไว้ (ไม่มีเซิร์ฟเวอร์) ข้อความไม่ใส่ชื่อยา
  useEffect(() => {
    const tick = () => {
      const day = todayISO();
      if (!reminder.shouldFire(hhmm(new Date()), day, store.active().some((i) => !diary.isTaken(i.id, day)))) return;
      reminder.markFired(day);
      setReminderBanner(true);
      try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(t("ใบพลู", "Baiplu"), { body: t("ถึงเวลาบันทึกการใช้วันนี้แล้ว", "Time to log today's doses.") }); } catch { /* มีแบนเนอร์ในหน้าแทน */ }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [store, diary, reminder]);
  const [hideRecovered, setHideRecovered] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const chat = useMemo(() => new ChatStore(getSessionStorage()), []);
  const [chatOpen, setChatOpen] = useState<OpenRequest>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const openChat = (prefill?: string) => setChatOpen((o) => ({ n: (o?.n ?? 0) + 1, prefill }));
  const closeChat = () => { setChatOpen(null); fab.current?.focus(); };
  const herbName = (id: string) => entryName(meta, id);
  const askFlag = useMemo(() => ({ herbName, ask: (f: { herb_id: string }) => openChat(getLang() === "en" ? `Explain the warning for ${herbName(f.herb_id)}` : `อธิบายคำเตือนของ${herbName(f.herb_id)}`) }), [meta]);

  // แท็บแบบ roving tabindex: ลูกศรซ้าย/ขวา (วน), Home, End
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
      {/* แจ้งทุกหน้า ไม่ใช่เฉพาะหน้า ข้อมูลของฉัน */}
      {!store.persistent && (
        <p class="warn" role="status">{t("ข้อมูลจะหายเมื่อปิดหน้านี้ (เบราว์เซอร์ไม่ให้บันทึก) ถ้าอยากเก็บ ให้ส่งออกไฟล์ในหน้า ข้อมูลของฉัน", "Your data will be gone when you close this page (the browser isn't letting it save). To keep it, export a file from the My data tab.")}</p>
      )}
      {store.recovered && !hideRecovered && (
        <p class="warn row-actions" role="alert">
          <span>{t("ข้อมูลที่เก็บไว้เสียหาย จึงเริ่มต้นใหม่ให้", "The saved data was damaged, so we started over.")}</span>
          <button type="button" aria-label={t("ปิดข้อความ ข้อมูลเสียหาย", "Close damaged-data message")} onClick={() => setHideRecovered(true)}>{t("ปิด", "Close")}</button>
        </p>
      )}
      {reminderBanner && (
        <p class="warn row-actions" role="status">
          <span>{t("ถึงเวลาบันทึกการใช้วันนี้แล้ว", "Time to log today's doses.")}</span>
          <button type="button" onClick={() => { setTab(VIEWS.findIndex((x) => x.id === "assistant")); setReminderBanner(false); }}>{t("ไปบันทึก", "Log now")}</button>
          <button type="button" aria-label={t("ปิดข้อความเตือน", "Close reminder")} onClick={() => setReminderBanner(false)}>{t("ปิด", "Close")}</button>
        </p>
      )}
      <Welcome cloud={cloud} storage={getLocalStorage()} />
      <div class="tabs noprint" role="tablist" aria-label={t("มุมมอง", "Views")} onKeyDown={onKey}>
        {VIEWS.map((x, i) => (
          <button key={x.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tab-${x.id}`}
            aria-selected={i === tab} aria-controls={i === tab ? `panel-${x.id}` : undefined} tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}>
            <TabIcon id={x.id} />
            <span>{t(x.th, x.en)}</span>
          </button>
        ))}
      </div>
      <AskFlag.Provider value={askFlag}>
        <div role="tabpanel" id={`panel-${v.id}`} aria-labelledby={`tab-${v.id}`} tabIndex={0}>
          {v.id === "now" ? <ThisPeriodView store={store} meta={meta} today={today} analysis={a} diary={diary} />
            : v.id === "assistant" ? (
              <Assistant store={store} diary={diary} meta={meta} today={today} analysis={a} reminder={reminder} log={assistantLog}
                go={(to: GoTo) => setTab(VIEWS.findIndex((x) => x.id === to))} />
            )
            : v.id === "diary" ? <><Diary diary={diary} store={store} today={today} analysis={a} /><History store={store} /></>
            : <MyData store={store} meta={meta} today={today} analysis={a} cloud={cloud} onClearAll={() => { chat.clear(); assistantLog.clear(); diary.clearAll(); }} />}
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
