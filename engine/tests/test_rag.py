import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
import rag  # noqa: E402

L = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG = L("data/herbs.json"), L("data/drug_class_map.json"), L("data/config.json")
CONDS = L("data/conditions.json")["conditions"]
INDEX = rag.build_index(HERBS, DRUGS, CONDS, CONFIG["rag_synonyms"]["value"])
STOP = CONFIG["rag_stop_phrases"]["value"]


def found(question, checked=(), context=(), top_k=4, min_score=0.0):
    scope = rag.resolve_scope(question, INDEX, list(checked), list(context))
    return [c["item_id"] for c, _ in rag.retrieve(rag.strip_stop(question, STOP), INDEX, scope, top_k, min_score)]


def test_grams_keep_thai_tone_marks_and_drop_spaces_and_punctuation():
    g = rag.grams("ไม่ ควร,")
    assert "ไม่" in g and "ควร" in g and not any(" " in x or "," in x for x in g)


def test_index_has_one_chunk_per_data_item_with_unique_ids_and_short_quotes():
    n = sum(len(h.get(k, [])) for h in HERBS["herbs"] for k in rag.KINDS)
    ids = [c["item_id"] for c in INDEX["chunks"]]
    assert len(ids) == n == len(set(ids)) and "khing.drug_cautions.0" in ids
    for c in INDEX["chunks"]:
        assert isinstance(c["source_page"], int) and 0 < len(c["evidence_quote"]) <= 250 and c["evidence_tier"] == "A"


def test_named_herbs_prefers_longest_name():
    assert rag.named_herbs(rag.norm("มะขามป้อมกับเบาหวาน"), INDEX) == ["makham_pom"]   # ไม่ใช่ makham ด้วย
    assert rag.named_herbs(rag.norm("มะขามกับไอบูโพรเฟน"), INDEX) == ["makham"]


def test_scope_named_herb_wins_over_checked_and_drug():
    assert rag.resolve_scope("ขิงกับ warfarin", INDEX, ["garlic"], []) == {"khing"}


def test_scope_from_drug_name_synonym_and_condition_reverse_lookup():
    assert {"khing", "garlic"} <= rag.resolve_scope("warfarin ต้องระวังกับสมุนไพรอะไร", INDEX, [], [])
    assert "khing" in rag.resolve_scope("ยากันเลือดเป็นลิ่ม", INDEX, [], [])
    assert {"khilek", "mara_khi_nok"} <= rag.resolve_scope("ใครต้องระวังเรื่องโรคตับ", INDEX, [], [])


def test_scope_falls_back_to_checked_and_context_when_no_anchor():
    assert rag.resolve_scope("ธงนี้เกี่ยวกับอะไร", INDEX, ["khing"], ["garlic"]) == {"khing", "garlic"}
    assert rag.resolve_scope("ฟุตบอล", INDEX, [], []) == set()


def test_scope_explicit_anchor_with_no_data_is_empty_not_fallback():
    herbs = {"herbs": [{"id": "h", "name_th": "สมุนไพรทดสอบ", "contraindications": [], "age_limits": [], "drug_cautions": [],
                        "condition_cautions": [], "duration_limits": [], "notes": []}]}
    idx = rag.build_index(herbs, {"entries": [{"names": ["x"], "class": ["cls"]}]}, {}, {"cls": ["ยาสมมติ"]})
    assert rag.resolve_scope("ยาสมมติ", idx, ["h"], ["h"]) == set()   # ระบุยาชัดเจนแต่ไม่มีข้อมูล = ไม่ตกไปใช้สมุนไพรอื่น


def test_retrieve_finds_expected_items_within_top_k():
    cases = {
        "ขิงกับยากันเลือดเป็นลิ่ม": "khing.drug_cautions.0",
        "ขิงเด็กต่ำกว่า 6 ขวบ": "khing.age_limits.0",
        "รางจืดใช้ติดต่อกันเกินกี่วัน": "rangchuet.duration_limits.0",
        "รางจืดกับยาเบาหวาน": "rangchuet.drug_cautions.0",
        "กระเทียมกับไซโคลสปอริน": "garlic.drug_cautions.3",
        "ขี้เหล็กกับโรคตับ": "khilek.contraindications.2",
        "มะระขี้นกกับอินซูลิน": "mara_khi_nok.drug_cautions.1",
    }
    for q, want in cases.items():
        assert want in found(q), f"{q} -> {found(q)}"


def test_retrieve_is_deterministic_and_respects_min_score_and_scope():
    assert found("ขิงกับยากันเลือดเป็นลิ่ม") == found("ขิงกับยากันเลือดเป็นลิ่ม")
    assert found("ขิงกับยากันเลือดเป็นลิ่ม", min_score=0.99) == []
    assert all(i.startswith("khing.") for i in found("ขิงกับยากันเลือดเป็นลิ่ม"))   # ไม่หลุดไปสมุนไพรอื่น


def test_retrieve_handles_empty_and_symbol_only_queries():
    assert rag.retrieve("", INDEX, {"khing"}, 4, 0.0) == [] and rag.retrieve("?!...", INDEX, {"khing"}, 4, 0.0) == []
    assert rag.retrieve("ขิง", INDEX, set(), 4, 0.0) == []
