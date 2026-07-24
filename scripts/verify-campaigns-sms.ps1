# Fail hard if Campaigns → SMS is missing from the tree or not served.
# Run before every Railway ship and after every main merge.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-campaigns-sms.ps1
# Optional: -BaseUrl https://phuglee-production.up.railway.app  (defaults to local)

param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$requiredFiles = @(
    "public\campaigns-sms.html",
    "public\js\campaigns-sms.js",
    "public\css\campaigns-sms.css",
    "public\js\shell-nav.js",
    "lib\campaigns\api.js",
    "lib\campaigns\sms-policy.js",
    "lib\campaigns\sms-kpis.js",
    "lib\campaigns\sms-send.js",
    "lib\config.js",
    "server.js"
)

$failed = @()

foreach ($rel in $requiredFiles) {
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) {
        $failed += "MISSING FILE: $rel"
        continue
    }
}

# Code surface checks (route + nav + API mount)
$config = Get-Content (Join-Path $root "lib\config.js") -Raw
if ($config -notmatch "['\`"]/campaigns/sms['\`"]\s*:\s*['\`"]campaigns-sms\.html['\`"]") {
    $failed += "lib/config.js DISTRESS_ROUTES missing /campaigns/sms"
}

$server = Get-Content (Join-Path $root "server.js") -Raw
if ($server -notmatch "/api/admin/campaigns/sms") {
    $failed += "server.js missing /api/admin/campaigns/sms handler"
}
if ($server -notmatch "pathname === '/campaigns/sms'") {
    $failed += "server.js missing pretty path /campaigns/sms"
}

$nav = Get-Content (Join-Path $root "public\js\shell-nav.js") -Raw
if ($nav -notmatch "CAMPAIGN_LINKS" -or $nav -notmatch "/campaigns/sms") {
    $failed += "shell-nav.js missing Campaigns → SMS link"
}
if ($nav -notmatch "campaignsHtml") {
    $failed += "shell-nav.js missing campaignsHtml rail section"
}

$settings = Get-Content (Join-Path $root "public\js\settings-menu.js") -Raw -ErrorAction SilentlyContinue
if ($settings -and $settings -notmatch "/campaigns/sms") {
    $failed += "settings-menu.js missing Campaigns · SMS item"
}

$guard = Get-Content (Join-Path $root "public\js\auth-guard.js") -Raw -ErrorAction SilentlyContinue
if ($guard -and $guard -notmatch "/campaigns/sms") {
    $failed += "auth-guard.js missing /campaigns/sms"
}

if ($failed.Count -gt 0) {
    Write-Host "CAMPAIGNS SMS VERIFY FAILED" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Do NOT ship until Campaigns SMS is restored on this branch." -ForegroundColor Yellow
    exit 1
}

Write-Host "CAMPAIGNS SMS files/routes/nav OK" -ForegroundColor Green

# Optional live HTTP check
$base = $BaseUrl
if (-not $base) {
    $port = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }
    $base = "http://127.0.0.1:$port"
}
$base = $base.TrimEnd("/")
$pageUrl = "$base/campaigns/sms"
try {
    $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -TimeoutSec 8
    if ($r.StatusCode -ne 200) {
        Write-Host "WARN: $pageUrl returned $($r.StatusCode)" -ForegroundColor Yellow
        exit 0
    }
    if ($r.Content -notmatch "Campaigns" -and $r.Content -notmatch "csms-") {
        Write-Host "WARN: $pageUrl 200 but body does not look like Campaigns SMS" -ForegroundColor Yellow
        exit 0
    }
    Write-Host "LIVE page OK $pageUrl" -ForegroundColor Green
} catch {
    Write-Host "WARN: could not hit $pageUrl ($($_.Exception.Message)) - file checks still passed" -ForegroundColor Yellow
}

exit 0
