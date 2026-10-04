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
    assert s == 200 and len(m["herbs"]) == 7 and m["coverage"]["herbs_in_book"] == 50
    s, out = call(base + "/api/analyze", {"herbs": [{"id": "garlic", "part": "หัว"}], "drugs": ["warfarin"], "profile": {"age": 65}})
    assert s == 200 and any(f["herb_id"] == "garlic" for f in out["result"]["flags"])


def test_http_bad_input_gets_400_not_500(base):
    assert call(base + "/api/analyze", {"herbs": []})[0] == 400
    assert call(base + "/api/analyze", b"{not json")[0] == 400


def test_http_parse_without_api_key_is_503_with_clear_message(base, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    s, body = call(base + "/api/parse", {"text": "กินขิง"})
    assert s == 503 and body["error"] == "llm_unavailable" and "ANTHROPIC_API_KEY" in body["message"]


def test_http_parse_validates_text(base):
    assert call(base + "/api/parse", {"text": ""})[0] == 400
    assert call(base + "/api/parse", {"text": "x" * 1001})[0] == 400
    assert call(base + "/api/parse", {})[0] == 400


def test_http_explain_without_api_key_falls_back_to_template(base, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    s, body = call(base + "/api/explain", {"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}})
    x = body["explanation"]
    assert s == 200 and x["source"] == "template" and x["items"] and x["disclaimer_th"]


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
