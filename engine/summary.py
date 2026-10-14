"""ใบสรุปเภสัชกร (docs/rules-spec.md) ประกอบจากผลตรวจด้วยโค้ดล้วน ไม่ใช้ LLM ไม่เพิ่มข้อเท็จจริง"""


from translate import en


def pharmacist_summary(inp: dict, result: dict, herbs: dict, config: dict) -> dict:
    names = {h["id"]: h["name_th"] for h in herbs["herbs"]}
    flags = result["flags"]  # เรียงตามความรุนแรงแล้วโดย check()
    return {
        "herbs": [{"id": s["id"], "name_th": names.get(s["id"]), **({"name_en": en(names[s["id"]])} if en(names.get(s["id"])) else {}), "part": s.get("part"), "days_in_use": s.get("days_in_use")}
                  for s in inp.get("herbs", [])],
        "drugs_as_entered": list(inp.get("drugs", [])),
        "flags": flags,
        "aggregates": result["aggregates"],
        "pharmacist_review_required": result["pharmacist_review_required"],
        "unknown_inputs": result["coverage"]["unknown_inputs"],
        "not_checked": result["coverage"]["not_checked"],
        "coverage": result["coverage"],
        "follow_up_questions_th": config["pharmacist_questions_th"]["value"],
        **({"follow_up_questions_en": [en(q) for q in config["pharmacist_questions_th"]["value"]]} if all(en(q) for q in config["pharmacist_questions_th"]["value"]) else {}),
        "headline_en": (f"{len(flags)} warning(s) found in this database" if flags
                        else "No warning found in this database (see the coverage limits below)"),
        "headline_th": (f"พบคำเตือน {len(flags)} รายการจากฐานข้อมูลนี้" if flags
                        else "ไม่พบคำเตือนในฐานข้อมูลนี้ (ดูขอบเขตความครอบคลุมด้านล่าง)"),
        "draft_notice_th": ("ข้อมูลบางรายการยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ (สถานะ: ร่าง)"
                            if any(not f["verified"] for f in flags) else None),
        "draft_notice_en": ("Some items have not been reviewed by experts yet (status: draft)"
                            if any(not f["verified"] for f in flags) else None),
        "disclaimer_th": result["disclaimer_th"],
        **({"disclaimer_en": result["disclaimer_en"]} if result.get("disclaimer_en") else {}),
    }
