# Deploy to Cloudflare (PowerShell). Runs step by step and stops at the first failure.
# Usage:  cd cloudflare ; .\deploy.ps1            (run `npx wrangler login` first; database_id must be set in wrangler.jsonc)
#         .\deploy.ps1 -SkipTests                 (skip the pytest steps; use if pytest is not installed. Install with: python -m pip install pytest)
#         .\deploy.ps1 -SkipSeed                  (skip reference-data seed: use after experts edited data in D1, otherwise seed overwrites their edits)
# This file is ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files that have no BOM.
param([switch]$SkipSeed, [switch]$SkipTests)
$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$root = Split-Path -Parent $PSScriptRoot

function Step($name, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host "== $name" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Step failed: $name" }
}

if ((Get-Content wrangler.jsonc -Raw) -match "REPLACE_WITH_D1_DATABASE_ID") {
  throw "database_id is not set in cloudflare\wrangler.jsonc (get it from: npx wrangler d1 create herbguard)"
}

if (-not $SkipTests) {
  python -c "import pytest" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "pytest is not installed. Run: python -m pip install pytest   (then .\deploy.ps1 again) or skip tests with: .\deploy.ps1 -SkipTests"
  }
  # engine/tests and cloudflare/tests must run separately (their conftest files clash when combined)
  # test_ui.py tests the old Streamlit prototype (needs streamlit installed) and is unrelated to this deployment, so it is skipped here
  Step "tests: engine"     { Push-Location $root; python -m pytest engine/tests -q --ignore=engine/tests/test_ui.py; $c = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $c }
  Step "tests: cloudflare" { Push-Location $root; python -m pytest cloudflare/tests -q; $c = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $c }
}
Step "build web"         { Push-Location "$root\web"; npm ci; if ($LASTEXITCODE -eq 0) { npm run build }; $c = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $c }
Step "build worker bundle and seed.sql" { python "$root\scripts\build_worker.py" }
Step "D1 migrations (create tables)"    { npx wrangler d1 migrations apply herbguard --remote }
if (-not $SkipSeed) {
  Step "seed reference data into D1"    { npx wrangler d1 execute herbguard --remote --file build/seed.sql }
}
Step "deploy" { npx wrangler deploy }

Write-Host ""
Write-Host "Done. Check the deployment (use the real URL printed by wrangler above, no angle brackets):" -ForegroundColor Green
Write-Host "  python ..\scripts\smoke_test.py https://herbguard-ttm.YOUR-SUBDOMAIN.workers.dev"
Write-Host "Set the AI key once (if not done yet): npx wrangler secret put GEMINI_API_KEY"
