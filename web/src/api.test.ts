import { analyze, ApiError, ask, getMeta, parseText, sendFeedback, explain } from "./api";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const err = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const P = { herbs: [{ id: "khing" }], drugs: [], profile: { conditions: [] } };
const FIXED = "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง";

test("analyze posts JSON to /api/analyze and returns the body", async () => {
  const fetchMock = vi.fn(() => ok({ result: { flags: [] }, summary: {} }));
  vi.stubGlobal("fetch", fetchMock);
  const r = await analyze({ herbs: [{ id: "khing", days_in_use: 3 }], drugs: [], profile: { conditions: [] } });
  expect(fetchMock).toHaveBeenCalledWith("/api/analyze", expect.objectContaining({ method: "POST" }));
  expect(r.result.flags).toEqual([]);
});

test("500 and network failure give the fixed Thai message, never raw codes", async () => {
  vi.stubGlobal("fetch", vi.fn(() => err(500, { error: "server_error", detail: "boom" })));
  await expect(analyze(P)).rejects.toMatchObject({ kind: "server", thaiMessage: FIXED });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fail"))));
  await expect(analyze(P)).rejects.toMatchObject({ kind: "network", thaiMessage: FIXED });
});

test("400 with non-Thai message falls back to the fixed text; Thai message is kept", async () => {
  vi.stubGlobal("fetch", vi.fn(() => err(400, { error: "bad json" })));
  await expect(analyze({ herbs: [], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ kind: "bad_request", thaiMessage: FIXED });
  vi.stubGlobal("fetch", vi.fn(() => err(400, { error: "herbs ต้องมี 1-50 รายการ" })));
  await expect(analyze({ herbs: [], drugs: [], profile: { conditions: [] } }))
    .rejects.toMatchObject({ thaiMessage: "herbs ต้องมี 1-50 รายการ" });
});

test("503 uses the server message; missing message falls back", async () => {
  vi.stubGlobal("fetch", vi.fn(() => err(503, { error: "llm_unavailable", message: "AI ใช้ไม่ได้ กรุณากรอกเอง" })));
  await expect(parseText("ขิง")).rejects.toMatchObject({ kind: "unavailable", thaiMessage: "AI ใช้ไม่ได้ กรุณากรอกเอง" });
  vi.stubGlobal("fetch", vi.fn(() => err(503, { error: "llm_unavailable", message: "no key" })));
  await expect(parseText("ขิง")).rejects.toMatchObject({ kind: "unavailable", thaiMessage: FIXED });
});

test("malformed 200 body is an ApiError, not a TypeError", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("not json", { status: 200 }))));
  await expect(analyze(P)).rejects.toBeInstanceOf(ApiError);
  vi.stubGlobal("fetch", vi.fn(() => ok({ nope: 1 })));
  await expect(analyze(P)).rejects.toBeInstanceOf(ApiError);
  vi.stubGlobal("fetch", vi.fn(() => ok({ answer: { source: "database" } })));
  await expect(ask({ question: "q", context_herbs: [] })).rejects.toBeInstanceOf(ApiError);
});

test("getMeta uses GET; ask unwraps answer; sendFeedback resolves", async () => {
  const f = vi.fn(() => ok({ herbs: [], drugs: [], conditions: [], coverage: {}, disclaimer_th: "d", chat_followups_th: [] }));
  vi.stubGlobal("fetch", f);
  expect((await getMeta()).disclaimer_th).toBe("d");
  expect(f).toHaveBeenCalledWith("/api/meta", expect.anything());
  vi.stubGlobal("fetch", vi.fn(() => ok({ answer: { source: "database", text_th: "t", cites: [], follow_ups: [], rejected_reason: null } })));
  expect((await ask({ question: "q", context_herbs: [] })).text_th).toBe("t");
  vi.stubGlobal("fetch", vi.fn(() => ok({ ok: true })));
  await expect(sendFeedback({ session_id: "s", reviewer_role: "citizen", entries: [] })).resolves.toBeUndefined();
});

test("explain: คำตอบรูปผิดหรือ source แปลก -> ApiError server", async () => {
  const good = { source: "llm", summary_th: "x", items: [{ flag_id: "f", text_th: "t" }], disclaimer_th: "d" };
  vi.stubGlobal("fetch", vi.fn(() => ok({ explanation: good })));
  await expect(explain(P)).resolves.toMatchObject({ explanation: { source: "llm" } });
  for (const bad of [{ ...good, items: undefined }, { ...good, summary_th: 1 }, { ...good, source: "x" }, { ...good, items: [{ flag_id: "f" }] }]) {
    vi.stubGlobal("fetch", vi.fn(() => ok({ explanation: bad })));
    await expect(explain(P)).rejects.toMatchObject({ kind: "server", thaiMessage: FIXED });
  }
});
