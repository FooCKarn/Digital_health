import pytest


@pytest.fixture(autouse=True)
def _no_llm_keys(monkeypatch):
    """กันเทสต์เรียกเครือข่ายจริงเมื่อเครื่องมี API key และเริ่มทุกเทสต์ที่ค่าเริ่มต้น (แชตไม่ใช้ LLM, ไม่บังคับผู้ให้บริการ)"""
    for k in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER", "HERBGUARD_CHAT_LLM"):
        monkeypatch.delenv(k, raising=False)
