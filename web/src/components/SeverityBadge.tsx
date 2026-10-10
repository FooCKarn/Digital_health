import { Icon, type IconName } from "./Icon";

export type BadgeKind = IconName;

// ข้อความตายตัวตามสเปก §8 (รอทีมยืนยันใน §12); no_flag ห้ามสื่อว่าปลอดภัย
export const SEVERITY_TEXT: Record<BadgeKind, string> = {
  avoid: "ควรหลีกเลี่ยง",
  caution: "ควรระวัง",
  info: "ข้อมูลเพิ่มเติม",
  no_flag: "ไม่พบคำเตือนในฐานข้อมูลนี้",
  no_data: "ยังไม่มีข้อมูลตรวจ",
};

export function SeverityBadge({ kind, prefix = "" }: { kind: BadgeKind; prefix?: string }) {
  return (
    <span class="badge" data-kind={kind}>
      <Icon name={kind} />
      <span>{prefix + SEVERITY_TEXT[kind]}</span>
    </span>
  );
}
