import type { Coverage } from "../types";

type Scope = Pick<Coverage, "herbs_in_db" | "drug_classes_in_db"> & { herbs_in_book?: number };

// ตัวเลขทั้งหมดมาจากข้อมูล; ถ้าไม่มีจำนวนในหนังสือจะไม่เดาเลขให้
export function ScopeChip({ coverage, herbsInBook }: { coverage: Scope; herbsInBook?: number }) {
  const total = coverage.herbs_in_book ?? herbsInBook;
  const herbs = total === undefined ? `สมุนไพร ${coverage.herbs_in_db} ชนิด` : `สมุนไพร ${coverage.herbs_in_db} จาก ${total} ชนิด`;
  return <span class="scope-chip">{`${herbs} · ${coverage.drug_classes_in_db} กลุ่มยา`}</span>;
}
