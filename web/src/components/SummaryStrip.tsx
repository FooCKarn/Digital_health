import { t, tMap } from "../i18n";
import type { PanelGroups } from "../model/panel";

export const GROUP_TITLE: Record<keyof PanelGroups, string> = tMap(
  { avoid: "ควรหลีกเลี่ยง", caution: "ควรระวัง", info: "ข้อมูลเพิ่มเติม", other: "คำเตือนอื่น ๆ" },
  { avoid: "Avoid", caution: "Use caution", info: "More information", other: "Other warnings" },
);

/** แถบสรุปจำนวนคำเตือนต่อกลุ่ม กดแล้วเปิดและข้ามไปกลุ่มนั้น */
export function SummaryStrip({ groups }: { groups: PanelGroups }) {
  const keys = (Object.keys(GROUP_TITLE) as (keyof PanelGroups)[]).filter((k) => groups[k].length);
  return (
    <nav class="summary-strip" aria-label={t("สรุปจำนวนคำเตือน", "Warning count summary")}>
      {keys.map((k) => (
        <a key={k} href={`#group-${k}`} data-group={k}
          onClick={() => { const d = document.getElementById(`group-${k}`) as HTMLDetailsElement | null; if (d) d.open = true; }}>
          {`${GROUP_TITLE[k]} ${groups[k].length}`}
        </a>
      ))}
    </nav>
  );
}
