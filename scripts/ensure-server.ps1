# Ensure Distress OS is listening. Start headless if not.
# Safe to run repeatedly (scheduled task / logon / manual).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\ensure-server.ps1
#
# IMPORTANT: Do not use Win32_Process.Create with cmd.exe — that flashes a
# console. Always start via wscript + run-hidden.vbs (window style 0).

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hostAddr = "127.0.0.1"
$port = if ($env:DISTRESS_OS_PORT) { [int]$env:DISTRESS_OS_PORT } else { 3000 }
$healthUrl = "http://${hostAddr}:${port}/api/health"
$vbs = Join-Path $root "scripts\run-hidden.vbs"
$pidFile = Join-Path $root ".logs\distress-os.pid"
$logDir = Join-Path $root ".logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Test-ServerUp {
    try {
        $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        return ($res.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Get-ListenerPid {
    param([int]$ListenPort)
    try {
        $id = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -First 1
        if ($id) { return [int]$id }
    } catch {}
    return $null
}

function Start-HiddenServer {
    if (-not (Test-Path $vbs)) {
        Write-Host "Missing $vbs"
        return $false
    }
    # wscript //B never shows UI; VBS Run style 0 hides cmd
    Start-Process -FilePath "wscript.exe" `
        -ArgumentList @("//B", "//Nologo", $vbs) `
        -WindowStyle Hidden `
        -WorkingDirectory $root | Out-Null
    return $true
}

if (Test-ServerUp) {
    $listenPid = Get-ListenerPid -ListenPort $port
    if ($listenPid) { Set-Content -Path $pidFile -Value $listenPid -Encoding ascii }
    # Quiet when already up (scheduled task runs often — avoid noise)
    exit 0
}

Write-Host "Distress OS not responding - starting headless..."
[void](Start-HiddenServer)

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ServerUp) {
        $ready = $true
        break
    }
}

$listenPid = Get-ListenerPid -ListenPort $port
if ($listenPid) { Set-Content -Path $pidFile -Value $listenPid -Encoding ascii }

if ($ready) {
    Write-Host "Distress OS is up: http://${hostAddr}:${port}/"
    exit 0
}

Write-Host "Failed to start. See .logs\distress-os.log"
exit 1
