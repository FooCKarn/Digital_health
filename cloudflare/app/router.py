"""เส้นทาง /api/* ทั้งหมดของเว็บ (ฝั่ง Cloudflare Worker และเซิร์ฟเวอร์ท้องถิ่นใช้ตัวเดียวกัน) ไม่มีตรรกะกฎอยู่ที่นี่:
ตรวจคำขอ -> เรียก service (engine เดิม) หรือ auth/state -> ตอบ JSON
ความปลอดภัย: ตรวจ Origin = Host ทุกคำขอที่แก้ข้อมูล (กัน CSRF) + คุกกี้ HttpOnly SameSite=Lax, จำกัดขนาดตัว, ไม่ใส่ traceback/ความลับในคำตอบ
"""
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

import auth
import dataset
import service
import state
from policy import POLICY_VERSION

COOKIE = "hg_session"
SECURITY_HEADERS = {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
}
MAX_BODY = {"/api/state": 320 * 1024}
DEFAULT_MAX_BODY = 64 * 1024
LLM_ROUTES = {"/api/parse": "parse", "/api/explain": "explain", "/api/ask": "ask", "/api/brief": "brief", "/api/assistant": "assistant"}


@dataclass
class Request:
    method: str
    path: str
    headers: dict = field(default_factory=dict)   # คีย์ตัวพิมพ์เล็ก
    body: bytes = b""
    ip: str = "0.0.0.0"


@dataclass
class Response:
    status: int
    body: dict
    headers: dict = field(default_factory=dict)
    cookies: list = field(default_factory=list)   # สตริง Set-Cookie


@dataclass
class Ctx:
    db: object
    crypto: object
    now: object = lambda: datetime.now(timezone.utc)      # noqa: E731
    secure_cookie: bool = True
    run_llm: object = None                                # async (fn) -> ผลลัพธ์; ไม่ตั้ง = เรียกตรง (urllib)
    ensure_data: object = None                            # async () -> None โหลดข้อมูลอ้างอิงจาก D1 (ไม่ตั้ง = ใช้ข้อมูลที่ service โหลดจากไฟล์)


def _json(req: Request):
    try:
        data = json.loads(req.body.decode("utf-8") or "null")
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError("ข้อมูลไม่ใช่ JSON ที่ถูกต้อง") from e
    return data


