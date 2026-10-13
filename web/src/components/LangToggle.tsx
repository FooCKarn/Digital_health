import { setLang, t, useLang } from "../i18n";

/** ปุ่มเดียวสลับไทย/อังกฤษ: ป้ายบอกภาษาที่จะสลับไป */
export function LangToggle() {
  const lang = useLang();
  return (
    <button type="button" class="lang-toggle noprint" lang={lang === "th" ? "en" : "th"}
      aria-label={lang === "th" ? "EN: Switch to English" : "ไทย: เปลี่ยนเป็นภาษาไทย"}
      onClick={() => setLang(lang === "th" ? "en" : "th")}>
      {lang === "th" ? "EN" : "ไทย"}
    </button>
  );
}
