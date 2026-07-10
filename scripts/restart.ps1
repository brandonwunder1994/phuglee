# Distress OS - stop stale servers and start headless (no console window).
# Also registers a keep-alive scheduled task so the server stays up.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\restart.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ports = @(3000, 8787, 3456)
$hostAddr = "127.0.0.1"
$distressPort = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }
$taskName = "PhugleeDistressOS"
$vbs = Join-Path $root "scripts\run-hidden.vbs"
$ensurePs1 = Join-Path $root "scripts\ensure-server.ps1"

function Stop-PortListener {
    param([int]$Port)
    $procIds = @()
    try {
        $procIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        $lines = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"
        foreach ($line in $lines) {
            $procIds += [int](($line.ToString() -split '\s+')[-1])
        }
    }
    foreach ($procId in ($procIds | Sort-Object -Unique)) {
        if ($procId -and $procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped PID $procId on port $Port"
        }
    }
}

function Get-ListenerPid {
    param([int]$Port)
    try {
        $id = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -First 1
        if ($id) { return [int]$id }
    } catch {}
    return $null
}

function Register-KeepAliveTask {
    # Pure VBS keep-alive — NEVER powershell.exe (Task Scheduler still flashes a
    # console for Hidden PowerShell every 2 minutes). wscript //B is silent.
    $ensureVbs = Join-Path $root "scripts\ensure-server-hidden.vbs"
    if (-not (Test-Path $ensureVbs)) {
        Write-Host "Missing $ensureVbs — keep-alive not registered" -ForegroundColor DarkYellow
        return $false
    }
    $tr = "wscript.exe //B //Nologo `"$ensureVbs`""
    try {
        # Replace any old PowerShell-based task
        schtasks /Delete /TN $taskName /F 2>$null | Out-Null
        schtasks /Create /TN $taskName /TR $tr /SC MINUTE /MO 2 /F /RL LIMITED 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Keep-alive task registered: $taskName (every 2 min, silent wscript)" -ForegroundColor DarkGray
            return $true
        }
    } catch {}
    Write-Host "Could not register keep-alive task (optional). Server still starts now." -ForegroundColor DarkYellow
    return $false
}

Write-Host ""
Write-Host "Distress OS - restarting (headless, no window)" -ForegroundColor Yellow
Write-Host "Root: $root"
Write-Host ""

Write-Host "Stopping listeners on ports $($ports -join ', ')..." -ForegroundColor Cyan
foreach ($port in $ports) { Stop-PortListener -Port $port }

Get-Process cmd -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match 'Distress OS'
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Closed leftover console PID $($_.Id)"
}

Start-Sleep -Seconds 1

$logDir = Join-Path $root ".logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "distress-os.log"
$pidFile = Join-Path $logDir "distress-os.pid"

try {
    Add-Content -Path $logFile -Value "=== restart $(Get-Date -Format o) ===" -Encoding utf8 -ErrorAction SilentlyContinue
} catch {}

if (-not (Test-Path $vbs)) {
    Write-Host "Missing $vbs" -ForegroundColor Red
    exit 1
}

# Launch OUTSIDE this process tree / Job Object via wscript only.
# NEVER Win32_Process.Create(cmd.exe) — that flashes a black terminal.
# NEVER bare powershell keep-alive — Task Scheduler flashes those too.
function Start-DetachedNode {
    if (-not (Test-Path $vbs)) {
        Write-Host "Missing $vbs" -ForegroundColor Red
        return $false
    }
    Start-Process -FilePath "wscript.exe" `
        -ArgumentList @("//B", "//Nologo", $vbs) `
        -WindowStyle Hidden `
        -WorkingDirectory $root | Out-Null
    Write-Host "Started headless via wscript + run-hidden.vbs (no console)" -ForegroundColor Green
    return $true
}

[void](Start-DetachedNode)
Write-Host "Log: $logFile"

Register-KeepAliveTask | Out-Null

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
    } catch {}
}

$listenPid = Get-ListenerPid -Port $distressPort
if ($listenPid) {
    Set-Content -Path $pidFile -Value $listenPid -Encoding ascii
    Write-Host "PID file: $pidFile (node $listenPid)"
}

Write-Host ""
if ($ready) {
    Write-Host "Distress OS is up (background, no terminal):" -ForegroundColor Green
    Write-Host "  http://127.0.0.1:${distressPort}/"
    Write-Host "  http://localhost:${distressPort}/"
    Write-Host "  Health: $healthUrl" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Stop: powershell -File scripts\stop.ps1" -ForegroundColor DarkGray
    exit 0
}

Write-Host "Distress OS did not respond within 45s. Check $logFile" -ForegroundColor Red
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Last log lines:" -ForegroundColor DarkGray
    Get-Content $logFile -Tail 20
}
exit 1
