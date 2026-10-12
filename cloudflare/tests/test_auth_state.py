"""บัญชีผู้ใช้และข้อมูลที่ซิงก์: ทุกกติกามีเคสที่ผ่านและเคสที่ถูกปฏิเสธ"""
from datetime import datetime, timedelta, timezone

import pytest

import auth
import state
from crypto import PyCrypto
from conftest import run
from policy import POLICY_VERSION

T0 = datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc)
C = PyCrypto()
PW = "correct-horse-battery"


def reg(db, handle="somchai", pw=PW, consent=POLICY_VERSION, now=T0):
    return run(auth.register(db, C, handle, pw, consent, now))


def test_register_login_session_and_logout(db):
    r = reg(db)
    assert r["user"]["handle"] == "somchai" and len(r["token"]) >= 40
    u = run(auth.session_user(db, C, r["token"], T0))
    assert u["handle"] == "somchai"
    stored = run(db.first("SELECT * FROM users"))
    assert stored["pw_hash"] != PW and stored["consent_policy"] == POLICY_VERSION and stored["pw_iter"] == 100_000
    assert run(db.first("SELECT token_hash FROM sessions"))["token_hash"] != r["token"]      # เก็บแฮช ไม่เก็บโทเค็น
    l = run(auth.login(db, C, "SOMCHAI", PW, "1.1.1.1", T0))                                  # ชื่อผู้ใช้ไม่สนตัวพิมพ์
    assert run(auth.session_user(db, C, l["token"], T0)) is not None
    run(auth.logout(db, C, l["token"]))
    assert run(auth.session_user(db, C, l["token"], T0)) is None


@pytest.mark.parametrize("handle,pw,consent,msg", [
    ("ab", PW, POLICY_VERSION, "ชื่อผู้ใช้"), ("ชื่อไทย", PW, POLICY_VERSION, "ชื่อผู้ใช้"), ("a b c", PW, POLICY_VERSION, "ชื่อผู้ใช้"),
    ("somchai", "short", POLICY_VERSION, "รหัสผ่าน"), ("somchai", "x" * 129, POLICY_VERSION, "รหัสผ่าน"),
    ("somchai", PW, "นโยบายเก่า", "ยอมรับนโยบาย"), ("somchai", PW, None, "ยอมรับนโยบาย"), (123, PW, POLICY_VERSION, "ชื่อผู้ใช้"),
])
def test_register_rejects_bad_input_and_missing_consent(db, handle, pw, consent, msg):
    with pytest.raises(auth.AuthError, match=msg):
        reg(db, handle, pw, consent)
    assert run(db.first("SELECT COUNT(*) AS n FROM users"))["n"] == 0


def test_duplicate_handle_conflicts_case_insensitively(db):
    reg(db, "Somchai")
    with pytest.raises(auth.AuthError) as e:
        reg(db, "somchai")
    assert e.value.status == 409


def test_wrong_password_and_unknown_user_same_message_then_lockout(db):
    reg(db)
    for _ in range(auth.MAX_FAILS):
        with pytest.raises(auth.AuthError) as e:
            run(auth.login(db, C, "somchai", "wrong-password-1", "9.9.9.9", T0))
        assert str(e.value) == auth.BAD_LOGIN and e.value.status == 401
    with pytest.raises(auth.AuthError) as e:
        run(auth.login(db, C, "somchai", PW, "9.9.9.9", T0 + timedelta(minutes=1)))            # รหัสถูกก็ยังถูกล็อก
    assert e.value.status == 429
    ok = run(auth.login(db, C, "somchai", PW, "9.9.9.9", T0 + timedelta(minutes=auth.LOCK_MIN + 1)))  # พ้นเวลาล็อกแล้วเข้าได้
    assert ok["user"]["handle"] == "somchai"
    with pytest.raises(auth.AuthError) as e2:
        run(auth.login(db, C, "nobody", "whatever-pass-1", "9.9.9.9", T0))
    assert str(e2.value) == auth.BAD_LOGIN
    run(auth.login(db, C, "somchai", PW, "8.8.8.8", T0))                                       # IP อื่นไม่ถูกล็อกตามกัน


def test_expired_session_is_rejected_and_cleaned_on_login(db):
    r = reg(db)
    later = T0 + timedelta(days=auth.SESSION_DAYS, seconds=1)
    assert run(auth.session_user(db, C, r["token"], later)) is None
    run(auth.login(db, C, "somchai", PW, "1.1.1.1", later))
    assert run(db.first("SELECT COUNT(*) AS n FROM sessions"))["n"] == 1


