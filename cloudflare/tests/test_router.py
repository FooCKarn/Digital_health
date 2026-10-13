"""เส้นทาง /api/* ผ่าน router เดียวกับที่ Worker ใช้ (ฐานข้อมูลเป็น SQLite แทน D1)"""
import json
from datetime import datetime, timezone

import pytest

import dataset as ds
import llm
import llm_bridge
import router
import service
from crypto import PyCrypto
from conftest import run
from policy import POLICY_VERSION

HOST = "herbguard.example"
KHING = {"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}}


def mk(db, **kw):
    return router.Ctx(db=db, crypto=PyCrypto(), now=lambda: datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc), secure_cookie=True, **kw)


def req(method, path, body=None, cookie=None, origin=f"https://{HOST}", ctype="application/json", raw=None, ip="1.2.3.4"):
    h = {"host": HOST, "content-type": ctype}
    if origin:
        h["origin"] = origin
    if cookie:
        h["cookie"] = cookie
    data = raw if raw is not None else (json.dumps(body, ensure_ascii=False).encode() if body is not None else b"")
    return router.Request(method, path, h, data, ip)


def call(ctx, *a, **k):
    return run(router.handle(req(*a, **k), ctx))


def session_cookie(resp):
    return resp.cookies[0].split(";")[0]


def signup(ctx, handle="somchai"):
    r = call(ctx, "POST", "/api/auth/register", {"handle": handle, "password": "correct-horse-battery", "consent_policy": POLICY_VERSION})
    assert r.status == 200
    return session_cookie(r)


def test_meta_and_analyze_match_service_and_have_security_headers(db):
    ctx = mk(db)
    m = call(ctx, "GET", "/api/meta", origin=None)
    assert m.status == 200 and m.body["coverage"]["herbs_in_db"] == 21 and m.body["policy_version"] == POLICY_VERSION
    assert m.headers["Cache-Control"] == "no-store" and m.headers["X-Content-Type-Options"] == "nosniff" and "noindex" in m.headers["X-Robots-Tag"]
    a = call(ctx, "POST", "/api/analyze", KHING)
    assert a.status == 200 and a.body == service.run(KHING)
    assert any(f["rule_id"] == "R2" for f in a.body["result"]["flags"])


def test_bad_input_is_400_with_thai_message_and_never_leaks_internals(db):
    ctx = mk(db)
    r = call(ctx, "POST", "/api/analyze", {"herbs": "x"})
    assert r.status == 400 and r.body["error"]
    assert call(ctx, "POST", "/api/analyze", raw=b"{oops").status == 400
    r500 = call(mk(db, ensure_data=_boom), "POST", "/api/analyze", KHING)
    assert r500.status == 500 and set(r500.body) == {"error", "detail"} and "secret-path" not in json.dumps(r500.body)


async def _boom():
    raise RuntimeError("secret-path /etc/passwd")


def test_mutating_requests_need_matching_origin_json_and_size(db):
    ctx = mk(db)
    for origin in (None, "https://evil.example", "http://" + HOST + ".evil.example"):
        assert call(ctx, "POST", "/api/analyze", KHING, origin=origin).status == 403
    assert call(ctx, "POST", "/api/analyze", KHING, ctype="text/plain").status == 415
    assert call(ctx, "POST", "/api/analyze", raw=b"x" * (router.DEFAULT_MAX_BODY + 1)).status == 413
    assert call(ctx, "GET", "/api/meta", origin=None).status == 200            # อ่านข้อมูลไม่ต้องมี Origin
    assert call(ctx, "PATCH", "/api/meta").status == 405
    assert call(ctx, "GET", "/nope").status == 404 and call(ctx, "GET", "/api/nope").status == 404


