"""HerbGuard TTM prototype UI (Streamlit): กรอกข้อมูล -> ผลตรวจ -> ใบสรุปเภสัชกร
รัน: streamlit run app/app.py   (ข้อมูลผู้ใช้สมมติเท่านั้น ห้ามกรอกข้อมูลผู้ป่วยจริง)
ยังไม่มี LLM: ผู้ใช้เลือกจากรายการ; ข้อความมาจาก message_th ของธงโดยตรง
"""
import json
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))
from check import check  # noqa: E402
from summary import pharmacist_summary  # noqa: E402

load = lambda p: json.loads((ROOT / p).read_text(encoding="utf-8"))  # noqa: E731
HERBS, DRUGS, CONFIG, CONDS = load("data/herbs.json"), load("data/drug_class_map.json"), load("data/config.json"), load("data/conditions.json")["conditions"]
BY_ID = {h["id"]: h for h in HERBS["herbs"]}
DRUG_NAMES = sorted(n for e in DRUGS["entries"] for n in e["names"][:1])
SEV = {"avoid": ("ไม่ควรใช้ / ห้าม", st.error), "caution": ("ควรระวัง", st.warning), "info": ("ข้อมูล", st.info)}
NOT_CHECKED_TH = {"pregnancy": "การตั้งครรภ์", "breastfeeding": "การให้นมบุตร", "age": "อายุ"}

st.set_page_config(page_title="HerbGuard TTM", page_icon="🌿", layout="wide")
st.title("🌿 HerbGuard TTM")
st.caption("ตรวจธงเตือนการใช้สมุนไพรร่วมกับยา จากหนังสือแนวทางการใช้ยาสมุนไพรฯ (TTM first) · **ต้นแบบ ใช้ข้อมูลสมมติเท่านั้น**")


def coverage_box(cov):
    st.info(f"ขอบเขตของฐานข้อมูลนี้: สมุนไพร {cov['herbs_in_db']} ชนิด (จาก 50 ชนิดในเล่ม) · กลุ่มยา {cov['drug_classes_in_db']} กลุ่ม "
            "· ยาหรือสมุนไพรนอกฐานจะไม่ถูกตรวจ")


st.subheader("1) กรอกข้อมูล (สมมติ)")
with st.container():  # ไม่ใช้ st.form: ต้องให้ช่องส่วนที่ใช้/จำนวนวันโผล่ทันทีเมื่อเลือกสมุนไพร
    c1, c2 = st.columns(2)
    with c1:
        herb_ids = st.multiselect("สมุนไพรที่ใช้", list(BY_ID), format_func=lambda i: BY_ID[i]["name_th"])
        parts, days = {}, {}
        for i in herb_ids:
            a, b = st.columns(2)
            parts[i] = a.selectbox(f"ส่วนที่ใช้: {BY_ID[i]['name_th']}", BY_ID[i]["parts"], key=f"p_{i}")
            days[i] = b.number_input(f"ใช้ติดต่อกันกี่วัน: {BY_ID[i]['name_th']} (0 = ไม่ระบุ)", 0, 365, 0, key=f"d_{i}")
    with c2:
        drugs = st.multiselect("ยาที่ใช้ (ในตาราง)", DRUG_NAMES + ["cyclosporin", "saquinavir"])
        other_drugs = st.text_input("ยาอื่นที่ไม่อยู่ในรายการ (คั่นด้วยจุลภาค)", help="ยาที่ไม่อยู่ในตารางจะแสดงเป็น 'ยังไม่ได้ตรวจ' ระบบไม่เดา")
        age = st.number_input("อายุ (ปี) (0 = ไม่ระบุ)", 0, 120, 0)
        pregnant = st.checkbox("ตั้งครรภ์")
        breastfeeding = st.checkbox("ให้นมบุตร")
        conditions = st.multiselect("โรค/สภาวะ", list(CONDS), format_func=CONDS.get)
    submitted = st.button("ตรวจ", type="primary")

if "inp" not in st.session_state:
    st.session_state.inp = None
if submitted:
    profile = {"pregnant": pregnant, "breastfeeding": breastfeeding, "conditions": conditions}
    if age > 0:  # ไม่ระบุอายุ = ไม่ใส่คีย์ เพื่อให้ engine แสดง "ยังไม่ได้ตรวจ" แทนการเดา
        profile["age"] = age
    st.session_state.inp = {
        "herbs": [{"id": i, "part": parts[i], **({"days_in_use": days[i]} if days[i] else {})} for i in herb_ids],
        "drugs": drugs + [d.strip() for d in other_drugs.split(",") if d.strip()],
        "profile": profile,
    }

