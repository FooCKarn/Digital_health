# ขึ้นระบบ Cloudflare (PowerShell): รันทีละขั้น หยุดทันทีถ้าขั้นไหนพัง
# ใช้:  cd cloudflare ; .\deploy.ps1            (ต้องผ่าน npx wrangler login แล้ว และใส่ database_id ใน wrangler.jsonc แล้ว)
#       .\deploy.ps1 -SkipSeed                  (ข้ามการ seed ข้อมูลอ้างอิง: ใช้หลังมีผู้เชี่ยวชาญแก้ข้อมูลใน D1 แล้ว ไม่งั้น seed จะทับการแก้)
param([switch]$SkipSeed)
$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$root = Split-Path -Parent $PSScriptRoot

function Step($name, [scriptblock]$cmd) {
  Write-Host "`n== $name" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "ขั้นตอนไม่สำเร็จ: $name" }
}

if ((Get-Content wrangler.jsonc -Raw) -match "REPLACE_WITH_D1_DATABASE_ID") {
  throw "ยังไม่ได้ใส่ database_id ใน cloudflare\wrangler.jsonc (ได้จาก: npx wrangler d1 create herbguard)"
}

Step "ทดสอบก่อนขึ้น (engine + cloudflare)" { Push-Location $root; python -m pytest engine/tests cloudflare/tests -q; $c = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $c }
Step "build เว็บ"                          { Push-Location "$root\web"; npm ci; if ($LASTEXITCODE -eq 0) { npm run build }; $c = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $c }
Step "สร้าง build\ และ seed.sql"           { python "$root\scripts\build_worker.py" }
Step "สร้างตารางใน D1 (migrations)"         { npx wrangler d1 migrations apply herbguard --remote }
if (-not $SkipSeed) {
  Step "นำเข้าข้อมูลอ้างอิง (seed)"          { npx wrangler d1 execute herbguard --remote --file build/seed.sql }
}
Step "deploy"                              { npx wrangler deploy }

Write-Host "`nเสร็จแล้ว ตรวจหลังขึ้นระบบด้วย (ใส่ URL ที่ wrangler แสดง):" -ForegroundColor Green
Write-Host "  python ..\scripts\smoke_test.py https://herbguard-ttm.<บัญชีของคุณ>.workers.dev"
Write-Host "ตั้ง API key ของ AI (ครั้งเดียว): npx wrangler secret put GEMINI_API_KEY"
