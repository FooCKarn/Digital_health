import { tMap } from "../i18n";
import { Icon, type IconName } from "./Icon";

export type BadgeKind = IconName;

// ข้อความตายตัว; no_flag ห้ามสื่อว่าปลอดภัย
export const SEVERITY_TEXT: Record<BadgeKind, string> = tMap(
  { avoid: "ควรหลีกเลี่ยง", caution: "ควรระวัง", info: "ข้อมูลเพิ่มเติม", no_flag: "ไม่พบคำเตือนในฐานข้อมูลนี้", no_data: "ยังไม่มีข้อมูลตรวจ" },
  { avoid: "Avoid", caution: "Use caution", info: "More information", no_flag: "No warning found in this database", no_data: "No check results yet" },
);

export function SeverityBadge({ kind, prefix = "" }: { kind: BadgeKind; prefix?: string }) {
  return (
    <span class="badge" data-kind={kind}>
      <Icon name={kind} />
      <span>{prefix + SEVERITY_TEXT[kind]}</span>
    </span>
  );
}
