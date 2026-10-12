"""บัญชีผู้ใช้แบบเรียบง่าย: ชื่อผู้ใช้ + รหัสผ่าน (ไม่เก็บอีเมล/เบอร์โทร จึงกู้รหัสผ่านให้ไม่ได้ ข้อความนี้บอกผู้ใช้ตอนสมัคร)
- ความยินยอม: ต้องส่ง consent_policy ตรงกับเวอร์ชันนโยบายปัจจุบัน เก็บเวอร์ชัน+เวลาไว้กับบัญชี
- เซสชัน: โทเค็นสุ่มในคุกกี้ HttpOnly เก็บเฉพาะแฮช SHA-256 ในฐานข้อมูล หมดอายุ 30 วัน
- กันเดารหัสผ่าน: ผิด 5 ครั้งใน 15 นาที (ต่อชื่อผู้ใช้+IP) ล็อก 15 นาที ข้อความผิดพลาดไม่บอกว่าชื่อผู้ใช้มีอยู่หรือไม่
"""
import base64
import re
from datetime import datetime, timedelta, timezone

from crypto import PBKDF2_ITER
from policy import POLICY_VERSION

HANDLE_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,31}$")
MIN_PW, MAX_PW = 10, 128
SESSION_DAYS = 30
MAX_FAILS, WINDOW_MIN, LOCK_MIN = 5, 15, 15
BAD_LOGIN = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"


class AuthError(Exception):
    """ข้อความไทยสำหรับผู้ใช้ + รหัส HTTP"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _check_handle(handle) -> str:
    if not isinstance(handle, str) or not HANDLE_RE.match(handle.strip().lower()):
        raise AuthError("ชื่อผู้ใช้ต้องยาว 3-32 ตัว ใช้ a-z 0-9 และ _ . - เท่านั้น ขึ้นต้นด้วยตัวอักษรหรือตัวเลข")
    return handle.strip().lower()


def _check_password(pw) -> str:
    if not isinstance(pw, str) or not MIN_PW <= len(pw) <= MAX_PW:
        raise AuthError(f"รหัสผ่านต้องยาว {MIN_PW}-{MAX_PW} ตัวอักษร")
    return pw


def new_token(crypto) -> str:
    return base64.urlsafe_b64encode(crypto.random_bytes(32)).decode().rstrip("=")


async def _make_session(db, crypto, user_id: str, now: datetime) -> tuple[str, datetime]:
    token = new_token(crypto)
    exp = now + timedelta(days=SESSION_DAYS)
    await db.run("INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
                 (crypto.sha256_hex(token), user_id, _iso(now), _iso(exp)))
    return token, exp


async def register(db, crypto, handle, password, consent_policy, now: datetime) -> dict:
    h, pw = _check_handle(handle), _check_password(password)
    if consent_policy != POLICY_VERSION:
        raise AuthError("ต้องอ่านและยอมรับนโยบายความเป็นส่วนตัวฉบับปัจจุบันก่อนสมัคร")
    if await db.first("SELECT 1 AS x FROM users WHERE handle = ?", (h,)):
        raise AuthError("ชื่อผู้ใช้นี้ถูกใช้แล้ว", 409)
    uid = crypto.random_bytes(16).hex()
    salt = crypto.random_bytes(16)
    pwh = (await crypto.pbkdf2(pw, salt, PBKDF2_ITER)).hex()
    await db.run("INSERT INTO users(id, handle, pw_hash, pw_salt, pw_iter, created_at, consent_policy, consent_at) VALUES (?,?,?,?,?,?,?,?)",
                 (uid, h, pwh, salt.hex(), PBKDF2_ITER, _iso(now), POLICY_VERSION, _iso(now)))
    token, exp = await _make_session(db, crypto, uid, now)
    return {"user": {"id": uid, "handle": h}, "token": token, "expires": exp}


async def login(db, crypto, handle, password, ip: str, now: datetime) -> dict:
    if not isinstance(handle, str) or not isinstance(password, str) or len(handle) > 64 or len(password) > MAX_PW:
        raise AuthError(BAD_LOGIN, 401)
    h = handle.strip().lower()
    key = crypto.sha256_hex(f"{h}|{ip}")
    att = await db.first("SELECT fails, first_at, locked_until FROM login_attempts WHERE key = ?", (key,))
    if att and att["locked_until"] and att["locked_until"] > _iso(now):
        raise AuthError("ลองผิดหลายครั้ง ถูกล็อกชั่วคราว ลองใหม่ภายหลัง 15 นาที", 429)
    row = await db.first("SELECT id, handle, pw_hash, pw_salt, pw_iter FROM users WHERE handle = ?", (h,))
    # ผู้ใช้ไม่มีอยู่ก็คำนวณแฮชเท่ากัน กันเดาชื่อผู้ใช้จากเวลาตอบ
    salt = bytes.fromhex(row["pw_salt"]) if row else b"\0" * 16
    got = (await crypto.pbkdf2(password, salt, row["pw_iter"] if row else PBKDF2_ITER)).hex()
    if not row or not crypto.equal(got, row["pw_hash"]):
        window_start = _iso(now - timedelta(minutes=WINDOW_MIN))
        fails = (att["fails"] + 1) if att and att["first_at"] >= window_start else 1
        first_at = att["first_at"] if att and att["first_at"] >= window_start else _iso(now)
        locked = _iso(now + timedelta(minutes=LOCK_MIN)) if fails >= MAX_FAILS else None
        await db.run("INSERT INTO login_attempts(key, fails, first_at, locked_until) VALUES (?,?,?,?) "
                     "ON CONFLICT(key) DO UPDATE SET fails=excluded.fails, first_at=excluded.first_at, locked_until=excluded.locked_until",
                     (key, fails, first_at, locked))
        raise AuthError(BAD_LOGIN, 401)
    await db.run("DELETE FROM login_attempts WHERE key = ?", (key,))
    await db.run("DELETE FROM sessions WHERE expires_at < ?", (_iso(now),))
    token, exp = await _make_session(db, crypto, row["id"], now)
    return {"user": {"id": row["id"], "handle": row["handle"]}, "token": token, "expires": exp}


async def session_user(db, crypto, token: str | None, now: datetime):
    """คืน {"id","handle"} หรือ None"""
    if not token or len(token) > 100:
        return None
    return await db.first(
        "SELECT u.id AS id, u.handle AS handle FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        (crypto.sha256_hex(token), _iso(now)))


async def logout(db, crypto, token: str | None) -> None:
    if token:
        await db.run("DELETE FROM sessions WHERE token_hash = ?", (crypto.sha256_hex(token),))


async def delete_account(db, crypto, user_id: str, password) -> None:
    """ลบบัญชีและข้อมูลทุกแถวของผู้ใช้ (ON DELETE CASCADE) ต้องยืนยันรหัสผ่านอีกครั้ง"""
    row = await db.first("SELECT pw_hash, pw_salt, pw_iter FROM users WHERE id = ?", (user_id,))
    if not row or not isinstance(password, str) or len(password) > MAX_PW:
        raise AuthError("รหัสผ่านไม่ถูกต้อง", 401)
    got = (await crypto.pbkdf2(password, bytes.fromhex(row["pw_salt"]), row["pw_iter"])).hex()
    if not crypto.equal(got, row["pw_hash"]):
        raise AuthError("รหัสผ่านไม่ถูกต้อง", 401)
    await db.run("DELETE FROM users WHERE id = ?", (user_id,))
