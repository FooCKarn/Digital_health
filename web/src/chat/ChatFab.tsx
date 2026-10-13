import type { Ref } from "preact";
import { t } from "../i18n";

/** ปุ่มลอยเปิด/ปิดแผงแชต (ชื่อคงที่ สถานะบอกด้วย aria-expanded) */
export function ChatFab({ open, onClick, btnRef }: { open: boolean; onClick(): void; btnRef: Ref<HTMLButtonElement> }) {
  return (
    <button ref={btnRef} type="button" id="chatHead" aria-label={t("เปิดผู้ช่วย AI", "Open AI assistant")} aria-expanded={open} aria-controls="chatPanel" onClick={onClick}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.2A8 8 0 1 1 21 12z" /><path d="M9 11c1 2 3 2.5 6 0" />
      </svg>
    </button>
  );
}
