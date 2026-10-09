"""ตัวถอดรหัสยาแผนไทย 24 หลัก (คู่มือรหัสยาแผนไทย 24 หลัก สถาบันการแพทย์แผนไทย) ตามโครงสร้างใน data/ttm_code24.json

ฟังก์ชันล้วน: decode(code, doc) -> ผลถอดรหัส ไม่เรียก LLM ไม่มี side effect ไม่ตัดสินความเสี่ยงใด ๆ
ไม่เดา: ความยาว/ตัวเลข/หลักที่กำหนดตายตัว/รหัสรูปแบบยาที่ไม่อยู่ในตาราง = ใช้ไม่ได้ พร้อมเหตุผล
ไม่มีตารางรหัสตัวยาสำคัญ (คู่มือเก็บไว้ในไฟล์ภายนอก) จึงคืนรหัส 9 หลักตามที่รับมา ไม่แปลเป็นชื่อสมุนไพร
"""

_FORMULA = {"1": "ยาเดี่ยว", "2": "ยาตำรับ"}


def _strength(code: str, groups: dict, special: dict, errors: list) -> dict | None:
    five = code[11:16]
    if five in special:
        return {"kind": "special", "text_th": special[five], "raw": five}
    if code[11] != "9":
        errors.append("หลักที่ 12 ต้องเป็น 9 (ขนาดความแรงของยาแผนไทย)")
        return None
    g, digits = code[12], code[13:16]
    if g not in groups:
        errors.append("หลักที่ 13 ต้องเป็น 1-6 (กลุ่มยาตามความแรง)")
        return None
    unit = groups[g]["unit"]
    n = int(digits)
    percent = unit.startswith("%")
    if percent and digits[0] == "9":  # หลักที่ 14 เป็น 9 = จุดทศนิยม (ความเข้มข้นน้อยกว่า 1%)
        value, text = int(digits[1:]) / 100, f"{int(digits[1:]) / 100:g} {unit}"
        if int(digits[1:]) == 0:
            errors.append("ความแรงทศนิยมต้องมีตัวเลขหลักที่ 15-16 ตั้งแต่ 01")
            return None
    else:
        top = 100 if percent else 999
        if not 1 <= n <= top:
            errors.append(f"ขนาดความแรงต้องอยู่ระหว่าง 1-{top} ({groups[g]['range_th']})")
            return None
        value, text = n, f"{n} {unit}"
    return {"kind": "value", "value": value, "unit": unit, "group": g, "text_th": text, "raw": code[11:16]}


def decode(code: str, doc: dict) -> dict:
    """คืน {"valid": bool, "errors": [...], "fields": {...}} ; fields มีเฉพาะส่วนที่ถอดได้ถูกต้อง"""
    errors: list[str] = []
    if not isinstance(code, str) or not code.isascii() or not code.isdigit() or len(code) != doc["length"]:
        return {"valid": False, "errors": [f"รหัสต้องเป็นตัวเลข {doc['length']} หลักเท่านั้น"], "fields": {}}
    f = {f["id"]: f for f in doc["fields"]}
    fields: dict = {}

    if code[0] != f["drug_type"]["fixed"]:
        errors.append("หลักที่ 1 ต้องเป็น 4 (ยาแผนไทย)")
    else:
        fields["drug_type_th"] = f["drug_type"]["fixed_meaning_th"]
    if code[1] not in _FORMULA:
        errors.append("หลักที่ 2 ต้องเป็น 1 (ยาเดี่ยว) หรือ 2 (ยาตำรับ)")
    else:
        fields["formula_type"] = {"code": code[1], "name_th": _FORMULA[code[1]]}
    fields["main_ingredient_code"] = code[2:11]  # ไม่แปลเป็นชื่อ: ไม่มีตารางรหัสตัวยาในข้อมูลนี้

    s = _strength(code, f["strength_group"]["values"], f["strength_special"]["values"], errors)
    if s:
        fields["strength"] = s

    forms = {d["code"]: d["name_th"] for d in doc["dosage_forms"]}
    if code[16:19] not in forms:
        errors.append(f"ไม่พบรหัสรูปแบบยา {code[16:19]} ในตาราง 35 รูปแบบ")
    else:
        fields["dosage_form"] = {"code": code[16:19], "name_th": forms[code[16:19]]}
    fields["manufacturer_code"] = code[19:24]
    return {"valid": not errors, "errors": errors, "fields": fields}
