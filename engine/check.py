"""Rule engine แกน (R1, R2 ชั้น A, R4) ตาม docs/rules-spec.md (ข้อห้ามของตำรับเข้ามาทางแถวที่ formulas.py แปลงแล้ว ใช้ R1 เดิม)

ฟังก์ชันล้วน: check(inp, herbs, drug_map, config) -> result ไม่เรียก LLM ไม่มี side effect
ทำแล้ว: R1, R2 ชั้น A, R3, R4 (ใบสรุปอยู่ที่ summary.py) ยังไม่ทำ: R2 ชั้น C (ยังไม่มี effect_groups.json), R5, R6
"""

# profile key -> รหัส condition ในข้อมูลสมุนไพร (ที่เหลือใช้รหัสจาก profile.conditions ตรง ๆ)
PROFILE_FLAGS = {"pregnancy": "pregnant", "breastfeeding": "breastfeeding"}


def _norm(name: str) -> str:
    return name.strip().lower()


def _classes_for(drug: str, drug_map: dict) -> list[str] | None:
    for e in drug_map["entries"]:
        if _norm(drug) in [_norm(n) for n in e["names"]]:
            return e["class"]
    return None


DEFAULT_SOURCE_LABEL = "เล่มแนวทางฯ"


def _flag(rule_id, item, herb, evidence_tier="A", **extra):
    return {
        "rule_id": rule_id,
        "severity": item["level"],
        "evidence_tier": evidence_tier,
        "mechanism_tag": item.get("mechanism_tag"),
        "herb_id": herb["id"],
        "message_th": f"{herb.get('source_label_th', DEFAULT_SOURCE_LABEL)} ระบุ ({herb['name_th']}): {item['text']}",
        "source_page": item["source_page"],
        "pdf_page": item.get("pdf_page"),  # หน้าในไฟล์ PDF (หน้าพิมพ์ + 8) ไว้ให้ผู้ตรวจเปิดหาในเล่ม
        "evidence_quote": item.get("evidence_quote"),  # วลีสั้นจากหนังสือ ไว้ตรวจเทียบ (กฎข้อ 9: ห้ามยาว ดู test_data)
        "verified": item["verified"],
        # เอกสารต้นทางของหน้าที่อ้าง: มีเฉพาะธงของตำรับ (ธงสมุนไพรอ้างเล่ม TTM first เป็นค่าเริ่มต้นของหน้าเว็บ ผลเดิมไม่เปลี่ยน)
        **({"source_doc_th": herb["source_doc_th"]} if herb.get("source_doc_th") else {}),
        **extra,
    }


def _aggregates(flags: list, config: dict, tags: dict) -> list:
    """R3: นับ 'แหล่งไม่ซ้ำ' (สมุนไพรแต่ละตัว + กลุ่มยาแต่ละกลุ่ม) ต่อ mechanism_tag จากธง R1/R2/R4 ที่ระดับนับได้
    ไม่มีคะแนนตัวเลข: ผลคือจำนวนแหล่ง + ข้อความว่าเป็นการสรุปรวมโดยระบบ"""
    counted = config["aggregate_counts_severities"]["value"]
    order = config["severity_order"]
    groups: dict[str, dict] = {}
    for f in flags:
        if not f.get("mechanism_tag") or f["severity"] not in counted:
            continue
        g = groups.setdefault(f["mechanism_tag"], {"sources": set(), "flag_ids": [], "sev": f["severity"]})
        g["sources"].update(s for s in (f["herb_id"], f.get("drug_class")) if s)
        g["flag_ids"].append(f["flag_id"])
        if order.index(f["severity"]) < order.index(g["sev"]):
            g["sev"] = f["severity"]
    out = []
    for tag, g in groups.items():
        if len(g["sources"]) >= config["aggregate_threshold"]["value"]:
            label = tags.get(tag, tag)
            out.append({
                "mechanism_tag": tag, "label_th": label, "sources": sorted(g["sources"]), "count": len(g["sources"]),
                "severity": g["sev"], "flag_ids": g["flag_ids"],
                "message_th": f"สรุปรวมโดยระบบ จากธงที่มีแหล่งอ้างอิงแต่ละใบ: มี {len(g['sources'])} แหล่งที่เกี่ยวกับ \"{label}\" ({', '.join(sorted(g['sources']))}) ดูรายละเอียดที่ธงแต่ละใบ",
            })
    out.sort(key=lambda a: (order.index(a["severity"]), -a["count"], a["mechanism_tag"]))
    return out


