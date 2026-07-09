# Ensure Distress OS is listening. Start headless if not.
# Safe to run repeatedly (scheduled task / logon / manual).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\ensure-server.ps1

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

if (Test-ServerUp) {
    $listenPid = Get-ListenerPid -ListenPort $port
    if ($listenPid) { Set-Content -Path $pidFile -Value $listenPid -Encoding ascii }
    Write-Host "Distress OS already up on port $port"
    exit 0
}

Write-Host "Distress OS not responding - starting headless..."
# Launch outside Job Objects (agent shells kill Start-Process trees on exit).
$logFile = Join-Path $logDir "distress-os.log"
$started = $false
try {
    $cmd = 'cmd.exe /c node server.js >> "' + $logFile + '" 2>&1'
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine      = $cmd
        CurrentDirectory = $root
    }
    if ($r.ReturnValue -eq 0) { $started = $true }
} catch {}
if (-not $started) {
    Start-Process -FilePath "wscript.exe" -ArgumentList "//B","//Nologo","`"$vbs`"" -WindowStyle Hidden | Out-Null
}

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
