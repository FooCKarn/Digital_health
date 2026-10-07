import { useEffect, useMemo, useState } from "preact/hooks";
import { ApiError, getMeta } from "./api";
import { ThisPeriod } from "./components/ThisPeriod";
import { todayISO } from "./model/dates";
import { getLocalStorage } from "./model/storage";
import { TrackerStore } from "./model/tracker";
import type { Meta } from "./types";

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

  return (
    <main>
      <h1>HerbGuard TTM</h1>
      {meta ? <ThisPeriod store={store} meta={meta} today={todayISO()} /> : error ? (
        <div class="err" role="alert">
          <span>{`โหลดข้อมูลไม่สำเร็จ: ${error}`}</span>{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</button>
        </div>
      ) : <p>กำลังโหลด…</p>}
    </main>
  );
}