def test_register_sets_httponly_cookie_and_me_login_logout_flow(db):
    ctx = mk(db)
    r = call(ctx, "POST", "/api/auth/register", {"handle": "somchai", "password": "correct-horse-battery", "consent_policy": POLICY_VERSION})
    ck = r.cookies[0]
    assert "HttpOnly" in ck and "SameSite=Lax" in ck and "Secure" in ck and "Path=/" in ck
    me = call(ctx, "GET", "/api/auth/me", cookie=session_cookie(r), origin=None)
    assert me.body["user"] == {"handle": "somchai"}
    assert call(ctx, "GET", "/api/auth/me", origin=None).body["user"] is None
    out = call(ctx, "POST", "/api/auth/logout", {}, cookie=session_cookie(r))
    assert "Max-Age=0" in out.cookies[0]
    assert call(ctx, "GET", "/api/auth/me", cookie=session_cookie(r), origin=None).body["user"] is None
    lg = call(ctx, "POST", "/api/auth/login", {"handle": "somchai", "password": "correct-horse-battery"})
    assert lg.status == 200 and lg.cookies
    assert call(ctx, "POST", "/api/auth/login", {"handle": "somchai", "password": "wrong-password-1"}).status == 401
    assert call(ctx, "POST", "/api/auth/register", {"handle": "somchai", "password": "correct-horse-battery", "consent_policy": POLICY_VERSION}).status == 409
    assert call(ctx, "POST", "/api/auth/register", {"handle": "other", "password": "correct-horse-battery", "consent_policy": "old"}).status == 400


def test_local_dev_cookie_without_secure_flag(db):
    ctx = router.Ctx(db=db, crypto=PyCrypto(), secure_cookie=False)
    r = call(ctx, "POST", "/api/auth/register", {"handle": "somchai", "password": "correct-horse-battery", "consent_policy": POLICY_VERSION})
    assert "Secure" not in r.cookies[0]


def test_state_needs_login_and_saves_documents(db):
    ctx = mk(db)
    assert call(ctx, "GET", "/api/state", origin=None).status == 401
    assert call(ctx, "PUT", "/api/state", {"base_version": 0}).status == 401
    ck = signup(ctx)
    body = {"base_version": 0, "reminder": {"time": "20:00", "last": None}}
    ok = call(ctx, "PUT", "/api/state", body, cookie=ck)
    assert ok.status == 200 and ok.body["state"]["version"] == 1
    assert call(ctx, "GET", "/api/state", cookie=ck, origin=None).body["state"]["reminder"]["time"] == "20:00"
    conflict = call(ctx, "PUT", "/api/state", body, cookie=ck)
    assert conflict.status == 409 and conflict.body["state"]["version"] == 1
    assert call(ctx, "PUT", "/api/state", {"base_version": 1, "diary": {"v": 1}}, cookie=ck).status == 400
    big = {"base_version": 1, "diary": {"v": 1, "entries": [], "taken": {}, "pad": "x" * 330_000}}
    assert call(ctx, "PUT", "/api/state", big, cookie=ck).status == 413


def test_two_users_are_isolated_and_account_delete_needs_password(db):
    ctx = mk(db)
    a, b = signup(ctx, "user-a"), signup(ctx, "user-b")
    call(ctx, "PUT", "/api/state", {"base_version": 0, "reminder": {"time": "07:00", "last": None}}, cookie=a)
    assert call(ctx, "GET", "/api/state", cookie=b, origin=None).body["state"]["reminder"] is None
    assert call(ctx, "DELETE", "/api/account", {"password": "wrong-password-1"}, cookie=a).status == 401
    ok = call(ctx, "DELETE", "/api/account", {"password": "correct-horse-battery"}, cookie=a)
    assert ok.status == 200 and "Max-Age=0" in ok.cookies[0]
    assert call(ctx, "GET", "/api/state", cookie=a, origin=None).status == 401
    assert call(ctx, "DELETE", "/api/account", {"password": "x"}).status == 401


def test_llm_endpoints_fall_back_without_key_and_use_runner_when_given(db, monkeypatch):
    for k in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    ctx = mk(db)
    b = call(ctx, "POST", "/api/brief", {"item_count": 2, "taken_count": 1, "untaken": ["ขิง"], "warnings": None, "no_entry_today": True})
    assert b.status == 200 and b.body["brief"]["source"] == "template"
    assert call(ctx, "POST", "/api/assistant", {"text": "เพิ่มขิงให้หน่อย", "items": [{"id": "a", "label": "ขิง"}]}).status == 503
    seen = []

    async def runner(fn):
        seen.append(1)
        return {"routed": True}
    r = call(mk(db, run_llm=runner), "POST", "/api/assistant", {"text": "x", "items": []})
    assert r.status == 200 and r.body == {"routed": True} and seen


