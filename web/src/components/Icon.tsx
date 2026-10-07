// ไอคอน SVG เขียนเอง (ตกแต่งเท่านั้น ข้อความสื่อความหมายอยู่ข้างๆ เสมอ)
export type IconName = "avoid" | "caution" | "info" | "no_flag" | "no_data";

const PATHS: Record<IconName, string> = {
  avoid: "M12 2.5 21.5 12 12 21.5 2.5 12ZM8 8l8 8M16 8l-8 8", // เพชรมีกากบาท
  caution: "M12 3 22 20H2ZM12 10v4.5M12 17v.5", // สามเหลี่ยมเตือน
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7.5v.5", // วงกลม i
  no_flag: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12h8", // วงกลมขีดกลาง (ไม่ใช่เครื่องหมายถูก)
  no_data: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5", // วงกลม ?
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
