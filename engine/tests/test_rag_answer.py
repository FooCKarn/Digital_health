import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import rag  # noqa: E402
from check import check  # noqa: E402

L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG, CONDS, TAGS = L("data/herbs.json"), L("data/drug_class_map.json"), L("data/config.json"), L("data/conditions.json")["conditions"], L("data/mechanism_tags.json")["tags"]
INDEX = rag.build_index(HERBS, DRUGS, CONDS, CONFIG["rag_synonyms"]["value"], CONFIG["rag_kind_keywords"]["value"])
MSG = CONFIG["chat_messages_th"]["value"]

KW_INP = {"herbs": [{"id": "khing"}, {"id": "garlic"}], "drugs": ["warfarin"], "profile": {"age": 60}}
KW = check(KW_INP, HERBS, DRUGS, CONFIG, TAGS)
NONE_INP = {"herbs": [{"id": "krachai"}], "drugs": [], "profile": {"age": 30}}
NONE = check(NONE_INP, HERBS, DRUGS, CONFIG, TAGS)


def ask(q, result=KW, checked=("khing", "garlic"), context=()):
    return rag.answer(q, result, list(context), list(checked), INDEX, CONFIG, use_llm=False)


def no_claim_of_safety(text):
    return "ปลอดภัย" not in text.replace("ไม่ได้แปลว่าปลอดภัย", "")


@pytest.mark.parametrize("q,intent", [
    ("หายใจไม่ออกหลังกินขิง", "emergency"), ("หายใจไม่ออกหลังกินขิงกี่เม็ด", "emergency"),   # ฉุกเฉินชนะ dose
    ("ขิงกินวันละกี่เม็ด", "dose"), ("ฉันเป็นโรคอะไร", "diagnosis"),
    ("ขิงกับ warfarin ปลอดภัยไหม", "safety_yesno"), ("ใช้ร่วมกันได้ไหม", "safety_yesno"),
    ("ควรถามเภสัชกรว่าอะไร", "pharmacist_q"), ("ทำไมถึงขึ้นธง", "explain_flags"), ("อธิบายธงของขิง", "explain_flags"),
    ("รางจืดไม่ควรใช้เกินกี่วัน", "lookup"),  # 'กี่วัน' คือระยะเวลา ไม่ใช่ขนาดยา
])
def test_classify(q, intent):
    assert rag.classify(q, CONFIG) == intent


def test_emergency_is_fixed_message_without_retrieval_and_wins_over_other_intents():
    a = ask("หายใจไม่ออกหลังกินขิงกี่เม็ด")
    assert a["source"] == "emergency" and a["text_th"] == MSG["emergency"] and a["cites"] == []


def test_dose_and_diagnosis_are_fixed_refusals():
    assert ask("ขิงกินวันละกี่เม็ด")["text_th"] == MSG["dose"]
    d = ask("ฉันเป็นโรคอะไร")
    assert d["source"] == "refusal" and d["text_th"] == MSG["diagnosis"]


def test_safety_yesno_never_says_yes_and_lists_current_flags():
    a = ask("ขิงกับ warfarin ปลอดภัยไหม")
    assert a["source"] == "database" and a["text_th"].startswith(MSG["safety_prefix"]) and "ขิง" in a["text_th"] and no_claim_of_safety(a["text_th"])
    assert all(c["item_id"].startswith("flag:") and c["evidence_quote"] for c in a["cites"]) and a["cites"]


def test_safety_yesno_without_flags_uses_standard_no_flag_wording():
    a = ask("กินได้ไหม", result=NONE, checked=("krachai",))
    assert a["text_th"] == MSG["safety_no_flag"] and no_claim_of_safety(a["text_th"]) and a["cites"] == []


def test_safety_yesno_and_explain_without_any_check_ask_to_check_first():
    assert ask("กินได้ไหม", result=None, checked=())["text_th"] == MSG["no_check"]
    assert ask("ทำไมถึงขึ้นธง", result=None, checked=())["text_th"] == MSG["no_check"]


def test_explain_flags_lists_all_flags_or_only_the_named_herb():
    allf = ask("ทำไมถึงขึ้นธง")
    assert allf["source"] == "database" and len(allf["cites"]) == len(KW["flags"])
    one = ask("อธิบายธงของขิง")
    assert one["cites"] and all(c["herb_id"] == "khing" for c in one["cites"])


