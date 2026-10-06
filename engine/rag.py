"""RAG แบบคุมได้ (สเปก docs/superpowers/specs/2026-10-06-chat-assistant-design.md)
ส่วนนี้: คลังข้อความ ดัชนี n-gram ตัวอักษร (ภาษาไทยไม่มีช่องว่างคั่นคำ) ขอบเขตสมุนไพร และการค้น ล้วนกำหนดผลแน่นอน ไม่เรียก LLM
คลังข้อความ = รายการใน data/herbs.json เท่านั้น (ไม่ใช้ข้อความเต็มของหนังสือ ลิขสิทธิ์ ข้อ 9)
"""
import math
import re
from collections import Counter

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


def build_index(herbs_db: dict, drug_map: dict, conds: dict, synonyms: dict) -> dict:
    class_alias = {}
    for e in drug_map["entries"]:
        for c in e["class"]:
            class_alias.setdefault(c, []).extend(e["names"])
    for c, words in synonyms.items():
        class_alias.setdefault(c, []).extend(words)
    chunks = []
    for h in herbs_db["herbs"]:
        for kind in KINDS:
            for n, it in enumerate(h.get(kind, [])):
                cls = it.get("drug_class")
                extra = " ".join(class_alias.get(cls, [])) + " " + " ".join(it.get("drug_names", [])) + " " + (cls or "")
                label = conds.get(it.get("condition"), "") if it.get("condition") else ""
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
        "cond_alts": {code: _alts(label) for code, label in conds.items()},
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


def retrieve(query: str, index: dict, scope: set, top_k: int, min_score: float) -> list:
    """คะแนน = (น้ำหนัก idf ของ gram ในคำถามที่พบในรายการ) / (น้ำหนักรวมของ gram ทั้งหมดในคำถาม) เรียงคะแนนมาก->น้อย เท่ากันเรียงตามรหัส"""
    qg = grams(query)
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