def test_ask_uses_database_and_feedback_validates(db):
    ctx = mk(db)
    a = call(ctx, "POST", "/api/ask", {**KHING, "question": "ขิงกับยากันเลือดเป็นลิ่ม"})
    assert a.status == 200 and a.body["answer"]["source"] in ("database", "refusal", "emergency", "llm")
    assert call(ctx, "POST", "/api/feedback", {"session_id": "abc", "reviewer_role": "pharmacist", "entries": []}).status == 200
    assert call(ctx, "POST", "/api/feedback", {"session_id": "", "reviewer_role": "x"}).status == 400


# ---------- โหลดข้อมูลอ้างอิงจาก D1 ----------
def test_data_loader_503_before_seed_then_serves_from_d1_and_reloads_on_edit(db):
    router._loaded.update(version=None, checked=0.0)
    t = [0.0]
    ctx = mk(db, ensure_data=router.make_data_loader(db, lambda: t[0]))
    r = call(ctx, "POST", "/api/analyze", KHING)
    assert r.status == 503 and r.body["error"] == "data_not_ready"
    import conftest
    conftest.seed(db)
    ok = call(ctx, "POST", "/api/analyze", KHING)
    assert ok.status == 200 and ok.body == service.run(KHING)
    base = ok.body["result"]["flags"]
    # ผู้เชี่ยวชาญแก้เกณฑ์อายุใน D1 -> รอบตรวจถัดไป (หลังพ้นเวลาตรวจเวอร์ชัน) ใช้ค่าใหม่
    run(db.run("UPDATE config SET value='60' WHERE key='child_age_cutoff_years'"))
    t[0] += 1
    assert call(ctx, "GET", "/api/meta", origin=None).status == 200                     # ยังไม่พ้น 30 วินาที ใช้ของเดิม
    t[0] += router.RECHECK_SEC + 1
    call(ctx, "GET", "/api/meta", origin=None)
    assert service.CONFIG["child_age_cutoff_years"]["value"] == 60
    assert base is not None


# ---------- สะพาน LLM ----------
def gem(text):
    return json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}}]}).encode()


FACTS = {"item_count": 3, "taken_count": 1, "untaken": ["ขิง"], "warnings": {"total": 2, "avoid": 1}, "no_entry_today": True}


def brief_now():
    return llm.brief(FACTS, service.ALL, service.DRUGS, service.CONFIG)


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "m1,m2")


def test_bridge_replays_async_fetch_into_sync_engine(key):
    calls = []

    async def fetch(url, headers, body, timeout):
        calls.append((url, headers, timeout))
        return 200, gem(json.dumps({"summary_th": "วันนี้ใช้แล้ว 1 จาก 3 รายการ พบคำเตือน 2 รายการ"}))
    out = run(llm_bridge.run_with_llm(brief_now, fetch))
    assert out["source"] == "llm" and len(calls) == 1
    assert "m1" in calls[0][0] and calls[0][1].get("X-goog-api-key") == "test-key-123"
    assert llm._transport is None                                                          # คืนค่าตัวส่งเสมอ


def test_bridge_model_fallback_on_5xx_and_total_failure_uses_template(key):
    seq = []

    async def flaky(url, headers, body, timeout):
        seq.append(url)
        return (503, b'{"error":{"message":"busy"}}') if "m1" in url else (200, gem(json.dumps({"summary_th": "ใช้แล้ว 1 จาก 3 รายการ"})))
    out = run(llm_bridge.run_with_llm(brief_now, flaky))
    assert out["source"] == "llm" and len(seq) == 2 and "m1" in seq[0] and "m2" in seq[1]

    async def down(url, headers, body, timeout):
        raise OSError("network down")
    out = run(llm_bridge.run_with_llm(brief_now, down))
    assert out["source"] == "template" and out["summary_th"].startswith("วันนี้กดว่าใช้แล้ว 1 จาก 3")


def test_bridge_guardrails_still_apply_to_text_fetched_async(key):
    async def evil(url, headers, body, timeout):
        return 200, gem(json.dumps({"summary_th": "ทุกอย่างปลอดภัย ใช้แล้ว 9 จาก 3 รายการ"}))
    out = run(llm_bridge.run_with_llm(brief_now, evil))
    assert out["source"] == "template" and out["rejected_reason"]


def test_bridge_does_not_loop_forever_and_never_swallowed_by_engine(key):
    n = []

    async def always_5xx(url, headers, body, timeout):
        n.append(1)
        return 500, b"{}"
    out = run(llm_bridge.run_with_llm(brief_now, always_5xx))
    assert out["source"] == "template" and len(n) <= llm_bridge.MAX_FETCHES
