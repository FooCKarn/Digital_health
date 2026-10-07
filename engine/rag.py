"""RAG แบบคุมได้ (สเปก docs/superpowers/specs/2026-10-06-chat-assistant-design.md)
ส่วนนี้: คลังข้อความ ดัชนี n-gram ตัวอักษร (ภาษาไทยไม่มีช่องว่างคั่นคำ) ขอบเขตสมุนไพร และการค้น ล้วนกำหนดผลแน่นอน; answer() เรียก llm ได้เฉพาะเพื่อเรียบเรียงข้อความที่ค้นได้ (ผ่านตัวตรวจ ไม่ผ่านใช้ข้อความสกัด)
คลังข้อความ = รายการใน data/herbs.json เท่านั้น (ไม่ใช้ข้อความเต็มของหนังสือ ลิขสิทธิ์ ข้อ 9)
"""
import math
import re
from collections import Counter

import llm

KINDS = ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits", "notes")
# ตัดช่องว่างและเครื่องหมายวรรคตอน แต่ไม่ตัดสระ/วรรณยุกต์ไทย (\w ใน Python ไม่ครอบคลุมเครื่องหมายผสม จึงไม่ใช้)
_STRIP = re.compile(r"[\s.,;:!?()\[\]{}\"'“”‘’\-–—/\\|*_<>]+")


def norm(s: str) -> str:
    return _STRIP.sub("", s.lower())


def grams(s: str) -> set:
    t = norm(s)
    return {t[i:i + n] for n in (2, 3) for i in range(len(t) - n + 1)}


def strip_stop(question: str, phrases: list) -> str:
    q = question.lower()
    for p in phrases:
        q = q.replace(p.lower(), " ")
    return q


def _alts(label: str) -> list:
    """'แผลเปบติก / แผลทางเดินอาหาร' -> ['แผลเปบติก', 'แผลทางเดินอาหาร'] (ยาวไม่ถึง 3 ตัวอักษรทิ้ง กันจับมั่ว)"""
    return [n for n in (norm(p) for p in re.split(r"\s*/\s*|\s*\(", label)) if len(n) >= 3]


def build_index(herbs_db: dict, drug_map: dict, conds: dict, synonyms: dict, kind_keywords: dict = None) -> dict:
    """synonyms: คีย์ที่เป็นรหัสโรค/ภาวะ (conditions.json หรือที่ herbs.json ใช้) = คำพ้องของโรค นอกนั้น = คำพ้องของกลุ่มยา
    kind_keywords: หัวข้อ (KINDS) -> คำบอกหัวข้อ ติดไปกับทุกรายการในหัวข้อนั้น และใช้เป็นหลักของคำถาม (has_anchor)"""
    kind_keywords = kind_keywords or {}
    cond_codes = set(conds) | {it["condition"] for h in herbs_db["herbs"] for k in KINDS for it in h.get(k, []) if it.get("condition")}
    class_alias = {}
    for e in drug_map["entries"]:
        for c in e["class"]:
            class_alias.setdefault(c, []).extend(e["names"])
    for c, words in synonyms.items():
        if c not in cond_codes:
            class_alias.setdefault(c, []).extend(words)
    chunks = []
    for h in herbs_db["herbs"]:
        for kind in KINDS:
            for n, it in enumerate(h.get(kind, [])):
                cls, cond = it.get("drug_class"), it.get("condition")
                extra = " ".join(class_alias.get(cls, [])) + " " + " ".join(it.get("drug_names", [])) + " " + (cls or "")
                extra += " " + " ".join(kind_keywords.get(kind, []))
                label = (conds.get(cond, "") + " " + " ".join(synonyms.get(cond, []))) if cond else ""
                chunks.append({
                    "item_id": f"{h['id']}.{kind}.{n}", "herb_id": h["id"], "herb_name_th": h["name_th"], "kind": kind,
                    "text_th": it["text"], "condition": it.get("condition"), "drug_class": cls,
                    "source_page": it["source_page"], "pdf_page": it.get("pdf_page"), "evidence_quote": it.get("evidence_quote"),
                    "evidence_tier": it.get("evidence_tier", "A"),  # ทุกรายการใน herbs.json มาจากเล่มโดยตรง = ชั้น A
                    "verified": it.get("verified", False),
                    "_grams": grams(f"{h['name_th']} {it['text']} {label} {extra}"),
                })
    df = Counter(g for c in chunks for g in c["_grams"])
    n_chunks = len(chunks)
    return {
        "chunks": chunks,
        "idf": {g: math.log((n_chunks + 1) / (d + 0.5)) for g, d in df.items()},
        "unseen": math.log((n_chunks + 1) / 0.5),  # gram ที่ไม่เคยปรากฏในคลัง = หนักสุด (ดึงคะแนนลงเมื่อคำถามมีคำที่ฐานไม่รู้จัก)
        "herb_by_name": sorted(((norm(h["name_th"]), h["id"]) for h in herbs_db["herbs"]), key=lambda x: -len(x[0])),
        "herb_names": {h["id"]: h["name_th"] for h in herbs_db["herbs"]},
        "classes": {c: [a for a in (norm(w) for w in ws) if len(a) >= 3] for c, ws in class_alias.items()},
        "cond_alts": {code: _alts(conds.get(code, "")) + [a for a in (norm(w) for w in synonyms.get(code, [])) if len(a) >= 3] for code in sorted(cond_codes)},
        "kinds": {k: [a for a in (norm(w) for w in ws) if len(a) >= 2] for k, ws in kind_keywords.items()},
        "drug_names": [n for e in drug_map["entries"] for n in e["names"]],
    }