def _cookie(req: Request, name: str):
    for part in req.headers.get("cookie", "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == name:
            return v
    return None


def _set_cookie(ctx: Ctx, token: str, expires: datetime | None) -> str:
    base = f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax" + ("; Secure" if ctx.secure_cookie else "")
    if expires is None:
        return base + "; Max-Age=0"
    return base + f"; Expires={expires.astimezone(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')}"


def _origin_ok(req: Request) -> bool:
    o, host = req.headers.get("origin"), req.headers.get("host")
    return bool(o and host and urlparse(o).netloc == host)


async def handle(req: Request, ctx: Ctx) -> Response:
    try:
        r = await _dispatch(req, ctx)
    except ValueError as e:                               # รวม JSONDecodeError และข้อความตรวจ input ของ service
        r = Response(400, {"error": str(e)})
    except (auth.AuthError, state.StateError) as e:
        r = Response(e.status, {"error": str(e), **getattr(e, "extra", {})})
    except DataNotReady as e:
        r = Response(503, {"error": "data_not_ready", "message": str(e)})
    except Exception as e:  # noqa: BLE001
        if type(e).__name__ == "ServiceUnavailable":      # ฟีเจอร์ LLM ใช้ไม่ได้ ไม่ใช่บั๊ก
            r = Response(503, {"error": "llm_unavailable", "message": str(e)})
        else:
            r = Response(500, {"error": "server_error", "detail": type(e).__name__})  # ไม่ส่งข้อความ/traceback ออกไป (อาจมีข้อมูลผู้ใช้)
    r.headers = {**SECURITY_HEADERS, **r.headers}
    return r


async def _user(req: Request, ctx: Ctx):
    return await auth.session_user(ctx.db, ctx.crypto, _cookie(req, COOKIE), ctx.now())


async def _dispatch(req: Request, ctx: Ctx) -> Response:
    path, method = req.path.rstrip("/") or "/", req.method.upper()
    if not path.startswith("/api/"):
        return Response(404, {"error": "not_found"})
    if method not in ("GET", "POST", "PUT", "DELETE"):
        return Response(405, {"error": "method_not_allowed"})
    if method != "GET":
        if not _origin_ok(req):
            return Response(403, {"error": "forbidden_origin"})
        if len(req.body) > MAX_BODY.get(path, DEFAULT_MAX_BODY):
            return Response(413, {"error": "ข้อมูลใหญ่เกินไป"})
        if method != "DELETE" or req.body:
            if "application/json" not in req.headers.get("content-type", ""):
                return Response(415, {"error": "ต้องส่งเป็น JSON"})

    # ---- ข้อมูลอ้างอิง/ตัวตรวจ (ไม่ต้องล็อกอิน) ----
    if path == "/api/meta" and method == "GET":
        await _ready(ctx)
        return Response(200, {**service.meta(), "policy_version": POLICY_VERSION})
    if path == "/api/analyze" and method == "POST":
        await _ready(ctx)
        return Response(200, service.run(_json(req)))
    if path in LLM_ROUTES and method == "POST":
        await _ready(ctx)
        fn, payload = getattr(service, LLM_ROUTES[path]), _json(req)
        return Response(200, await (ctx.run_llm(lambda: fn(payload)) if ctx.run_llm else _direct(lambda: fn(payload))))
    if path == "/api/feedback" and method == "POST":
        return Response(200, service.feedback(_json(req)))

    # ---- บัญชีผู้ใช้ ----
    if path == "/api/auth/register" and method == "POST":
        b = _json(req) or {}
        res = await auth.register(ctx.db, ctx.crypto, b.get("handle"), b.get("password"), b.get("consent_policy"), ctx.now())
        return Response(200, {"user": {"handle": res["user"]["handle"]}}, cookies=[_set_cookie(ctx, res["token"], res["expires"])])
    if path == "/api/auth/login" and method == "POST":
        b = _json(req) or {}
        res = await auth.login(ctx.db, ctx.crypto, b.get("handle"), b.get("password"), req.ip, ctx.now())
        return Response(200, {"user": {"handle": res["user"]["handle"]}}, cookies=[_set_cookie(ctx, res["token"], res["expires"])])
    if path == "/api/auth/logout" and method == "POST":
        await auth.logout(ctx.db, ctx.crypto, _cookie(req, COOKIE))
        return Response(200, {"ok": True}, cookies=[_set_cookie(ctx, "", None)])
    if path == "/api/auth/me" and method == "GET":
        u = await _user(req, ctx)
        return Response(200, {"user": {"handle": u["handle"]} if u else None, "policy_version": POLICY_VERSION})
    if path == "/api/account" and method == "DELETE":
        u = await _user(req, ctx)
        if not u:
            return Response(401, {"error": "ยังไม่ได้เข้าสู่ระบบ"})
        await auth.delete_account(ctx.db, ctx.crypto, u["id"], (_json(req) or {}).get("password"))
        return Response(200, {"ok": True}, cookies=[_set_cookie(ctx, "", None)])

    # ---- ข้อมูลที่ซิงก์ ----
    if path == "/api/state" and method in ("GET", "PUT"):
        u = await _user(req, ctx)
        if not u:
            return Response(401, {"error": "ยังไม่ได้เข้าสู่ระบบ"})
        if method == "GET":
            return Response(200, {"state": await state.get_state(ctx.db, u["id"])})
        return Response(200, {"state": await state.put_state(ctx.db, u["id"], _json(req), ctx.now())})

    return Response(404, {"error": "not_found"})


async def _direct(fn):
    return fn()


async def _ready(ctx: Ctx) -> None:
    if ctx.ensure_data:
        await ctx.ensure_data()


# ---- โหลดข้อมูลอ้างอิงจาก D1 (Worker) : ตรวจเวอร์ชันไม่ถี่เกินไป โหลดใหม่เมื่อเปลี่ยน ----
_loaded = {"version": None, "checked": 0.0}
RECHECK_SEC = 30.0


class DataNotReady(Exception):
    pass


def make_data_loader(db, clock):
    """คืนฟังก์ชัน async สำหรับ Ctx.ensure_data; clock() คืนวินาที (เช่น time.monotonic)"""
    async def ensure():
        t = clock()
        if _loaded["version"] is not None and t - _loaded["checked"] < RECHECK_SEC:
            return
        row = await db.first("SELECT value FROM ref_meta WHERE key = 'data_version'")
        ver = row["value"] if row else None
        if ver in (None, "empty"):
            raise DataNotReady("ฐานข้อมูลอ้างอิงยังไม่ได้นำเข้า (seed)")
        if ver != _loaded["version"]:
            rows = {name: await db.all(sql) for name, sql in dataset.SELECTS.items()}
            d, _ = dataset.decode_datasets(rows)
            service.configure(d)
            _loaded["version"] = ver
        _loaded["checked"] = t
    return ensure