def test_pharmacist_question_list_comes_from_config():
    a = ask("ควรถามเภสัชกรว่าอะไร")
    assert all(q in a["text_th"] for q in CONFIG["pharmacist_questions_th"]["value"])


def test_lookup_answers_from_database_with_evidence_and_pages():
    a = ask("รางจืดไม่ควรใช้เกินกี่วัน", result=None, checked=())
    assert a["source"] == "database" and "รางจืด" in a["text_th"] and a["follow_ups"] == CONFIG["chat_followups_th"]["value"][:3]
    c = a["cites"][0]
    assert c["item_id"].startswith("rangchuet.") and c["evidence_quote"] and isinstance(c["source_page"], int) and c["pdf_page"] == c["source_page"] + 8


def test_lookup_without_anchor_or_data_is_fixed_no_info_refusal():
    for q in ("ฟุตบอลคืออะไร", "ขิงรสอะไร"):   # คำถามที่ฐานข้อมูลไม่มีคำตอบ
        a = ask(q, result=None, checked=("khing",))
        assert a["source"] == "refusal" and a["text_th"] == MSG["no_info"] and a["cites"] == [], q


def test_lookup_needs_an_anchor_matching_the_answered_item():
    # ไม่มีหลัก (ยา/โรค/หัวข้อ) = ปฏิเสธ แม้มีสมุนไพรที่ตรวจอยู่และคะแนนค้นสูงพอ
    for checked in (("garlic",), ("khilek",)):
        assert ask("วันนี้อากาศเป็นอย่างไร", result=None, checked=checked)["text_th"] == MSG["no_info"], checked
    assert ask("ขิงกับเบาหวาน", result=None, checked=())["source"] == "refusal"   # มีหลัก (เบาหวาน) แต่ขิงไม่มีรายการเรื่องนี้
    assert ask("ใช้ได้นานกี่วัน", result=None, checked=("khing",))["source"] == "refusal"   # ขิงไม่มีรายการระยะเวลา
    # มีหลักและมีรายการตรง = ตอบ
    assert [c["item_id"] for c in ask("ขิงกับคนท้อง", result=None, checked=())["cites"]] == ["khing.contraindications.0"]
    assert "khing.contraindications.0" in [c["item_id"] for c in ask("มีข้อห้ามอะไร", result=None, checked=("khing",))["cites"]]


def test_every_answer_is_deterministic_and_has_no_internal_fields():
    a1, a2 = ask("รางจืดกับยาเบาหวาน", result=None, checked=()), ask("รางจืดกับยาเบาหวาน", result=None, checked=())
    assert a1 == a2 and not any(k.startswith("_") for c in a1["cites"] for k in c)


KHING_ONLY = check({"herbs": [{"id": "khing"}], "drugs": [], "profile": {"age": 30}}, HERBS, DRUGS, CONFIG, TAGS)
KW_KRACHAI = check({"herbs": [{"id": "khing"}, {"id": "garlic"}, {"id": "krachai"}], "drugs": ["warfarin"], "profile": {"age": 60}}, HERBS, DRUGS, CONFIG, TAGS)


def ids(a):
    return [c["item_id"] for c in a["cites"]]


def test_safety_question_naming_an_unchecked_drug_shows_database_items_not_no_flag():
    # กฎข้อ 5: ขิงตรวจแล้วแต่ไม่ได้กรอกยา ถามเรื่องวาร์ฟาริน ห้ามตอบ 'ไม่พบธง' ทั้งที่ฐานมีคำเตือน khing.drug_cautions.0
    assert not KHING_ONLY["flags"]
    a = ask("ขิงกับวาร์ฟารินกินได้ไหม", result=KHING_ONLY, checked=("khing",))
    assert a["text_th"] != MSG["safety_no_flag"] and MSG["asked_unchecked"] in a["text_th"] and no_claim_of_safety(a["text_th"])
    assert "khing.drug_cautions.0" in ids(a) and a["source"] == "database"


def test_safety_question_naming_an_unchecked_herb_shows_that_herbs_items():
    a = ask("ขี้เหล็กกินได้ไหม", result=KHING_ONLY, checked=("khing",))
    assert a["text_th"] != MSG["safety_no_flag"] and MSG["asked_unchecked"] in a["text_th"]
    assert a["cites"] and all(c["herb_id"] == "khilek" for c in a["cites"]) and "khilek.contraindications.0" in ids(a)