def check(inp: dict, herbs: dict, drug_map: dict, config: dict, tags: dict | None = None) -> dict:
    """tags: {mechanism_tag: ชื่อไทย} จาก data/mechanism_tags.json (ไม่ส่ง = ใช้รหัสแท็กเป็นชื่อ)"""
    profile = inp.get("profile", {})
    by_id = {h["id"]: h for h in herbs["herbs"]}
    flags, unknown, not_checked = [], [], set()

    drug_classes: set[str] = set()
    for d in inp.get("drugs", []):
        cls = _classes_for(d, drug_map)
        if cls is None:
            unknown.append(d)
        else:
            drug_classes.update(cls)

    seen, group_days = set(), {}
    for sel in inp.get("herbs", []):
        h = by_id.get(sel["id"])
        if h is None:
            unknown.append(sel["id"])
            continue
        if sel["id"] in seen:  # สมุนไพรซ้ำ นับครั้งเดียว
            continue
        seen.add(sel["id"])

        # R1: ข้อห้ามตามเงื่อนไขผู้ใช้
        for c in h["contraindications"]:
            key = PROFILE_FLAGS.get(c["condition"])
            if key:
                if key not in profile:
                    not_checked.add(c["condition"])
                elif profile[key]:
                    flags.append(_flag("R1", c, h, condition=c["condition"]))
            elif c["condition"] in profile.get("conditions", []):
                flags.append(_flag("R1", c, h, condition=c["condition"]))
        for a in h["age_limits"]:
            cutoff = a["min_age_years"]
            if cutoff is None:  # เล่มไม่ระบุอายุเป็นตัวเลข ใช้เกณฑ์ที่ทีมตั้งใน config และบอกในข้อความ
                cutoff = config["child_age_cutoff_years"]["value"]
            if "age" not in profile:
                not_checked.add("age")
            elif profile["age"] < cutoff:
                f = _flag("R1", a, h, condition="age")
                if a["min_age_years"] is None:
                    f["message_th"] += f" (เล่มไม่ระบุอายุ ระบบใช้เกณฑ์ที่ทีมตั้ง: ต่ำกว่า {cutoff} ปี)"
                flags.append(f)
        for c in h["condition_cautions"]:
            if c["condition"] in profile.get("conditions", []):
                flags.append(_flag("R1", c, h, condition=c["condition"]))

        # R2 ชั้น A: สมุนไพร x กลุ่มยา (หรือชื่อยาที่เล่มระบุตรง ๆ)
        for dc in h["drug_cautions"]:
            names = [_norm(n) for n in dc.get("drug_names", [])]
            if dc.get("drug_class") in drug_classes or any(_norm(d) in names for d in inp.get("drugs", [])):
                flags.append(_flag("R2", dc, h, drug_class=dc.get("drug_class")))

        # R4: ระยะเวลา (กลุ่มเดียวกันใช้วันสูงสุดของสมาชิกที่ผู้ใช้เลือก)
        days = sel.get("days_in_use")
        for dl in h["duration_limits"]:
            if days is None:
                continue
            limit = dl["max_days"]
            if limit is None:
                lo, hi = dl["range_days"]
                limit = hi if config["r4_range_cutoff"]["value"] == "high" else lo
            if dl.get("group"):
                group_days[dl["group"]] = (max(days, group_days.get(dl["group"], (0,))[0]), limit, dl, h)
            elif days > limit:
                flags.append(_flag("R4", dl, h))
    for g, (days, limit, dl, h) in group_days.items():
        if days > limit:
            flags.append(_flag("R4", dl, h, group=g))

    order = config["severity_order"]
    flags.sort(key=lambda f: (order.index(f["severity"]), f["evidence_tier"], f["herb_id"], f["rule_id"]))
    for i, f in enumerate(flags, 1):
        f["flag_id"] = f"f{i}"

    return {
        "flags": flags,
        "aggregates": _aggregates(flags, config, tags or {}),
        "swaps": [],  # R6 ยังไม่ทำ
        "pharmacist_review_required": bool(drug_classes & set(config["pharmacist_review_classes"]["value"])),
        "coverage": {
            "herbs_in_db": sum(1 for h in by_id.values() if h.get("kind") != "formula"),  # ตำรับไม่นับเป็นสมุนไพรในขอบเขต
            "drug_classes_in_db": len({c for e in drug_map["entries"] for c in e["class"]}),
            "unknown_inputs": unknown,
            "not_checked": sorted(not_checked),
        },
        "disclaimer_th": config["disclaimer_th"],
    }
