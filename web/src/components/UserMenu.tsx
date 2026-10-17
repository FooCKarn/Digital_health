import { useEffect, useRef, useState } from "preact/hooks";
import { useAccountBadge } from "../accountBadge";
import { t, useLang } from "../i18n";

/** ชื่อผู้ใช้ที่เข้าสู่ระบบอยู่ ที่หัวเว็บ กดแล้วมีปุ่มออกจากระบบ (ไม่เข้าสู่ระบบ = ไม่แสดงอะไร) */
export function UserMenu() {
  useLang();
  const badge = useAccountBadge();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); chip.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { if (!badge) setOpen(false); }, [badge]);

  if (!badge) return null;
  return (
    <div class="user-menu noprint" ref={box}>
      <button type="button" ref={chip} class="user-chip" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{badge.handle}</button>
      {open && (
        <div class="user-pop">
          <button type="button" onClick={() => { setOpen(false); badge.logout(); }}>{t("ออกจากระบบ", "Log out")}</button>
        </div>
      )}
    </div>
  );
}