def test_explain_question_naming_an_unchecked_herb_keeps_current_flags_and_adds_its_items():
    a = ask("ทำไมถึงเตือนเรื่องขี้เหล็ก", result=check({"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}}, HERBS, DRUGS, CONFIG, TAGS),
            checked=("khing",))
    assert a["text_th"] != MSG["safety_no_flag"] and MSG["asked_unchecked"] in a["text_th"]
    assert any(i.startswith("flag:") for i in ids(a)) and any(i.startswith("khilek.") for i in ids(a))   # ธงจริงของขิงยังแสดง


def test_safety_question_about_unchecked_thing_with_nothing_in_db_uses_fixed_message():
    a = ask("ขิงกับเบาหวานกินได้ไหม", result=KHING_ONLY, checked=("khing",))
    assert a["text_th"] == MSG["asked_unchecked_none"] and a["cites"] == [] and no_claim_of_safety(a["text_th"])


def test_no_flag_wording_is_still_used_when_question_names_only_checked_things():
    # ไม่ควรเตือน: ถามเฉพาะสิ่งที่ตรวจแล้วและไม่มีธงจริง = ข้อความไม่พบธงมาตรฐาน
    for q in ("กระชายกินได้ไหม", "กระชายปลอดภัยไหม"):
        assert ask(q, result=NONE, checked=("krachai",))["text_th"] == MSG["safety_no_flag"], q
    a = ask("ขิงกับวาร์ฟารินกินได้ไหม", result=check({"herbs": [{"id": "khing"}], "drugs": ["warfarin"], "profile": {"age": 60}}, HERBS, DRUGS, CONFIG, TAGS),
            checked=("khing",))
    assert a["text_th"].startswith(MSG["safety_prefix"]) and MSG["asked_unchecked"] not in a["text_th"] and all(i.startswith("flag:") for i in ids(a))


def test_explain_named_checked_herb_without_flags_shows_all_flags():
    a = ask("ทำไมถึงเตือนเรื่องกระชาย", result=KW_KRACHAI, checked=("khing", "garlic", "krachai"))
    assert a["text_th"] != MSG["safety_no_flag"] and len(a["cites"]) == len(KW_KRACHAI["flags"]) > 0


def test_topic_word_question_with_no_flag_still_shows_database_item():
    # กฎข้อ 5: ติ๊กขิง ไม่มีธง ถามเรื่องเด็ก ต้องเห็นข้อห้ามเด็กจากฐานข้อมูล ไม่ใช่ "ไม่พบธงเตือน"
    q = "ขิงให้เด็กกินได้ไหม"
    assert rag.classify(q, CONFIG) == "safety_yesno" and not KHING_ONLY["flags"]
    a = ask(q, result=KHING_ONLY, checked=("khing",))
    assert "khing.age_limits.0" in ids(a) and MSG["asked_unchecked"] in a["text_th"]
    assert not a["text_th"].startswith(MSG["safety_no_flag"]) and no_claim_of_safety(a["text_th"]) and a["source"] == "database"


def test_same_question_without_topic_word_keeps_standard_no_flag_text():
    # ไม่ควรเตือน: ถามเฉพาะสิ่งที่ตรวจแล้ว ไม่มีคำหัวข้อ และไม่มีธง = ข้อความมาตรฐาน
    a = ask("ขิงกินได้ไหม", result=KHING_ONLY, checked=("khing",))
    assert a["text_th"] == MSG["safety_no_flag"] and a["cites"] == []


def test_chest_tightness_is_emergency():
    assert ask("ขิงกินได้ไหม มีอาการแน่นหน้าอก", result=KHING_ONLY, checked=("khing",))["source"] == "emergency"


def test_known_limit_unknown_herb_with_known_drug_is_documented_not_silently_trusted():
    """ข้อจำกัดที่รู้อยู่: สมุนไพรนอกฐาน + ยาที่รู้จัก อาจได้ข้อมูลของยาเป็นคำตอบ (ดูชุดประเมิน known_limit) เทสต์นี้ล็อกว่าผลต้องไม่ว่างเปล่า
    และต้องมีป้ายที่มา เพื่อให้ผู้ใช้เห็นว่าเป็นข้อความจากฐานข้อมูลของสมุนไพรชนิดอื่น ไม่ใช่คำตอบของโสม"""
    a = ask("โสมกับ warfarin", result=None, checked=())
    assert a["source"] in ("refusal", "database") and (a["source"] == "refusal" or all(c["herb_id"] != "ginseng" for c in a["cites"]))
