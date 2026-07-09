# Verify Distress OS is reachable. Exit 0 only if health + home return 200.
# If down, start headless and re-check. Fail hard if still down.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\verify-live.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hostAddr = "127.0.0.1"
$port = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }
$healthUrl = "http://${hostAddr}:${port}/api/health"
$homeUrl = "http://${hostAddr}:${port}/"
$ensure = Join-Path $root "scripts\ensure-server.ps1"
$restart = Join-Path $root "scripts\restart.ps1"

function Test-Live {
    try {
        $h = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 4
        $p = Invoke-WebRequest -Uri $homeUrl -UseBasicParsing -TimeoutSec 6
        if ($h.StatusCode -eq 200 -and $p.StatusCode -eq 200) {
            return @{ ok = $true; health = $h.Content; home = $p.StatusCode }
        }
    } catch {}
    return @{ ok = $false }
}

$check = Test-Live
if ($check.ok) {
    Write-Host "LIVE ok health=200 home=200" -ForegroundColor Green
    Write-Host "  $homeUrl"
    Write-Host "  $healthUrl"
    if ($check.health) { Write-Host "  $($check.health)" }
    exit 0
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
    Write-Host "LIVE after ensure health=200 home=200" -ForegroundColor Green
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
        Write-Host "LIVE after restart health=200 home=200" -ForegroundColor Green
        Write-Host "  $homeUrl"
        exit 0
    }
}

Write-Host "FAILED: Distress OS not reachable at $homeUrl" -ForegroundColor Red
Write-Host "Check .logs\distress-os.log"
exit 1
