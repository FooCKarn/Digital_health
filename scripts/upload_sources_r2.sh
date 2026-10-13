#!/usr/bin/env bash
# เก็บไฟล์ต้นฉบับ (PDF/txt ที่ถูก .gitignore) ไว้ใน Cloudflare R2 ของบัญชีเดียวกับ Worker (เอกสารเป็นลิขสิทธิ์ของหน่วยงานต้นทาง: bucket เป็นส่วนตัว ไม่เปิดสาธารณะ)
# ใช้:  scripts/upload_sources_r2.sh <โฟลเดอร์ที่มีไฟล์ 5 ไฟล์>     ต้อง `npx wrangler login` (หรือตั้ง CLOUDFLARE_API_TOKEN ที่มีสิทธิ์ R2:Edit) และเปิด R2 ในแดชบอร์ดก่อน
# ไม่ผูก bucket เข้ากับ Worker (Worker ไม่ต้องอ่านไฟล์เหล่านี้ และถ้าผูกไว้ก่อนเปิด R2 การ deploy จะล้ม)
set -euo pipefail
SRC="${1:?ระบุโฟลเดอร์ที่มีไฟล์ต้นฉบับ}"
BUCKET="${R2_SOURCES_BUCKET:-herbguard-sources}"
cd "$(dirname "$0")/../cloudflare"
npx --yes wrangler@4 r2 bucket create "$BUCKET" 2>/dev/null || echo "bucket $BUCKET มีอยู่แล้ว (ข้าม)"
# ชื่อไฟล์ไทย -> คีย์ ASCII ที่คงที่ (ตรงกับ docs/source-files.md)
declare -A KEYS=(
  ["health_profile_publish_2568.pdf"]="sources/health_profile_publish_2568.pdf"
  ["เกณฑ์มาตรฐานและกรรมวิธีการแพทย์แผนไทย.pdf"]="sources/ttm_practice_standards_2562.pdf"
  ["แนวทางการรักษาอาการเจ็บป่วยด้วยยาสมุนไพรใน.pdf.txt"]="sources/primary_care_herbal_guideline_2568.txt"
  ["รหัสยาแผนไทย 24 หลัก.pdf"]="sources/ttm_drug_code24_2568.pdf"
  ["แนวทางการตั้งตำรับยาบำรุงโลหิต.pdf"]="sources/blood_tonic_formula_guideline.pdf"
)
for f in "${!KEYS[@]}"; do
  [ -f "$SRC/$f" ] || { echo "ไม่พบ $SRC/$f" >&2; exit 1; }
  npx --yes wrangler@4 r2 object put "$BUCKET/${KEYS[$f]}" --file "$SRC/$f" --remote
done
echo "เสร็จ: $(printf '%s ' "${KEYS[@]}")"
