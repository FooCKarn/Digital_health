"""Cloudflare Python Worker: ตัวเชื่อมบาง ๆ ระหว่าง Workers runtime กับ app/router.py (ตรรกะทั้งหมดอยู่ใน app/ และ engine/ ที่ทดสอบในเครื่องแล้ว)
ไฟล์นี้ถูกคัดลอกเป็น cloudflare/build/worker.py พร้อม engine/*.py และ app/*.py (scripts/build_worker.py)
Python Workers ยังเป็นเบต้า: ต้องทดสอบด้วย `wrangler dev` / `wrangler deploy` ก่อนใช้จริง (ดู cloudflare/README.md)
"""
import json
import os
import time

from js import AbortSignal, Headers, JSON, Object, Uint8Array, TextEncoder, crypto, fetch as js_fetch
from js import Response as JsResponse
from pyodide.ffi import to_js
from workers import WorkerEntrypoint

import hashlib
import hmac

import llm_bridge
import router

SECRETS = ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER", "GEMINI_MODEL", "HERBGUARD_MODEL", "HERBGUARD_CHAT_LLM",
           "GEMINI_THINKING_BUDGET", "GEMINI_THINKING_LEVEL", "LLM_TIMEOUT_SEC")
MAX_RAW_BODY = 400 * 1024
HEADERS_USED = ("host", "origin", "cookie", "content-type", "cf-connecting-ip")


def _obj(d):
    return to_js(d, dict_converter=Object.fromEntries)


class WebCrypto:
    """PBKDF2 ผ่าน WebCrypto (เร็วและเป็นของ runtime) ส่วนแฮช SHA-256 ใช้ hashlib"""

    async def pbkdf2(self, password: str, salt: bytes, iterations: int) -> bytes:
        key = await crypto.subtle.importKey("raw", TextEncoder.new().encode(password), "PBKDF2", False, to_js(["deriveBits"]))
        params = _obj({"name": "PBKDF2", "hash": "SHA-256", "salt": to_js(salt), "iterations": iterations})
        bits = await crypto.subtle.deriveBits(params, key, 256)
        return bytes(Uint8Array.new(bits).to_py())

    def random_bytes(self, n: int) -> bytes:
        arr = Uint8Array.new(n)
        crypto.getRandomValues(arr)
        return bytes(arr.to_py())

    def sha256_hex(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def equal(self, a: str, b: str) -> bool:
        return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


class D1Db:
    """ตัวห่อ D1 ให้ตรงกับอินเทอร์เฟซใน app/db.py (all/first/run/batch)"""

    def __init__(self, d1):
        self.d1 = d1

    def _stmt(self, sql, params):
        # Python None -> JS undefined ซึ่ง D1 ไม่รับ: สร้างอาร์เรย์ผ่าน JSON.parse เพื่อให้ได้ null จริง (ไม่พึ่ง pyodide.ffi.jsnull ที่รุ่นเก่าไม่มี)
        # แล้วเรียก stmt.bind.apply(stmt, arr) ให้ส่งอาร์เรย์เข้าไปตรง ๆ ไม่ถูกแปลงกลับเป็น Python
        stmt = self.d1.prepare(sql)
        return stmt.bind.apply(stmt, JSON.parse(json.dumps(list(params))))

    async def all(self, sql, params=()):
        res = await self._stmt(sql, params).all()
        return res.results.to_py()

    async def first(self, sql, params=()):
        r = await self._stmt(sql, params).first()
        return None if r is None else r.to_py()

    async def run(self, sql, params=()):
        res = await self._stmt(sql, params).run()
        return int(res.meta.changes)

    async def batch(self, stmts):
        await self.d1.batch(to_js([self._stmt(sql, p) for sql, p in stmts]))


async def llm_fetch(url, headers, body, timeout):
    init = _obj({"method": "POST", "headers": _obj(headers), "body": body.decode("utf-8"), "signal": AbortSignal.timeout(int(timeout * 1000))})
    resp = await js_fetch(url, init)
    return int(resp.status), (await resp.text()).encode("utf-8")


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        for k in SECRETS:
            v = getattr(self.env, k, None)
            if v:
                os.environ[k] = str(v)
        if int(request.headers.get("content-length") or 0) > MAX_RAW_BODY:
            return self._reply(router.Response(413, {"error": "ข้อมูลใหญ่เกินไป"}))
        url_path = str(request.url).split("://", 1)[-1].split("/", 1)
        path = "/" + (url_path[1].split("?")[0] if len(url_path) > 1 else "")
        if not path.startswith("/api/"):
            return await self.env.ASSETS.fetch(request)       # run_worker_first = ["/api/*"] จึงปกติไม่มาถึงตรงนี้ เผื่อไว้
        body = (await request.text()).encode("utf-8") if request.method not in ("GET", "HEAD") else b""
        # อ่านเฉพาะ header ที่ router ใช้ ด้วย .get() (ไม่วนอ่านทั้งก้อน: ตัวห่อ headers ของ Python Workers วนอ่านด้วย Object.fromEntries ไม่ได้)
        hdrs = {}
        for name in HEADERS_USED:
            v = request.headers.get(name)
            if v is not None:
                hdrs[name] = str(v)
        d1 = getattr(self.env, "DB", None) or getattr(self.env, "herbguard", None)  # wrangler อาจตั้งชื่อ binding ให้เป็น herbguard
        if d1 is None:
            return self._reply(router.Response(500, {"error": "server_error", "detail": "D1 binding not found (expected DB)"}))
        db = D1Db(d1)
        ctx = router.Ctx(
            db=db, crypto=WebCrypto(), secure_cookie=True,
            ensure_data=router.make_data_loader(db, time.monotonic),
            run_llm=lambda fn: llm_bridge.run_with_llm(fn, llm_fetch),
        )
        resp = await router.handle(router.Request(request.method, path, hdrs, body, hdrs.get("cf-connecting-ip", "0.0.0.0")), ctx)
        return self._reply(resp)

    def _reply(self, resp):
        h = Headers.new()
        for k, v in resp.headers.items():
            h.append(k, v)
        for c in resp.cookies:
            h.append("Set-Cookie", c)
        return JsResponse.new(json.dumps(resp.body, ensure_ascii=False), _obj({"status": resp.status, "headers": h}))