inp = st.session_state.inp
if inp is None:
    coverage_box({"herbs_in_db": len(BY_ID), "drug_classes_in_db": len({c for e in DRUGS["entries"] for c in e["class"]})})
    st.stop()
if not inp["herbs"]:
    st.warning("เลือกสมุนไพรอย่างน้อย 1 ชนิด")
    st.stop()

result = check(inp, HERBS, DRUGS, CONFIG, load("data/mechanism_tags.json")["tags"])
summary = pharmacist_summary(inp, result, HERBS, CONFIG)
cov = result["coverage"]

st.caption("ผลด้านล่างเป็นของข้อมูลที่กด 'ตรวจ' ล่าสุด หากแก้ข้อมูลด้านบน ให้กด 'ตรวจ' อีกครั้ง")
tab_result, tab_pharm = st.tabs(["2) ผลตรวจ", "3) ใบสรุปเภสัชกร"])

with tab_result:
    st.markdown(f"### {summary['headline_th']}")
    if summary["draft_notice_th"]:
        st.caption("⚠️ " + summary["draft_notice_th"])
    if result["pharmacist_review_required"]:
        st.error("แนะนำให้ปรึกษาเภสัชกรก่อนใช้ (มียากลุ่มที่ทีมกำหนดให้เภสัชกรทบทวน) · ดูแท็บใบสรุปเภสัชกร")
    for a in result["aggregates"]:
        label, box = SEV[a["severity"]]
        box(f"**ภาระความเสี่ยงรวม ({a['label_th']}) · {label}**\n\n{a['message_th']}")
    for f in result["flags"]:
        label, box = SEV[f["severity"]]
        box(f"**{label}** · {f['message_th']}\n\n"
            f"`{f['rule_id']}` · ชั้นหลักฐาน {f['evidence_tier']} · หน้า {f['source_page']} · "
            f"{'ตรวจแล้ว' if f['verified'] else 'ยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญ'}")
    if cov["unknown_inputs"]:
        st.warning("**ยังไม่ได้ตรวจ (ไม่มีในฐานข้อมูล):** " + ", ".join(cov["unknown_inputs"]) + " · ระบบไม่เดา โปรดปรึกษาเภสัชกร")
    if cov["not_checked"]:
        st.warning("**ไม่ได้ตรวจเงื่อนไข (ไม่ได้กรอก):** " + ", ".join(NOT_CHECKED_TH.get(c, c) for c in cov["not_checked"]))
    coverage_box(cov)
    st.caption(result["disclaimer_th"])

with tab_pharm:
    st.markdown("#### ใบสรุปสำหรับเภสัชกร")
    st.write("**สมุนไพร:** " + (", ".join(f"{h['name_th']} ({h['part']})" + (f" {h['days_in_use']} วัน" if h["days_in_use"] else "") for h in summary["herbs"]) or "-"))
    st.write("**ยา (ตามที่กรอก):** " + (", ".join(summary["drugs_as_entered"]) or "ไม่มี"))
    st.write("**ผู้ใช้:** " + json.dumps(inp["profile"], ensure_ascii=False))
    st.markdown("**ธงเรียงตามความรุนแรง**")
    for f in summary["flags"]:
        st.write(f"- [{f['severity']}] {f['message_th']} (ชั้น {f['evidence_tier']}, หน้า {f['source_page']}, "
                 f"{'verified' if f['verified'] else 'ยังไม่ verified'})")
    if not summary["flags"]:
        st.write(summary["headline_th"])
    st.markdown("**คำถามที่ควรถามต่อ** (ร่าง ผู้เชี่ยวชาญต้องตรวจ)")
    for q in summary["follow_up_questions_th"]:
        st.write(f"- {q}")
    st.write("**ยังไม่ได้ตรวจ:** " + (", ".join(summary["unknown_inputs"] + summary["not_checked"]) or "-"))
    coverage_box(cov)
    st.caption(summary["disclaimer_th"])
    st.download_button("ดาวน์โหลดใบสรุป (JSON)", json.dumps(summary, ensure_ascii=False, indent=2), "pharmacist_summary.json", "application/json")
