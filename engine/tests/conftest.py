import pytest


@pytest.fixture(autouse=True)
def _no_llm_keys(monkeypatch):
    """กันเทสต์เรียกเครือข่ายจริงเมื่อเครื่องมี API key"""
    for k in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