def named_herbs(q_norm: str, index: dict) -> list:
    # ponytail: จับแบบ substring ไม่มีขอบเขตคำ (ไทยไม่มีช่องว่าง); ชื่อสั้นอาจชนคำอื่น ถ้าพบให้เพิ่มรายการยกเว้นใน config
    found, rest = [], q_norm
    for name, hid in index["herb_by_name"]:  # ชื่อยาวก่อน: 'มะขามป้อม' ต้องไม่ถูกนับเป็น 'มะขาม' ซ้ำ
        if name and name in rest:
            found.append(hid)
            rest = rest.replace(name, "\x00" * len(name))
    return found


def resolve_scope(question: str, index: dict, checked: list, context: list) -> set:
    """ขอบเขตสมุนไพรที่ค้นได้: ชื่อสมุนไพรในคำถาม > ยา/โรคที่ระบุ (ย้อนหาสมุนไพรที่มีข้อมูล) > สมุนไพรที่ตรวจ+ที่คุยล่าสุด
    ระบุยา/โรคชัดเจนแต่ไม่มีข้อมูลเลย = ว่าง (ไม่ตกไปใช้สมุนไพรอื่น)"""
    q = norm(question)
    herbs = named_herbs(q, index)
    if herbs:
        return set(herbs)
    classes = [c for c, al in index["classes"].items() if any(a in q for a in al)]
    codes = [code for code, al in index["cond_alts"].items() if any(a in q for a in al)]
    if classes or codes:
        return ({c["herb_id"] for c in index["chunks"] if c["kind"] == "drug_cautions" and c["drug_class"] in classes}
                | {c["herb_id"] for c in index["chunks"] if c["condition"] in codes})
    return set(checked) | set(context)


def without_herb_names(text: str, index: dict) -> str:
    """norm แล้วแทนชื่อสมุนไพรด้วย \\x00 (ชื่อยาวก่อน เหมือน named_herbs) กันข้อความสองฝั่งชื่อต่อกันเป็นคำใหม่"""
    q = norm(text)
    for name, _ in index["herb_by_name"]:
        if name:
            q = q.replace(name, "\x00")
    return q


def anchors(question: str, index: dict) -> tuple:
    """'หลัก' ของคำถามนอกจากชื่อสมุนไพร: (กลุ่มยา, รหัสโรค/ภาวะ, หัวข้อ) ที่คำถามเอ่ยถึง (ชื่อยา/คำพ้อง/คำบอกหัวข้อใน config)
    คำตอบแบบค้นใช้ได้เฉพาะรายการที่ตรงกับหลักอย่างน้อยหนึ่งอย่าง ไม่มีหลัก = ไม่ตอบ
    (กฎข้อ 4(c): คำถามนอกขอบเขตต้องปฏิเสธ เช่น 'วันนี้อากาศเป็นอย่างไร' แม้มีสมุนไพรที่ตรวจอยู่)"""
    q = without_herb_names(question, index)

    def hit(d):
        return {k for k, al in d.items() if any(a in q for a in al)}
    return hit(index["classes"]), hit(index["cond_alts"]), hit(index["kinds"])


