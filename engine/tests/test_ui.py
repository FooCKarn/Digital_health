"""smoke test ของ app/app.py ด้วย streamlit.testing (ไม่เปิดเบราว์เซอร์)"""
from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parents[2] / "app" / "app.py")


def page_text(at):
    return "\n".join(getattr(e, "value", "") for kind in ("markdown", "error", "warning", "info", "caption") for e in getattr(at, kind))


def submit(herbs, drugs=None, other=""):
    at = AppTest.from_file(APP, default_timeout=30).run()
    at.multiselect[0].set_value(herbs).run()
    if drugs:
        at.multiselect[1].set_value(drugs).run()
    if other:
        at.text_input[0].set_value(other).run()
    at.button[0].click().run()
    assert not at.exception
    return page_text(at)


def test_ui_flag_case_shows_evidence_coverage_and_disclaimer():
    t = submit(["khing", "garlic"], ["warfarin"])
    assert "ชั้นหลักฐาน A" in t and "ขอบเขตของฐานข้อมูลนี้" in t and "ไม่ใช่การวินิจฉัย" in t
    assert "ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ" in t and "ไม่ได้ตรวจเงื่อนไข" in t


def test_ui_no_flag_case_never_says_safe_outside_disclaimer():
    t = submit(["krachai"])
    assert "ไม่พบธงเตือนในฐานข้อมูลนี้" in t and "ขอบเขตของฐานข้อมูลนี้" in t
    assert "ปลอดภัย" not in t.replace("ไม่ได้หมายความว่าปลอดภัย", "")


def test_ui_unknown_drug_listed_not_guessed():
    t = submit(["khing"], other="ยามั่ว")
    assert "ยามั่ว" in t and "ระบบไม่เดา" in t
