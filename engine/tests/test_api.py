"""ทดสอบชั้นบริการ + endpoint จริงผ่านเซิร์ฟเวอร์ทดสอบ (ไม่ต้องมี Vercel)"""
import json
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "scripts"))
import service  # noqa: E402
from dev_server import make_server  # noqa: E402


# --- validate / run ---
def test_run_returns_result_and_summary():
    out = service.run({"herbs": [{"id": "khing", "part": "เหง้า"}], "drugs": ["warfarin"], "profile": {"age": 60}})
    assert out["result"]["flags"] and out["summary"]["headline_th"] and out["result"]["disclaimer_th"]


@pytest.mark.parametrize("bad", [
    None, [], {"herbs": []}, {"herbs": "x"}, {"herbs": [{"id": 1}]},
    {"herbs": [{"id": "khing"}], "drugs": [5]},
    {"herbs": [{"id": "khing"}], "drugs": ["x" * 101]},
    {"herbs": [{"id": "khing", "days_in_use": -1}]},
    {"herbs": [{"id": "khing"}], "profile": {"age": "60"}},
    {"herbs": [{"id": "khing"}], "profile": {"age": True}},
    {"herbs": [{"id": "khing"}], "profile": {"pregnant": "yes"}},
    {"herbs": [{"id": "khing"}], "profile": {"conditions": ["not_a_code"]}},
])
def test_validate_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        service.validate(bad)


def test_missing_age_is_not_defaulted():
    assert "age" not in service.validate({"herbs": [{"id": "khing"}]})["profile"]


def test_unknown_herb_id_reaches_engine_as_unknown_input():
    out = service.run({"herbs": [{"id": "unknown_x"}]})
    assert out["result"]["coverage"]["unknown_inputs"] == ["unknown_x"] and out["result"]["flags"] == []


