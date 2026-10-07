// ข้อมูลสมมติสำหรับเทสต์เท่านั้น (ไม่ใช่ข้อมูลความปลอดภัยจริง)
import type { AnalyzeResult, Flag, Meta, Summary } from "../types";

export const T = "2026-10-07";

export const META: Meta = {
  herbs: [{ id: "khing", name_th: "ขิง", parts: [] }, { id: "fathalai", name_th: "ฟ้าทะลายโจร", parts: [] }],
  drugs: ["warfarin"],
  conditions: { htn: "ความดันโลหิตสูง" },
  coverage: { herbs_in_db: 12, herbs_in_book: 50, drug_classes_in_db: 7 },
  disclaimer_th: "ผลนี้ไม่ใช่การวินิจฉัย",
  chat_followups_th: [],
};

export function flag(over: Partial<Flag> = {}): Flag {
  return {
    flag_id: "f1", rule_id: "R1", severity: "caution", evidence_tier: "A", mechanism_tag: null, herb_id: "khing",
    message_th: "ข้อความธงทดสอบ", source_page: 12, pdf_page: 30, evidence_quote: "วลีทดสอบ", verified: true, ...over,
  };
}

export function body(flags: Flag[] = [], over: { result?: Partial<AnalyzeResult>; summary?: Partial<Summary>; coverage?: Partial<AnalyzeResult["coverage"]> } = {}) {
  const coverage = { herbs_in_db: 12, drug_classes_in_db: 7, unknown_inputs: [], not_checked: [], ...over.coverage };
  const result: AnalyzeResult = {
    flags, aggregates: [], swaps: [], pharmacist_review_required: false, coverage, disclaimer_th: "ผลนี้ไม่ใช่การวินิจฉัย", ...over.result,
  };
  const summary: Summary = {
    herbs: [{ id: "khing", name_th: "ขิง", part: null, days_in_use: 1 }], drugs_as_entered: [], flags, aggregates: [],
    pharmacist_review_required: false, unknown_inputs: coverage.unknown_inputs, not_checked: coverage.not_checked, coverage,
    follow_up_questions_th: [], headline_th: flags.length ? `พบธงเตือน ${flags.length} รายการจากฐานข้อมูลนี้` : "ไม่พบธงเตือนในฐานข้อมูลนี้",
    draft_notice_th: null, disclaimer_th: "ผลนี้ไม่ใช่การวินิจฉัย", ...over.summary,
  };
  return { result, summary };
}

export const respond = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** ใช้กับ fake timers: เดินเวลา (ผ่านช่วงหน่วง 300 ms) แล้วรอ promise ของ fetch/json ให้จบ */
export async function flush(ms = 300) {
  const { act } = await import("@testing-library/preact");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  });
}