def test_delete_account_needs_password_and_removes_everything(db):
    r = reg(db)
    uid = r["user"]["id"]
    run(state.put_state(db, uid, {"base_version": 0, "reminder": {"time": "20:00", "last": None}}, T0))
    with pytest.raises(auth.AuthError):
        run(auth.delete_account(db, C, uid, "wrong-password-1"))
    assert run(db.first("SELECT COUNT(*) AS n FROM users"))["n"] == 1
    run(auth.delete_account(db, C, uid, PW))
    for t in ("users", "sessions", "user_state"):
        assert run(db.first(f"SELECT COUNT(*) AS n FROM {t}"))["n"] == 0
    assert run(auth.session_user(db, C, r["token"], T0)) is None


# ---------- state ----------
TRACKER = {"v": 1, "items": [{"id": "a", "kind": "herb", "ref": "khing", "label": "ขิง", "start_date": "2026-10-01", "end_date": None}],
           "profile": {"age": 60, "pregnant": None, "breastfeeding": None, "conditions": ["htn"]}}
DIARY = {"v": 1, "entries": [{"id": "d2026-10-11", "date": "2026-10-11", "mood": 4, "symptom": None, "sys": 120, "dia": 80, "glucose": None, "weight": 60}],
         "taken": {"a": ["2026-10-11"]}, "dose": {"a": "1 แคปซูล"}}


def test_state_roundtrip_and_versions(db):
    uid = reg(db)["user"]["id"]
    assert run(state.get_state(db, uid))["version"] == 0
    s1 = run(state.put_state(db, uid, {"base_version": 0, "tracker": TRACKER, "diary": DIARY}, T0))
    assert s1["version"] == 1 and s1["tracker"] == TRACKER and s1["diary"] == DIARY and s1["reminder"] is None
    s2 = run(state.put_state(db, uid, {"base_version": 1, "reminder": {"time": "08:00", "last": None}}, T0))
    assert s2["version"] == 2 and s2["tracker"] == TRACKER and s2["reminder"]["time"] == "08:00"   # ส่งเฉพาะเอกสารที่แก้ ที่เหลือคงเดิม


def test_state_conflict_returns_latest_and_changes_nothing(db):
    uid = reg(db)["user"]["id"]
    run(state.put_state(db, uid, {"base_version": 0, "tracker": TRACKER}, T0))
    for base in (0, 5):
        with pytest.raises(state.StateError) as e:
            run(state.put_state(db, uid, {"base_version": base, "diary": DIARY}, T0))
        assert e.value.status == 409 and e.value.extra["state"]["version"] == 1 and e.value.extra["state"]["diary"] is None


def test_users_cannot_see_each_others_state(db):
    a, b = reg(db, "user-a")["user"]["id"], reg(db, "user-b")["user"]["id"]
    run(state.put_state(db, a, {"base_version": 0, "tracker": TRACKER}, T0))
    assert run(state.get_state(db, b))["tracker"] is None


@pytest.mark.parametrize("doc,payload", [
    ("tracker", {"v": 2, "items": [], "profile": {}}),
    ("tracker", {**TRACKER, "items": [{**TRACKER["items"][0], "kind": "evil"}]}),
    ("tracker", {**TRACKER, "items": [{**TRACKER["items"][0], "start_date": "ไม่ใช่วันที่"}]}),
    ("tracker", {**TRACKER, "profile": {"age": 999}}),
    ("tracker", {**TRACKER, "profile": {"age": 30, "pregnant": True}}),
    ("diary", {**DIARY, "entries": [{**DIARY["entries"][0], "mood": 9}]}),
    ("diary", {**DIARY, "entries": [{**DIARY["entries"][0], "weight": 9999}]}),
    ("diary", {**DIARY, "entries": [DIARY["entries"][0], DIARY["entries"][0]]}),
    ("diary", {**DIARY, "taken": {"a": ["x"]}}),
    ("diary", {**DIARY, "dose": {"a": "x" * 61}}),
    ("reminder", {"time": "25:00", "last": None}),
])
def test_state_rejects_malformed_documents(db, doc, payload):
    uid = reg(db)["user"]["id"]
    with pytest.raises(state.StateError):
        run(state.put_state(db, uid, {"base_version": 0, doc: payload}, T0))
    assert run(state.get_state(db, uid))["version"] == 0


def test_state_rejects_unknown_fields_missing_base_and_oversize(db):
    uid = reg(db)["user"]["id"]
    for bad in ({"tracker": TRACKER}, {"base_version": 0}, {"base_version": 0, "tracker": TRACKER, "hack": 1}, {"base_version": True, "tracker": TRACKER}):
        with pytest.raises(state.StateError):
            run(state.put_state(db, uid, bad, T0))
    entries = [{"id": f"d{n}", "date": f"2025-{1 + n // 28:02d}-{1 + n % 28:02d}", "mood": 3, "symptom": "ก" * 200, "sys": None, "dia": None, "glucose": None, "weight": None} for n in range(400)]
    with pytest.raises(state.StateError, match="ใหญ่"):
        run(state.put_state(db, uid, {"base_version": 0, "diary": {"v": 1, "entries": entries, "taken": {}}}, T0))
