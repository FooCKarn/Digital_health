import { t } from "../i18n";
export function Glossary() {
  return (
    <div class="glossary">
      <h3>{t("ชั้นหลักฐาน A/B/C และคำว่า 'ร่าง' หมายถึงอะไร", "What evidence tiers A/B/C and “draft” mean")}</h3>
      <ul>
        <li>{t("ชั้น A: ข้อความที่หนังสือแนวทางฯ ระบุไว้โดยตรง (คำเตือนทั้งหมดในเวอร์ชันนี้)", "Tier A: stated directly in the guidebook (all warnings in this version)")}</li>
        <li>{t("ชั้น C: ทีมอนุมานจากสรรพคุณที่หนังสือระบุ ยังไม่ใช่ข้อห้ามที่ระบุตรง ๆ (ยังไม่มีในเวอร์ชันนี้)", "Tier C: inferred by the team from the properties listed in the book, not a stated contraindication (none in this version yet)")}</li>
        <li>{t("ชั้น B: แผนในอนาคต ยังไม่มีในเวอร์ชันนี้", "Tier B: planned for the future, not in this version yet")}</li>
        <li>{t("ร่าง: ข้อมูลนี้ยังไม่ถูกตรวจเทียบกับหนังสือโดยผู้เชี่ยวชาญ ใช้เพื่อสาธิตเท่านั้น", "Draft: this data has not been checked against the book by experts. For demonstration only.")}</li>
      </ul>
    </div>
  );
}
