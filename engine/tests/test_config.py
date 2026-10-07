import json
from pathlib import Path

CFG = json.loads((Path(__file__).resolve().parents[2] / "data" / "config.json").read_text(encoding="utf-8"))
CHAT_KEYS = ["rag_top_k", "rag_min_score", "rag_stop_phrases", "rag_synonyms", "rag_kind_keywords", "chat_emergency_phrases", "chat_dose_phrases",
             "chat_diagnosis_phrases", "chat_safety_yesno_phrases", "chat_explain_phrases", "chat_pharmacist_phrases",
             "chat_messages_th", "chat_followups_th"]


def test_every_team_set_param_is_labelled_team_set():
    for k, v in CFG.items():
        if isinstance(v, dict) and "value" in v:
            assert "ทีมตั้งเอง" in v["note"], f"{k} ขาดป้าย 'ทีมตั้งเอง' (กฎข้อ 7)"


def test_chat_keys_present_and_well_typed():
    for k in CHAT_KEYS:
        assert k in CFG, k
    assert isinstance(CFG["rag_top_k"]["value"], int) and 1 <= CFG["rag_top_k"]["value"] <= 6
    assert 0 < CFG["rag_min_score"]["value"] < 1
    for k in CHAT_KEYS[2:2] + ["chat_emergency_phrases", "chat_dose_phrases", "chat_diagnosis_phrases", "chat_safety_yesno_phrases",
                              "chat_explain_phrases", "chat_pharmacist_phrases", "rag_stop_phrases", "chat_followups_th"]:
        assert CFG[k]["value"] and all(isinstance(p, str) and p.strip() for p in CFG[k]["value"]), k
    msgs = CFG["chat_messages_th"]["value"]
    assert set(msgs) == {"emergency", "no_info", "dose", "diagnosis", "safety_prefix", "safety_no_flag", "no_check",
                         "asked_unchecked", "asked_unchecked_none"}


def test_fixed_messages_never_claim_safety():
    msgs = CFG["chat_messages_th"]["value"]
    for k, m in msgs.items():
        assert "ปลอดภัย" not in m.replace("ไม่ได้แปลว่าปลอดภัย", ""), k
    assert msgs["safety_no_flag"].startswith("ไม่พบธงเตือนในฐานข้อมูลนี้") and "ไม่ได้แปลว่าปลอดภัย" in msgs["safety_no_flag"]
    assert "1669" in msgs["emergency"]
    assert "ไม่ได้แปลว่าปลอดภัย" in msgs["asked_unchecked_none"] and "สำหรับข้อมูลที่คุณกรอก" in msgs["safety_no_flag"]


def test_emergency_and_drug_synonym_lists_flagged_for_expert_review():
    for k in ("chat_emergency_phrases", "chat_dose_phrases", "chat_diagnosis_phrases", "rag_synonyms", "rag_kind_keywords", "rag_min_score"):
        assert "ผู้เชี่ยวชาญต้องตรวจ" in CFG[k]["note"], k


def test_kind_keywords_cover_only_known_kinds_with_nonempty_trigger_words():
    kk = CFG["rag_kind_keywords"]["value"]
    assert set(kk) <= {"contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits", "notes"} and kk
    assert all(ws and all(isinstance(w, str) and len(w.strip()) >= 2 for w in ws) for ws in kk.values())
