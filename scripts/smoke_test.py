"""ตรวจหลังขึ้นระบบ (smoke test): ยิงคำขอจริงไปที่เว็บที่ deploy แล้วดูว่าทุกส่วนทำงาน
ใช้: python scripts/smoke_test.py https://herbguard-ttm.<บัญชี>.workers.dev        (หรือ http://localhost:8787 / :8000)
ใช้ stdlib อย่างเดียว ไม่ต้องติดตั้งอะไร; สมัครบัญชีทดสอบชื่อสุ่ม (ข้อมูลสมมติ) แล้ว ลบบัญชีทิ้งท้ายเสมอ
ผ่านหมด = exit 0, มีข้อใดไม่ผ่าน = exit 1 (พิมพ์ข้อที่ไม่ผ่าน)
"""
import http.cookiejar
import json
import secrets
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

PW = "smoke-" + secrets.token_hex(8)


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.origin = f"{urlparse(self.base).scheme}://{urlparse(self.base).netloc}"
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, origin=True):
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if origin and method != "GET":
            req.add_header("Origin", self.origin)
        try:
            with self.op.open(req, timeout=60) as r:
                raw, status, headers = r.read(), r.status, r.headers
        except urllib.error.HTTPError as e:
            raw, status, headers = e.read(), e.code, e.headers
        try:
            return status, json.loads(raw), headers
        except ValueError:
            return status, {"_raw": raw[:300].decode("utf-8", "replace")}, headers

    def cookie(self, name):
        return next((c for c in self.jar if c.name == name), None)


