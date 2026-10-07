import type { AnalyzePayload, AnalyzeResult, AskAnswer, AskPayload, Explanation, FeedbackPayload, Meta, ParseProposal, Summary } from "./types";

const FIXED = "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง";
const THAI = /[฀-๿]/;

export class ApiError extends Error {
  constructor(public kind: "network" | "server" | "bad_request" | "unavailable", public thaiMessage: string = FIXED) {
    super(kind);
  }
}

// ไม่เอา detail/รหัสดิบจากเซิร์ฟเวอร์มาแสดง; 400 แสดงเฉพาะข้อความไทย, 503 แสดง message ของเซิร์ฟเวอร์ (ถ้าเป็นไทย)
async function call<T>(url: string, init: RequestInit, check: (d: any) => boolean): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (s: unknown) => (typeof s === "string" && THAI.test(s) ? s : FIXED);
    if (res.status === 400) throw new ApiError("bad_request", msg(data?.error));
    if (res.status === 503) throw new ApiError("unavailable", msg(data?.message));
    throw new ApiError("server");
  }
  if (!data || typeof data !== "object" || !check(data)) throw new ApiError("server");
  return data as T;
}

const post = <T>(url: string, body: unknown, check: (d: any) => boolean, signal?: AbortSignal) =>
  call<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }, check);

export const analyze = (payload: AnalyzePayload, signal?: AbortSignal) =>
  post<{ result: AnalyzeResult; summary: Summary }>("/api/analyze", payload, (d) => !!d.result && Array.isArray(d.result.flags) && !!d.summary, signal);

export const getMeta = () => call<Meta>("/api/meta", { method: "GET" }, (d) => Array.isArray(d.herbs) && typeof d.disclaimer_th === "string");

export const ask = async (payload: AskPayload): Promise<AskAnswer> =>
  (await post<{ answer: AskAnswer }>("/api/ask", payload, (d) => typeof d.answer?.text_th === "string")).answer;

export const parseText = (text: string) =>
  post<ParseProposal>("/api/parse", { text }, (d) => Array.isArray(d.herbs) && Array.isArray(d.drugs));

export const explain = (payload: AnalyzePayload) =>
  post<{ explanation: Explanation }>("/api/explain", payload, (d) => !!d.explanation);

export const sendFeedback = async (payload: FeedbackPayload): Promise<void> => {
  await post("/api/feedback", payload, (d) => d.ok === true);
};
