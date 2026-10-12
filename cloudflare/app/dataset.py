"""แปลงชุดข้อมูลอ้างอิงของ engine (data/*.json) <-> แถวในตาราง D1 โดยไม่สูญเสียข้อมูล (round-trip ตรงกันทุกฟิลด์)

ไม่มี I/O และไม่ขึ้นกับ Cloudflare: encode_datasets() ได้ {ตาราง: [แถว]} สำหรับสร้างไฟล์ seed,
decode_datasets() รับแถวที่ SELECT มาแล้วคืนโครงสร้างเดิมให้ service.configure() ใช้
กติกา: ไม่เติม ไม่แก้ ไม่ตั้ง verified ใด ๆ แค่ย้ายรูปแบบ (กฎข้อ 1-2 ของโปรเจกต์)
"""
import hashlib
import json

ENGINE_KEYS = ("herbs", "drug_class_map", "config", "conditions", "mechanism_tags", "formula_guidelines")
HERB_KINDS = ("contraindications", "age_limits", "drug_cautions", "condition_cautions", "duration_limits", "notes")
HERB_REQUIRED = HERB_KINDS[:5]          # ทุกสมุนไพรมีลิสต์เหล่านี้เสมอ (notes ไม่บังคับ)
FORMULA_KINDS = ("contraindications", "condition_cautions", "notes")
FORMULA_REQUIRED = FORMULA_KINDS[:2]

# คีย์ในกฎ -> คอลัมน์ (ที่เหลือเข้า extra)
HERB_RULE_COLS = {"level": "level", "text": "text", "condition": "condition", "drug_class": "drug_class", "mechanism_tag": "mechanism_tag",
                  "evidence_tier": "evidence_tier", "evidence_quote": "evidence_quote", "source_page": "source_page", "pdf_page": "pdf_page",
                  "verified": "verified", "verified_by": "verified_by", "min_age_years": "min_age_years", "max_days": "max_days",
                  "group": "grp", "team_note": "team_note"}
FORMULA_RULE_COLS = {k: v for k, v in HERB_RULE_COLS.items() if k not in ("min_age_years", "max_days", "group", "team_note")}
FORMULA_RULE_COLS["id"] = "rule_key"
BOOL_KEYS = {"verified"}

# ลำดับที่ใช้ตอน INSERT (แม่ก่อนลูก) และตอนลบ (ลูกก่อนแม่)
TABLE_ORDER = ("herbs", "herb_rules", "formulas", "formula_rules", "drug_entries", "conditions", "mechanism_tags", "config", "ref_docs")


def _j(v):
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"), sort_keys=False)


