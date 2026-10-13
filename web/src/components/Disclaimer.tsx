import { t } from "../i18n";
export function Disclaimer({ text }: { text: string }) {
  return <p class="disclaimer" role="note" aria-label={t("ข้อจำกัดของผลตรวจ", "Limits of this result")}>{text}</p>;
}
