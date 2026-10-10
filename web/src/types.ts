// ชนิดข้อมูลตรงกับที่เซิร์ฟเวอร์คืนจริง (engine/check.py, summary.py, service.py, rag.py, llm.py)
export type Severity = "avoid" | "caution" | "info";

export interface Flag {
  flag_id: string;
  rule_id: string;
  severity: Severity;
  evidence_tier: "A" | "B" | "C";
  mechanism_tag: string | null;
  herb_id: string;
  message_th: string;
  source_page: number | string;
  pdf_page: number | null;
  evidence_quote: string | null;
  verified: boolean;
  drug_class?: string | null;
  condition?: string;
  group?: string;
  /** เอกสารต้นทางของหน้าที่อ้าง (มีเฉพาะคำเตือนของตำรับ คำเตือนสมุนไพรอ้างเล่ม TTM first เป็นค่าเริ่มต้น) */
  source_doc_th?: string;
}

export interface Aggregate {
  mechanism_tag: string;
  label_th: string;
  sources: string[];
  count: number;
  severity: Severity;
  flag_ids: string[];
  message_th: string;
}

export interface Coverage {
  herbs_in_db: number;
  drug_classes_in_db: number;
  unknown_inputs: string[];
  not_checked: string[];
}

export interface AnalyzeResult {
  flags: Flag[];
  aggregates: Aggregate[];
  swaps: unknown[];
  pharmacist_review_required: boolean;
  coverage: Coverage;
  disclaimer_th: string;
}

export interface Summary {
  herbs: { id: string; name_th: string | null; part: string | null; days_in_use: number | null }[];
  drugs_as_entered: string[];
  flags: Flag[];
  aggregates: Aggregate[];
  pharmacist_review_required: boolean;
  unknown_inputs: string[];
  not_checked: string[];
  coverage: Coverage;
  follow_up_questions_th: string[];
  headline_th: string;
  draft_notice_th: string | null;
  disclaimer_th: string;
}

export interface Meta {
  herbs: { id: string; name_th: string; parts: string[] }[];
  /** ตำรับ (ไม่นับเป็นสมุนไพรในขอบเขต) */
  formulas: { id: string; name_th: string; note_th: string }[];
  drugs: string[];
  conditions: Record<string, string>; // รหัส -> ชื่อไทย (data/conditions.json)
  coverage: { herbs_in_db: number; herbs_in_book: number; drug_classes_in_db: number };
  disclaimer_th: string;
  chat_followups_th: string[];
}

export interface AnalyzePayload {
  herbs: { id: string; part?: string; days_in_use?: number }[];
  drugs: string[];
  profile: { age?: number; pregnant?: boolean; breastfeeding?: boolean; conditions: string[] };
}

export interface AskPayload extends Partial<AnalyzePayload> {
  question: string;
  context_herbs: string[];
}

export interface Cite {
  item_id: string;
  herb_id: string;
  herb_name_th: string;
  source_page: number | string;
  pdf_page: number | null;
  evidence_quote: string | null;
  verified: boolean;
  source_doc_th?: string;
}

export interface AskAnswer {
  source: string; // เช่น database | refusal | emergency
  text_th: string;
  cites: Cite[];
  follow_ups: string[];
  rejected_reason: string | null;
}

export interface BriefFacts {
  item_count: number; taken_count: number; untaken: string[];
  warnings: { total: number; avoid: number } | null; no_entry_today: boolean;
  not_checked_count?: number; longest_days?: number;
}
export interface BriefOut { source: "llm" | "template"; summary_th: string; rejected_reason: string | null }
export interface IntentOut { action: "taken" | "not_taken" | "none"; item_ids: string[] }

export interface ParseProposal {
  herbs: { id: string; days_in_use?: number }[];
  drugs: string[];
  unmatched: string[];
  dropped: number;
}

export interface Explanation {
  source: "llm" | "template";
  rejected_reason: string | null;
  summary_th: string;
  items: { flag_id: string; text_th: string }[];
  disclaimer_th: string;
}

export interface FeedbackPayload {
  session_id: string;
  case_id?: string;
  reviewer_role: "citizen" | "pharmacist" | "other";
  entries: { flag_id: string; agree: boolean | "unsure" }[];
  comment?: string;
  time_spent_sec?: number;
}