def data_version(datasets: dict, reference: dict | None = None) -> str:
    blob = json.dumps({"engine": datasets, "reference": reference or {}}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ---------- กฎรายแถว ----------
def _encode_rule(rule: dict, cols: dict) -> dict:
    row, extra, nulls = {c: None for c in cols.values()}, {}, []
    for k, v in rule.items():
        c = cols.get(k)
        if c is None:
            extra[k] = v
        elif v is None:
            nulls.append(k)
        else:
            row[c] = int(v) if k in BOOL_KEYS else v
    row["extra"] = _j(extra) if extra else None
    row["null_keys"] = _j(nulls) if nulls else None
    return row


def _decode_rule(row: dict, cols: dict) -> dict:
    out = {}
    for k, c in cols.items():
        v = row.get(c)
        if v is not None:
            out[k] = bool(v) if k in BOOL_KEYS else v
    for k in json.loads(row["null_keys"]) if row.get("null_keys") else []:
        out[k] = None
    out.update(json.loads(row["extra"]) if row.get("extra") else {})
    return out


def _split_kinds(item: dict, kinds: tuple, required: tuple):
    """คืน (ส่วนที่ไม่ใช่กฎ, {kind: [กฎ]}, kind ที่มีคีย์อยู่แต่ว่างและไม่บังคับ)"""
    rest = {k: v for k, v in item.items() if k not in kinds}
    lists = {k: item[k] for k in kinds if k in item}
    empty = [k for k, v in lists.items() if not v and k not in required]
    return rest, lists, empty


# ---------- encode ----------
def encode_datasets(d: dict, reference: dict | None = None) -> dict:
    t: dict[str, list] = {name: [] for name in TABLE_ORDER}
    docs = {}

    for pos, h in enumerate(d["herbs"]["herbs"]):
        rest, lists, empty = _split_kinds(h, HERB_KINDS, HERB_REQUIRED)
        for need in ("id", "name_th", "parts", "source", "verified"):
            if need not in rest:
                raise ValueError(f"สมุนไพร {h.get('id')} ไม่มีฟิลด์ {need}")
        extra = {k: v for k, v in rest.items() if k not in ("id", "no", "name_th", "parts", "source", "verified", "verified_by")}
        if "verified_by" in rest and rest["verified_by"] is None:
            extra["verified_by"] = None
        if empty:
            extra["_empty_kinds"] = empty
        t["herbs"].append({"id": h["id"], "pos": pos, "no": h.get("no"), "name_th": h["name_th"], "parts": _j(h["parts"]), "source": _j(h["source"]),
                           "verified": int(h["verified"]), "verified_by": h.get("verified_by"), "extra": _j(extra) if extra else None})
        for kind, rules in lists.items():
            for p, r in enumerate(rules):
                t["herb_rules"].append({"herb_id": h["id"], "kind": kind, "pos": p, **_encode_rule(r, HERB_RULE_COLS)})

    fg = d["formula_guidelines"]
    docs["formula_guidelines.top"] = {k: v for k, v in fg.items() if k != "formulas"}
    for pos, f in enumerate(fg["formulas"]):
        rest, lists, empty = _split_kinds(f, FORMULA_KINDS, FORMULA_REQUIRED)
        body = {k: v for k, v in rest.items() if k not in ("id", "name_th", "verified", "verified_by")}
        if "verified_by" in rest and rest["verified_by"] is None:
            body["_verified_by_null"] = True
        if empty:
            body["_empty_kinds"] = empty
        t["formulas"].append({"id": f["id"], "pos": pos, "name_th": f["name_th"], "verified": int(f["verified"]), "verified_by": f.get("verified_by"), "body": _j(body)})
        for kind, rules in lists.items():
            for p, r in enumerate(rules):
                t["formula_rules"].append({"formula_id": f["id"], "kind": kind, "pos": p, **_encode_rule(r, FORMULA_RULE_COLS)})

    dm = d["drug_class_map"]
    docs["drug_class_map.top"] = {k: v for k, v in dm.items() if k != "entries"}
    for pos, e in enumerate(dm["entries"]):
        extra = {k: v for k, v in e.items() if k not in ("names", "class", "verified", "verified_by")}
        if "verified_by" in e and e["verified_by"] is None:
            extra["verified_by"] = None
        t["drug_entries"].append({"pos": pos, "names": _j(e["names"]), "classes": _j(e["class"]), "verified": int(e.get("verified", False)),
                                  "verified_by": e.get("verified_by"), "extra": _j(extra) if extra else None})

    for table, key in (("conditions", "conditions"), ("mechanism_tags", "tags")):
        top = d[table]
        docs[f"{table}.top"] = {k: v for k, v in top.items() if k != key}
        for pos, (k, label) in enumerate(top[key].items()):
            t[table].append({"id": k, "pos": pos, "label_th": label})

    for pos, (k, v) in enumerate(d["config"].items()):
        wrapped = isinstance(v, dict) and set(v) == {"value", "note"}
        t["config"].append({"key": k, "pos": pos, "value": _j(v["value"] if wrapped else v), "note": v["note"] if wrapped else None, "wrapped": int(wrapped)})

    docs.update(reference or {})
    for name, doc in docs.items():
        t["ref_docs"].append({"name": name, "doc": _j(doc)})
    return t


# ---------- decode ----------
def decode_datasets(t: dict) -> tuple[dict, dict]:
    """คืน (ชุดข้อมูลที่ engine ใช้, เอกสารอ้างอิง) เรียงตาม pos ถ้าแถวมาไม่เรียง"""
    srt = lambda rows: sorted(rows, key=lambda r: r["pos"])  # noqa: E731
    docs = {r["name"]: json.loads(r["doc"]) for r in t["ref_docs"]}

    def group(rows, fk):
        g: dict = {}
        for r in sorted(rows, key=lambda r: (r[fk], r["kind"], r["pos"])):
            g.setdefault(r[fk], {}).setdefault(r["kind"], []).append(r)
        return g

    hr, fr = group(t["herb_rules"], "herb_id"), group(t["formula_rules"], "formula_id")

    herbs = []
    for r in srt(t["herbs"]):
        extra = json.loads(r["extra"]) if r["extra"] else {}
        empty = extra.pop("_empty_kinds", [])
        h = {"id": r["id"]}
        if r["no"] is not None:
            h["no"] = r["no"]
        h.update(name_th=r["name_th"], parts=json.loads(r["parts"]), source=json.loads(r["source"]), verified=bool(r["verified"]))
        if r["verified_by"] is not None:
            h["verified_by"] = r["verified_by"]
        h.update(extra)
        for kind in HERB_KINDS:
            rows = hr.get(r["id"], {}).get(kind)
            if rows:
                h[kind] = [_decode_rule(x, HERB_RULE_COLS) for x in rows]
            elif kind in HERB_REQUIRED or kind in empty:
                h[kind] = []
        herbs.append(h)

    formulas = []
    for r in srt(t["formulas"]):
        body = json.loads(r["body"])
        empty = body.pop("_empty_kinds", [])
        vnull = body.pop("_verified_by_null", False)
        f = {"id": r["id"], "name_th": r["name_th"], "verified": bool(r["verified"])}
        if r["verified_by"] is not None:
            f["verified_by"] = r["verified_by"]
        elif vnull:
            f["verified_by"] = None
        f.update(body)
        for kind in FORMULA_KINDS:
            rows = fr.get(r["id"], {}).get(kind)
            if rows:
                f[kind] = [_decode_rule(x, FORMULA_RULE_COLS) for x in rows]
            elif kind in FORMULA_REQUIRED or kind in empty:
                f[kind] = []
        formulas.append(f)

    entries = []
    for r in srt(t["drug_entries"]):
        e = {"names": json.loads(r["names"]), "class": json.loads(r["classes"]), "verified": bool(r["verified"])}
        if r["verified_by"] is not None:
            e["verified_by"] = r["verified_by"]
        e.update(json.loads(r["extra"]) if r["extra"] else {})
        entries.append(e)

    def top(name):
        return dict(docs.pop(name, {}))

    d = {
        "herbs": {"herbs": herbs},
        "drug_class_map": {**top("drug_class_map.top"), "entries": entries},
        "conditions": {**top("conditions.top"), "conditions": {r["id"]: r["label_th"] for r in srt(t["conditions"])}},
        "mechanism_tags": {**top("mechanism_tags.top"), "tags": {r["id"]: r["label_th"] for r in srt(t["mechanism_tags"])}},
        "formula_guidelines": {**top("formula_guidelines.top"), "formulas": formulas},
        "config": {r["key"]: ({"value": json.loads(r["value"]), "note": r["note"]} if r["wrapped"] else json.loads(r["value"])) for r in srt(t["config"])},
    }
    return d, docs


# ---------- SQL (สำหรับ wrangler d1 execute --file) ----------
def sql_literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def render_seed_sql(tables: dict, version: str) -> str:
    """ลบข้อมูลอ้างอิงเดิมทั้งหมดแล้วใส่ชุดนี้แทน (รันซ้ำได้) ไม่แตะตารางผู้ใช้"""
    out = ["-- สร้างโดย scripts/build_worker.py (ไม่แก้ด้วยมือ): ข้อมูลอ้างอิงจาก data/*.json", "PRAGMA foreign_keys = ON;"]
    out += [f"DELETE FROM {name};" for name in reversed(TABLE_ORDER)]
    for name in TABLE_ORDER:
        for row in tables[name]:
            cols = ", ".join(row)
            out.append(f"INSERT INTO {name} ({cols}) VALUES ({', '.join(sql_literal(v) for v in row.values())});")
    out.append(f"UPDATE ref_meta SET value = {sql_literal(version)} WHERE key = 'data_version';")
    return "\n".join(out) + "\n"


SELECTS = {name: f"SELECT * FROM {name}" for name in TABLE_ORDER}