def retrieve(query: str, index: dict, scope: set, top_k: int, min_score: float) -> list:
    """คะแนน = (น้ำหนัก idf ของ gram ในคำถามที่พบในรายการ) / (น้ำหนักรวมของ gram ทั้งหมดในคำถาม) เรียงคะแนนมาก->น้อย เท่ากันเรียงตามรหัส
    ชื่อสมุนไพรถูกตัดออกจากคำถามก่อนคิดคะแนน: ชื่อกำหนดขอบเขตแล้ว (resolve_scope) จึงไม่นับเป็นหลักฐานความเกี่ยวข้อง
    (ไม่งั้น 'ขิงรสอะไร' ได้คะแนนจากคำว่า 'ขิง' ล้วน ๆ)"""
    qg = set().union(*(grams(part) for part in without_herb_names(query, index).split("\x00")))
    if not qg or not scope:
        return []
    idf, unseen = index["idf"], index["unseen"]
    denom = math.fsum(idf.get(g, unseen) for g in qg)  # fsum: ผลไม่ขึ้นกับลำดับ set (PYTHONHASHSEED)
    scored = []
    for c in index["chunks"]:
        if c["herb_id"] in scope:
            score = math.fsum(idf[g] for g in qg & c["_grams"]) / denom
            if score >= min_score:
                scored.append((score, c))
    scored.sort(key=lambda x: (-x[0], x[1]["item_id"]))
    return [(c, round(s, 3)) for s, c in scored[:top_k]]


# ---------- intent (กฎตายตัว ไม่ใช้ LLM) ----------
def classify(question: str, config: dict) -> str:
    """ลำดับความสำคัญ: emergency > dose > diagnosis > safety_yesno > pharmacist_q > explain_flags > lookup"""
    q = norm(question)

    def hit(key):
        return any(norm(p) in q for p in config[key]["value"])

    if hit("chat_emergency_phrases"):
        return "emergency"
    if hit("chat_dose_phrases"):
        return "dose"
    if hit("chat_diagnosis_phrases"):
        return "diagnosis"
    if hit("chat_safety_yesno_phrases"):
        return "safety_yesno"
    if hit("chat_pharmacist_phrases"):
        return "pharmacist_q"
    if hit("chat_explain_phrases"):
        return "explain_flags"
    return "lookup"


# ---------- คำตอบ ----------
def _cite(c: dict) -> dict:
    return {k: c[k] for k in ("item_id", "herb_id", "herb_name_th", "source_page", "pdf_page", "evidence_quote", "verified")}


def _flag_cite(f: dict, index: dict) -> dict:
    return {"item_id": f"flag:{f['flag_id']}", "herb_id": f["herb_id"], "herb_name_th": index["herb_names"].get(f["herb_id"], f["herb_id"]),
            "source_page": f["source_page"], "pdf_page": f.get("pdf_page"), "evidence_quote": f.get("evidence_quote"), "verified": f["verified"]}


def _lines(chunks: list) -> str:
    return "\n".join(f"• {c['herb_name_th']}: {c['text_th']} (ชั้นหลักฐาน {c['evidence_tier']}, หน้า {c['source_page']})" for c in chunks)


def _extractive(chunks: list) -> str:
    return "จากฐานข้อมูลนี้:\n" + _lines(chunks)


def _lookup(question: str, scope: set, index: dict, config: dict, extra_stop: list = ()) -> list:
    """ค้นแบบสกัดข้อความ: เฉพาะรายการที่ตรงกับหลักของคำถาม (ยา/โรค/หัวข้อ) และผ่านคะแนนขั้นต่ำ"""
    classes, codes, kinds = anchors(question, index)
    hits = retrieve(strip_stop(question, config["rag_stop_phrases"]["value"] + list(extra_stop)), index, scope,
                    len(index["chunks"]), config["rag_min_score"]["value"])
    return [c for c, _ in hits if c["drug_class"] in classes or c["condition"] in codes or c["kind"] in kinds][:config["rag_top_k"]["value"]]


def _covered(c: dict, flags: list) -> bool:
    """รายการในฐานมีธงครอบคลุมแล้วหรือไม่ ดูจากฟิลด์ที่ check.py ใส่ในธงเท่านั้น (สมุนไพรเดียวกัน + กฎ + condition/drug_class)
    notes ไม่มีกฎใดสร้างธง = ไม่ครอบคลุมเสมอ"""
    def hit(f):
        if f["herb_id"] != c["herb_id"]:
            return False
        if c["kind"] == "age_limits":
            return f["rule_id"] == "R1" and f.get("condition") == "age"
        if c["kind"] in ("contraindications", "condition_cautions"):
            return f["rule_id"] == "R1" and f.get("condition") == c["condition"]
        if c["kind"] == "drug_cautions":
            return f["rule_id"] == "R2" and f.get("drug_class") == c["drug_class"]
        if c["kind"] == "duration_limits":
            return f["rule_id"] == "R4"
        return False
    return any(hit(f) for f in flags)


