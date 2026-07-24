# Verify Distress OS is reachable. Exit 0 only if health + home return 200.
# If down, start headless and re-check. Fail hard if still down.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\verify-live.ps1
# Optional deep check (modules must be up): -Deep  OR  $env:VERIFY_DEEP=1
# Note: /api/health stays shallow (always 200) for Railway; /api/health/deep returns
# non-200 when Form Forge or Property Analyzer are down.

param(
    [switch]$Deep
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hostAddr = "127.0.0.1"
$port = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }
$healthUrl = "http://${hostAddr}:${port}/api/health"
$deepUrl = "http://${hostAddr}:${port}/api/health/deep"
$homeUrl = "http://${hostAddr}:${port}/"
$ensure = Join-Path $root "scripts\ensure-server.ps1"
$restart = Join-Path $root "scripts\restart.ps1"
$wantDeep = $Deep -or ($env:VERIFY_DEEP -eq "1") -or ($env:VERIFY_DEEP -eq "true")

function Test-Live {
    try {
        $h = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 4
        $p = Invoke-WebRequest -Uri $homeUrl -UseBasicParsing -TimeoutSec 6
        if ($h.StatusCode -eq 200 -and $p.StatusCode -eq 200) {
            $deepStatus = $null
            $deepBody = $null
            if ($wantDeep) {
                try {
                    $d = Invoke-WebRequest -Uri $deepUrl -UseBasicParsing -TimeoutSec 8
                    $deepStatus = [int]$d.StatusCode
                    $deepBody = $d.Content
                    if ($deepStatus -ne 200) {
                        return @{ ok = $false; reason = "deep=$deepStatus"; health = $h.Content; deep = $deepBody }
                    }
                } catch {
                    $code = $null
                    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
                    $deepLabel = if ($code) { "$code" } else { "error" }
                    return @{ ok = $false; reason = "deep=$deepLabel"; health = $h.Content }
                }
            }
            return @{ ok = $true; health = $h.Content; home = $p.StatusCode; deep = $deepBody; deepStatus = $deepStatus }
        }
    } catch {}
    return @{ ok = $false }
}

$check = Test-Live
if ($check.ok) {
    $deepNote = if ($wantDeep) { " deep=200" } else { "" }
    Write-Host "LIVE ok health=200 home=200$deepNote" -ForegroundColor Green
    Write-Host "  $homeUrl"
    Write-Host "  $healthUrl"
    if ($wantDeep) { Write-Host "  $deepUrl" }
    if ($check.health) { Write-Host "  $($check.health)" }
    if ($wantDeep -and $check.deep) { Write-Host "  deep: $($check.deep)" }
    # Campaigns SMS must never silently disappear from the tree or route table
    $campaignsVerify = Join-Path $root "scripts\verify-campaigns-sms.ps1"
    if (Test-Path $campaignsVerify) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $campaignsVerify | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Campaigns SMS verify failed — fix before claiming live/ship." -ForegroundColor Red
            exit 1
        }
    }
    exit 0
}

if ($check.reason -like "deep=*") {
    Write-Host "Shallow health OK but deep check failed ($($check.reason))." -ForegroundColor Yellow
    Write-Host "  $deepUrl"
    if ($check.deep) { Write-Host "  $($check.deep)" }
    Write-Host "Modules may still be booting - retry with -Deep after a few seconds." -ForegroundColor Yellow
}

Write-Host "Server down - ensuring headless start..." -ForegroundColor Yellow
if (Test-Path $ensure) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ensure | Out-Host
} elseif (Test-Path $restart) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $restart | Out-Host
} else {
    Write-Host "Missing ensure-server.ps1 / restart.ps1" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 2
$check = Test-Live
if ($check.ok) {
    $deepNote = if ($wantDeep) { " deep=200" } else { "" }
    Write-Host "LIVE after ensure health=200 home=200$deepNote" -ForegroundColor Green
    Write-Host "  $homeUrl"
    exit 0
}

# Last resort: full restart
if (Test-Path $restart) {
    Write-Host "Still down - full restart..." -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File $restart | Out-Host
    Start-Sleep -Seconds 3
    $check = Test-Live
    if ($check.ok) {
        $deepNote = if ($wantDeep) { " deep=200" } else { "" }
        Write-Host "LIVE after restart health=200 home=200$deepNote" -ForegroundColor Green
        Write-Host "  $homeUrl"
        exit 0
    }
}

Write-Host "FAILED: Distress OS not reachable at $homeUrl" -ForegroundColor Red
Write-Host "Check .logs\distress-os.log"
exit 1