# --- HTTP ---
@pytest.fixture(scope="module")
def base():
    srv = make_server(0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def call(url, body=None):
    req = urllib.request.Request(url, data=None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode()),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_http_meta_and_analyze(base):
    s, m = call(base + "/api/meta")
    n = len(json.loads((ROOT / "data" / "herbs.json").read_text(encoding="utf-8"))["herbs"])
    assert s == 200 and len(m["herbs"]) == n == m["coverage"]["herbs_in_db"] and m["coverage"]["herbs_in_book"] == 50
    s, out = call(base + "/api/analyze", {"herbs": [{"id": "garlic", "part": "หัว"}], "drugs": ["warfarin"], "profile": {"age": 65}})
    assert s == 200 and any(f["herb_id"] == "garlic" for f in out["result"]["flags"])


def test_http_bad_input_gets_400_not_500(base):
    assert call(base + "/api/analyze", {"herbs": []})[0] == 400
    assert call(base + "/api/analyze", b"{not json")[0] == 400


def test_http_parse_without_api_key_is_503_with_clear_message(base, monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    s, body = call(base + "/api/parse", {"text": "กินขิง"})
    assert s == 503 and body["error"] == "llm_unavailable" and "API key" in body["message"]


def test_http_parse_validates_text(base):
    assert call(base + "/api/parse", {"text": ""})[0] == 400
    assert call(base + "/api/parse", {"text": "x" * 1001})[0] == 400
    assert call(base + "/api/parse", {})[0] == 400


def test_http_explain_without_api_key_falls_back_to_template(base, monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    s, body = call(base + "/api/explain", {"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}})
    x = body["explanation"]
    assert s == 200 and x["source"] == "template" and x["items"] and x["disclaimer_th"]


GOOD_FB = {"session_id": "abc-123", "case_id": "เคส A", "reviewer_role": "pharmacist", "comment": "ข้อความชัดเจน",
           "entries": [{"flag_id": "f1", "agree": True}, {"flag_id": "f2", "agree": "unsure"}], "time_spent_sec": 42}


def test_feedback_accepts_valid_and_logs_one_json_line(capsys):
    assert service.feedback(GOOD_FB) == {"ok": True}
    line = [l for l in capsys.readouterr().out.splitlines() if l.startswith("FEEDBACK ")][0]
    assert json.loads(line[len("FEEDBACK "):])["session_id"] == "abc-123"


@pytest.mark.parametrize("patch", [
    {"session_id": ""}, {"reviewer_role": "admin"}, {"comment": "x" * 501}, {"time_spent_sec": -1},
    {"entries": [{"flag_id": "f1", "agree": "yes"}]}, {"entries": "no"}, {"case_id": "x" * 51},
])
def test_feedback_rejects_bad_input(patch):
    with pytest.raises(ValueError):
        service.feedback({**GOOD_FB, **patch})


def test_http_feedback_roundtrip(base):
    assert call(base + "/api/feedback", GOOD_FB) == (200, {"ok": True})
    assert call(base + "/api/feedback", {"session_id": "x"})[0] == 400


def test_http_internal_error_returns_json_500_with_cause(base, monkeypatch):
    def boom():
        raise FileNotFoundError("data/herbs.json")
    monkeypatch.setattr(service, "meta", boom)
    s, body = call(base + "/api/meta")
    assert s == 500 and body["error"] == "server_error" and "FileNotFoundError" in body["detail"]


def test_http_index_page_served(base):
    with urllib.request.urlopen(base + "/") as r:
        html = r.read().decode()
    assert "HerbGuard TTM" in html and "innerHTML" not in html  # ห้ามใช้ innerHTML กับข้อมูล (กัน XSS)


def test_index_page_seo_basics_and_noindex_until_verified():
    import re
    html = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
    title = re.search(r"<title>(.*?)</title>", html).group(1)
    desc = re.search(r'<meta name="description" content="(.*?)">', html).group(1)
    assert "HerbGuard TTM" in title and len(title) <= 90 and 60 <= len(desc) <= 300
    assert html.count("<h1") == 1 and '<html lang="th">' in html and "<header>" in html and "<main>" in html and "<footer>" in html
    assert '<meta name="robots" content="noindex, nofollow">' in html          # ข้อมูลยังเป็นร่าง ปิดดัชนีไว้ก่อน
    ld = json.loads(re.search(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', html, re.S).group(1))
    assert ld["@type"] == "WebApplication" and ld["inLanguage"] == "th"
    assert not re.search(r'<meta property="og:(image|url)"|<link rel="canonical"', html)  # ยังไม่มีโดเมน/รูปจริง ไม่ใส่ลิงก์ที่เดาเอา
    assert 'property="og:title"' in html and 'property="og:description"' in html


def test_robots_txt_and_header_block_indexing_consistently(base):
    with urllib.request.urlopen(base + "/robots.txt") as r:
        assert "Disallow: /" in r.read().decode()
    assert "noindex" in (ROOT / "vercel.json").read_text(encoding="utf-8")     # X-Robots-Tag


def test_index_page_respects_ui_rule_5_and_has_no_reassurance_glyphs():
    html = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
    assert 'const NO_FLAG = "ไม่พบธงเตือนในฐานข้อมูลนี้"' in html           # ข้อความมาตรฐานเมื่อไม่พบธง
    assert "ปลอดภัย" not in html.replace("ไม่ได้แปลว่าปลอดภัย", "")           # คำนี้ใช้ได้เฉพาะแบบปฏิเสธ
    assert not any(g in html for g in "✓✔✅☑👍")                              # ไม่มีสัญลักษณ์ติ๊ก/ปลอบใจในผลตรวจ
    assert "scopeBox(cov, r.disclaimer_th)" in html and "evidence(f)" in html  # ขอบเขต+disclaimer และแถวหลักฐานถูกเรียกใช้
    assert "aria-selected" in html and "aria-controls" in html               # แท็บมี aria ครบ