def answer(question: str, result, context_herbs: list, checked_herbs: list, index: dict, config: dict, complete=None, use_llm: bool = True) -> dict:
    """ตอบคำถาม: ข้อความตายตัว/แบบสกัดข้อความเสมอ ถ้า use_llm จะให้ LLM เรียบเรียงจากรายการที่ค้นได้ (ไม่ผ่านตัวตรวจ = กลับแบบสกัดข้อความ)
    result=None หมายถึงยังไม่มีผลตรวจ"""
    msgs = config["chat_messages_th"]["value"]
    follow = config["chat_followups_th"]["value"][:3]

    def out(source, text, cites=(), why=None):
        return {"source": source, "text_th": text, "cites": list(cites), "follow_ups": follow, "rejected_reason": why}

    intent = classify(question, config)
    if intent == "emergency":
        return out("emergency", msgs["emergency"])
    if intent == "dose":
        return out("refusal", msgs["dose"])
    if intent == "diagnosis":
        return out("refusal", msgs["diagnosis"])
    if intent == "pharmacist_q":
        qs = config["pharmacist_questions_th"]["value"]
        return out("database", "คำถามที่ควรถามเภสัชกร (ร่าง ผู้เชี่ยวชาญต้องตรวจ):\n" + "\n".join(f"• {q}" for q in qs))
    if intent in ("safety_yesno", "explain_flags"):
        if result is None:
            return out("refusal", msgs["no_check"])
        flags = result["flags"]
        named = named_herbs(norm(question), index)
        classes, codes, kinds = anchors(question, index)
        # กฎข้อ 5: คำถามเอ่ยถึงสมุนไพรที่ไม่ได้ตรวจ หรือยา/โรคที่ไม่มีธงใดครอบคลุม -> ห้ามตอบ 'ไม่พบธง' ผลตรวจไม่ได้ตอบเรื่องนั้น
        unchecked = [h for h in named if h not in checked_herbs]
        phrases = config["chat_safety_yesno_phrases"]["value"] + config["chat_explain_phrases"]["value"]
        chunks = _lookup(question, set(named) or set(checked_herbs), index, config, phrases)
        # ไม่มีธงแต่ฐานมีรายการตรงหลักของคำถาม (เช่น 'เด็ก' 'คนท้อง' ที่ผู้ใช้ไม่ได้กรอก) = ผลตรวจไม่ได้ตอบเรื่องนั้นเช่นกัน
        # มีธงอื่นอยู่แล้วแต่หัวข้อที่ถาม (เช่น 'เด็ก') ไม่มีธงใดครอบคลุม = ไม่ครอบคลุมเช่นกัน
        uncovered = (unchecked or classes - {f.get("drug_class") for f in flags} or codes - {f.get("condition") for f in flags}
                     or (not flags and chunks) or any(c["kind"] in kinds and not _covered(c, flags) for c in chunks))
        if intent == "explain_flags":
            flags = [f for f in flags if f["herb_id"] in named] or flags   # สมุนไพรที่ระบุไม่มีธง = แสดงธงทั้งหมด
        head = msgs["safety_prefix"] + "\n" if intent == "safety_yesno" else ""
        flag_text = head + "\n".join(f"• {f['message_th']} (ชั้นหลักฐาน {f['evidence_tier']}, หน้า {f['source_page']})" for f in flags)
        flag_cites = [_flag_cite(f, index) for f in flags]
        if uncovered:   # ค้นแบบสกัดข้อความเสมอ ไม่ใช้ LLM ในทางนี้
            if not chunks and unchecked:   # ไม่มีหลักอื่นในคำถาม: แสดงรายการของสมุนไพรนั้นตามลำดับหัวข้อ (ข้อห้ามก่อน)
                chunks = [c for c in index["chunks"] if c["herb_id"] in unchecked][:config["rag_top_k"]["value"]]
            pre = flag_text + "\n" if flags else ""
            if not chunks:
                return out("database", pre + msgs["asked_unchecked_none"], flag_cites)
            return out("database", pre + msgs["asked_unchecked"] + "\n" + _lines(chunks), flag_cites + [_cite(c) for c in chunks])
        if not flags:
            return out("database", msgs["safety_no_flag"])
        return out("database", flag_text, flag_cites)

    chunks = _lookup(question, resolve_scope(question, index, checked_herbs, context_herbs), index, config)
    if not chunks:
        return out("refusal", msgs["no_info"])
    base_text, why = _extractive(chunks), None
    if use_llm:
        allowed = " ".join(f"{c['herb_name_th']} {c['text_th']} {c['evidence_quote'] or ''} {c['drug_class'] or ''}" for c in chunks)
        allowed += " " + " ".join(a for cls in {c["drug_class"] for c in chunks if c["drug_class"]} for a in index["classes"].get(cls, []))
        text, ids, why = llm.answer_with_llm(question, chunks, allowed, list(index["herb_names"].values()), index["drug_names"],
                                             config["llm_forbidden_phrases"]["value"], complete)
        if text is not None:
            return out("llm", text, [_cite(c) for c in chunks if c["item_id"] in ids])
    return out("database", base_text, [_cite(c) for c in chunks], why)