def main(base):
    fails = []

    def check(name, ok, detail=""):
        print(("ผ่าน  " if ok else "ไม่ผ่าน") + f"  {name}" + (f"  [{detail}]" if detail and not ok else ""))
        if not ok:
            fails.append(name)

    c = Client(base)
    s, d, h = c.call("GET", "/api/meta")
    check("meta: 200 และมีสมุนไพร 21 ชนิด", s == 200 and d.get("coverage", {}).get("herbs_in_db") == 21, f"{s} {str(d)[:120]}")
    check("meta: header ความปลอดภัย (no-store, nosniff, noindex)", h.get("Cache-Control") == "no-store" and h.get("X-Content-Type-Options") == "nosniff" and "noindex" in (h.get("X-Robots-Tag") or ""))
    policy = d.get("policy_version")
    check("meta: มีเวอร์ชันนโยบาย (เซิร์ฟเวอร์รุ่นที่มีระบบบัญชี)", isinstance(policy, str) and policy)

    inp = {"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}}
    s, d, _ = c.call("POST", "/api/analyze", inp)
    flags = d.get("result", {}).get("flags", [])
    check("analyze: ขิง + warfarin ต้องมีคำเตือน R2 ระดับ avoid (ตรงเคส golden G01)", s == 200 and any(f["rule_id"] == "R2" and f["severity"] == "avoid" for f in flags), f"{s} {str(d)[:120]}")
    s, d, _ = c.call("POST", "/api/analyze", {"herbs": [{"id": "khing"}], "drugs": [], "profile": {"age": 30}})
    check("analyze: ขิงอย่างเดียว ไม่มีคำเตือน R2 กับยา", s == 200 and not any(f["rule_id"] == "R2" for f in d.get("result", {}).get("flags", [])), f"{s}")
    check("analyze: ข้อมูลผิด = 400 ข้อความไทย", c.call("POST", "/api/analyze", {"herbs": "x"})[0] == 400)
    check("analyze: Origin ไม่ตรง = 403", c.call("POST", "/api/analyze", inp, origin=False)[0] == 403)

    s, d, _ = c.call("POST", "/api/ask", {**inp, "question": "ขิงห้ามกินกับอะไร"})
    ids = [x["item_id"] for x in d.get("answer", {}).get("cites", [])]
    check("ask: ตอบจากฐานข้อมูลและอ้างข้อห้ามกับยาต้านการแข็งตัวของเลือด", s == 200 and any("drug_cautions" in i for i in ids), f"{s} {ids}")
    s, d, _ = c.call("POST", "/api/ask", {**inp, "question": "สมุนไพรอะไรดีต่อตับบ้าง"})
    check("ask: คำถามนอกฐานข้อมูล = ปฏิเสธตายตัว ไม่เดา", s == 200 and d.get("answer", {}).get("source") == "refusal", f"{s}")
    s, d, _ = c.call("POST", "/api/brief", {"item_count": 2, "taken_count": 1, "untaken": ["ขิง"], "warnings": None, "no_entry_today": True})
    check("brief: ตอบได้ (AI หรือข้อความสำรอง)", s == 200 and d.get("brief", {}).get("source") in ("llm", "template"), f"{s}")
    s, d, _ = c.call("POST", "/api/assistant", {"text": "สรุปวันนี้", "items": []})
    print(f"ข้อมูล  assistant: HTTP {s} ({'AI พร้อม' if s == 200 else 'ยังไม่ได้ตั้ง API key หรือ AI ล่ม: ระบบตกไปใช้ข้อความสำรอง ไม่ถือว่าไม่ผ่าน'})")

    handle = "smoke-" + secrets.token_hex(4)
    s, d, _ = c.call("POST", "/api/auth/register", {"handle": handle, "password": PW, "consent_policy": "ไม่ตรงเวอร์ชัน"})
    check("register: ไม่ยอมรับนโยบายฉบับปัจจุบัน = ปฏิเสธ", s == 400, f"{s}")
    s, d, h = c.call("POST", "/api/auth/register", {"handle": handle, "password": PW, "consent_policy": policy})
    sc = h.get_all("Set-Cookie") or []
    check("register: 200 และคุกกี้ HttpOnly SameSite", s == 200 and any("HttpOnly" in x and "SameSite" in x for x in sc), f"{s} {str(d)[:120]}")
    base_https = c.origin.startswith("https://")
    check("register: คุกกี้ Secure เมื่อใช้ https", (not base_https) or any("Secure" in x for x in sc))
    s, d, _ = c.call("GET", "/api/auth/me")
    check("me: จำได้ว่าเป็นใคร", s == 200 and (d.get("user") or {}).get("handle") == handle, f"{s} {d}")
    s, d, _ = c.call("PUT", "/api/state", {"base_version": 0, "reminder": {"time": "20:00", "last": None}})
    check("state: บันทึกครั้งแรก (เวอร์ชัน 1)", s == 200 and d.get("state", {}).get("version") == 1, f"{s} {str(d)[:140]}")
    s, d, _ = c.call("PUT", "/api/state", {"base_version": 0, "reminder": {"time": "21:00", "last": None}})
    check("state: เขียนทับด้วยเวอร์ชันเก่า = 409 พร้อมข้อมูลล่าสุด", s == 409 and d.get("state", {}).get("reminder", {}).get("time") == "20:00", f"{s}")
    s, d, _ = c.call("GET", "/api/state")
    check("state: อ่านกลับได้ตรงที่เขียน", s == 200 and d.get("state", {}).get("reminder", {}).get("time") == "20:00", f"{s}")

    other = Client(base)                                                    # คนละเซสชัน ต้องไม่เห็นข้อมูลของเรา
    check("state: ไม่ได้ล็อกอิน = 401", other.call("GET", "/api/state")[0] == 401)
    check("login: รหัสผ่านผิด = 401", other.call("POST", "/api/auth/login", {"handle": handle, "password": "wrong-password-0"})[0] == 401)
    s, d, _ = other.call("POST", "/api/auth/login", {"handle": handle, "password": PW})
    check("login: รหัสผ่านถูก = 200", s == 200, f"{s}")
    check("account: ลบด้วยรหัสผ่านผิด = 401", c.call("DELETE", "/api/account", {"password": "wrong-password-0"})[0] == 401)
    s, d, _ = c.call("DELETE", "/api/account", {"password": PW})
    check("account: ลบบัญชี = 200 (ล้างข้อมูลทดสอบ)", s == 200, f"{s}")
    check("account: หลังลบ เข้าสู่ระบบด้วยบัญชีเดิมไม่ได้", other.call("POST", "/api/auth/login", {"handle": handle, "password": PW})[0] == 401)

    print(f"\n{'ผ่านทั้งหมด' if not fails else 'ไม่ผ่าน ' + str(len(fails)) + ' ข้อ: ' + '; '.join(fails)}")
    return 1 if fails else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
