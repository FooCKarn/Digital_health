"""ตรวจ Gemini API จากเครื่องคุณ: โมเดลมีจริงไหม ช้าแค่ไหน (key อยู่ใน env ของเครื่องคุณ ไม่พิมพ์ออกจอ ไม่ส่งให้ใคร)

PowerShell:
  $env:GEMINI_API_KEY = "<key ของคุณ>"
  python scripts/llm_probe.py                 # ใช้ GEMINI_MODEL หรือ gemma-4-31b-it
  $env:GEMINI_MODEL = "gemma-4-31b-it,gemini-2.5-flash-lite"; python scripts/llm_probe.py   # เทียบหลายรุ่น คั่นด้วยจุลภาค
แล้วคัดลอกผลที่พิมพ์ออกมา (ไม่มี key ในผลลัพธ์) มาให้ผม
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))
import llm  # noqa: E402

KEY = os.environ.get("GEMINI_API_KEY")
MODEL = os.environ.get("GEMINI_MODEL", "gemma-4-31b-it")
if not KEY:
    sys.exit("ยังไม่ได้ตั้ง GEMINI_API_KEY ใน environment")


def get(url: str, timeout=30):
    req = urllib.request.Request(url, headers={"x-goog-api-key": KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


print(f"== 1) รายชื่อโมเดลที่บัญชีนี้เรียกได้ (กรอง gemma/flash) ==")
try:
    names, token = [], ""
    while True:
        d = get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" + (f"&pageToken={token}" if token else ""))
        names += d.get("models", [])
        token = d.get("nextPageToken", "")
        if not token:
            break
    for m in names:
        n = m["name"].removeprefix("models/")
        if "gemma" in n or "flash" in n:
            print(f"  {n:45} {','.join(m.get('supportedGenerationMethods', []))}")
    for model in [m.strip() for m in MODEL.split(",") if m.strip()]:
        mine = [m for m in names if m["name"] == "models/" + model]
        print(f"  -> '{model}' อยู่ในรายชื่อ: {bool(mine)}" + (f" | วิธีที่รองรับ: {mine[0].get('supportedGenerationMethods')} | thinking: {mine[0].get('thinking')}" if mine else ""))
except urllib.error.HTTPError as e:
    print(f"  ดึงรายชื่อไม่ได้: HTTP {e.code} (key ผิดหรือไม่มีสิทธิ์?)")
except Exception as e:  # noqa: BLE001
    print(f"  ดึงรายชื่อไม่ได้: {type(e).__name__}")


def timed(label, system, user, timeout):
    os.environ["LLM_TIMEOUT_SEC"] = str(timeout)
    t = time.time()
    try:
        out = llm.gemini_complete(system, user)
        print(f"  {label}: {time.time() - t:.1f}s OK  คำตอบ(ต้น): {out[:120]!r}")
        return out
    except llm.LLMUnavailable as e:
        print(f"  {label}: {time.time() - t:.1f}s ล้มเหลว: {e}" + (f"\n     ข้อความจาก Google: {e.detail}" if e.detail else ""))


herbs = json.loads((Path(__file__).resolve().parent.parent / "data" / "herbs.json").read_text(encoding="utf-8"))
for model in [m.strip() for m in MODEL.split(",") if m.strip()]:  # GEMINI_MODEL="a,b,c" เทียบหลายรุ่นในรอบเดียว
    os.environ["GEMINI_MODEL"] = model
    print(f"\n######## {model} ########")
    print("== 2) ข้อความสั้นมาก ==")
    timed("ตอบคำเดียว", "ตอบสั้นที่สุด", "พิมพ์คำว่า OK", 55)
    print("== 3) พรอมต์จริงของแอป (parse ข้อความอิสระ) ==")
    t = time.time()
    os.environ["LLM_TIMEOUT_SEC"] = "55"
    try:
        r = llm.parse_text("กินขิงมา 3 วัน กับยา warfarin", herbs)
        print(f"  parse: {time.time() - t:.1f}s OK  ผล: {r}")
    except Exception as e:  # noqa: BLE001
        print(f"  parse: {time.time() - t:.1f}s ล้มเหลว: {type(e).__name__}: {e}" + (f"\n     ข้อความจาก Google: {e.detail}" if getattr(e, "detail", None) else ""))
