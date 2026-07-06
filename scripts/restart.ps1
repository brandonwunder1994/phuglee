# Distress OS - stop stale servers and start fresh
# Usage: powershell -ExecutionPolicy Bypass -File scripts\restart.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ports = @(3000, 8787, 3456)
$hostAddr = if ($env:DISTRESS_OS_HOST) { $env:DISTRESS_OS_HOST } else { "127.0.0.1" }
$distressPort = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }

function Stop-PortListener {
    param([int]$Port)
    $procIds = @()
    try {
        $procIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        $lines = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"
        foreach ($line in $lines) {
            $procIds += [int]($line -split '\s+')[-1]
        }
    }
    foreach ($procId in ($procIds | Sort-Object -Unique)) {
        if ($procId -and $procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped PID $procId on port $Port"
        }
    }
}

Write-Host ""
Write-Host "Distress OS - restarting services" -ForegroundColor Yellow
Write-Host "Root: $root"
Write-Host ""

Write-Host "Stopping listeners on ports $($ports -join ', ')..." -ForegroundColor Cyan
foreach ($port in $ports) { Stop-PortListener -Port $port }
Start-Sleep -Seconds 1

Set-Location $root
$logDir = Join-Path $root ".logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "distress-os.log"

# Launch via cmd with shell log redirection (keeps stdio valid; avoids EPIPE crashes from module spawns).
$launchCmd = "cd /d `"$root`" && node server.js >> `"$logFile`" 2>>&1"
$nodeProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", $launchCmd `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

Write-Host "Started Distress OS (PID $($nodeProc.Id))" -ForegroundColor Green
Write-Host "Log: $logFile"

$healthUrl = "http://${hostAddr}:${distressPort}/api/health"
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        if ($res.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # still starting
    }
}

Write-Host ""
if ($ready) {
    Write-Host "Distress OS is up: http://${hostAddr}:${distressPort}/" -ForegroundColor Green
    Write-Host "Collect Records: http://${hostAddr}:${distressPort}/collect" -ForegroundColor Green
    Write-Host "Health: $healthUrl" -ForegroundColor DarkGray
    exit 0
}

Write-Host "Distress OS did not respond within 45s. Check $logFile" -ForegroundColor Red
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Last log lines:" -ForegroundColor DarkGray
    Get-Content $logFile -Tail 20
}
exit 1