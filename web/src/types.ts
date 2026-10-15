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
  message_en?: string;
  source_page: number | string;
  pdf_page: number | null;
  evidence_quote: string | null;
  evidence_quote_en?: string;
  verified: boolean;
  drug_class?: string | null;
  condition?: string;
  group?: string;
  /** เอกสารต้นทางของหน้าที่อ้าง (มีเฉพาะคำเตือนของตำรับ คำเตือนสมุนไพรอ้างเล่ม TTM first เป็นค่าเริ่มต้น) */
  source_doc_th?: string;
  source_doc_en?: string;
}

export interface Aggregate {
  mechanism_tag: string;
  label_th: string;
  label_en?: string;
  sources: string[];
  count: number;
  severity: Severity;
  flag_ids: string[];
  message_th: string;
  message_en?: string;
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
  disclaimer_en?: string;
}

export interface Summary {
  herbs: { id: string; name_th: string | null; name_en?: string; part: string | null; days_in_use: number | null }[];
  drugs_as_entered: string[];
  flags: Flag[];
  aggregates: Aggregate[];
  pharmacist_review_required: boolean;
  unknown_inputs: string[];
  not_checked: string[];
  coverage: Coverage;
  follow_up_questions_th: string[];
  follow_up_questions_en?: string[];
  headline_th: string;
  headline_en?: string;
  draft_notice_th: string | null;
  draft_notice_en?: string | null;
  disclaimer_th: string;
  disclaimer_en?: string;
}

export interface Meta {
  herbs: { id: string; name_th: string; name_en?: string; parts: string[] }[];
  /** ตำรับ (ไม่นับเป็นสมุนไพรในขอบเขต) */
  formulas: { id: string; name_th: string; name_en?: string; note_th: string; note_en?: string }[];
  drugs: string[];
  conditions: Record<string, string>; // รหัส -> ชื่อไทย (data/conditions.json)
  conditions_en?: Record<string, string>;
  coverage: { herbs_in_db: number; herbs_in_book: number; drug_classes_in_db: number };
  disclaimer_th: string;
  disclaimer_en?: string;
  chat_followups_th: string[];
  chat_followups_en?: string[];
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
  evidence_quote_en?: string;
  verified: boolean;
  source_doc_th?: string;
  herb_name_en?: string;
  source_doc_en?: string;
}

export interface AskAnswer {
  source: string; // เช่น database | refusal | emergency
  text_th: string;
  /** มีเมื่อเซิร์ฟเวอร์แปลได้ครบ (ข้อความที่ AI เรียบเรียงยังเป็นไทยอย่างเดียว) */
  text_en?: string;
  cites: Cite[];
  follow_ups: string[];
  follow_ups_en?: string[];
  rejected_reason: string | null;
  /** แหล่งอ้างอิงจากการค้นภายนอก (เมื่อ source = web) */
  web_sources?: { title: string; url: string }[];
}

export interface BriefFacts {
  item_count: number; taken_count: number; untaken: string[];
  warnings: { total: number; avoid: number } | null; no_entry_today: boolean;
  not_checked_count?: number; longest_days?: number;
}
export interface BriefOut { source: "llm" | "template"; summary_th: string; summary_en?: string; rejected_reason: string | null }
export type RouteTool = "ask" | "show_brief" | "show_check" | "mark_taken" | "mark_not_taken" | "add_items" | "set_reminder" | "go_to" | "log_mood";
export interface RouteOut { tool: RouteTool; item_ids: string[]; time: string; page: string; mood: number; days?: number }

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
  summary_en?: string;
  items: { flag_id: string; text_th: string; text_en?: string }[];
  disclaimer_th: string;
  disclaimer_en?: string;
}

export interface FeedbackPayload {
  session_id: string;
  case_id?: string;
  reviewer_role: "citizen" | "pharmacist" | "other";
  entries: { flag_id: string; agree: boolean | "unsure" }[];
  comment?: string;
  time_spent_sec?: number;
}
