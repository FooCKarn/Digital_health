import type { PanelGroups } from "../model/panel";
import { SEVERITY_TEXT } from "./SeverityBadge";

export const GROUP_TITLE: Record<keyof PanelGroups, string> = {
  avoid: SEVERITY_TEXT.avoid, caution: SEVERITY_TEXT.caution, info: SEVERITY_TEXT.info, other: "ธงอื่น ๆ",
};

/** แถบสรุปจำนวนธงต่อกลุ่ม กดแล้วเปิดและข้ามไปกลุ่มนั้น */
export function SummaryStrip({ groups }: { groups: PanelGroups }) {
  const keys = (Object.keys(GROUP_TITLE) as (keyof PanelGroups)[]).filter((k) => groups[k].length);
  return (
    <nav class="summary-strip" aria-label="สรุปจำนวนธงเตือน">
      {keys.map((k) => (
        <a key={k} href={`#group-${k}`} data-group={k}
          onClick={() => { const d = document.getElementById(`group-${k}`) as HTMLDetailsElement | null; if (d) d.open = true; }}>
          {`${GROUP_TITLE[k]} ${groups[k].length}`}
        </a>
      ))}
    </nav>
  );
}
