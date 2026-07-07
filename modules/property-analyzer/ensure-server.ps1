# Ensures the Property Distress Analyzer server is healthy on port 3456.
# Uses HTTP health checks (not just netstat) and restarts if needed.
param(
  [int]$Port = 3456,
  [int]$StartWaitSec = 8
)

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root 'logs'
$ServerLog = Join-Path $LogsDir 'server.log'
$WatchdogLog = Join-Path $LogsDir 'watchdog.log'
$NodeExe = Join-Path ${env:ProgramFiles} 'nodejs\node.exe'

if (-not (Test-Path $LogsDir)) {
  New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

function Write-WatchdogLog([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')] $Message"
  Add-Content -Path $WatchdogLog -Value $line
}

function Test-ServerHealthy {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/status" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -ne 200) { return $false }
    $payload = $response.Content | ConvertFrom-Json
    return [bool]$payload.ok
  } catch {
    return $false
  }
}

function Wait-ServerHealthy {
  param(
    [int]$Retries = 3,
    [int]$DelaySec = 2
  )
  for ($i = 0; $i -lt $Retries; $i++) {
    if (Test-ServerHealthy) { return $true }
    if ($i -lt ($Retries - 1)) { Start-Sleep -Seconds $DelaySec }
  }
  return $false
}

function Get-ListenerPid {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($conn) { return [int]$conn.OwningProcess }
  return $null
}

function Start-AnalyzerServer {
  $exe = $NodeExe
  if (-not (Test-Path $exe)) { $exe = 'node' }

  $serverOut = Join-Path $LogsDir 'server-stdout.log'
  $serverErr = Join-Path $LogsDir 'server-stderr.log'

  Start-Process -FilePath $exe `
    -ArgumentList '--max-old-space-size=4096', 'server.js' `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr | Out-Null

  Write-WatchdogLog "Started server via $exe"
}

if (Wait-ServerHealthy -Retries 1) {
  exit 0
}

$listenerPid = Get-ListenerPid
if ($listenerPid) {
  if (Wait-ServerHealthy -Retries 3 -DelaySec 2) {
    exit 0
  }
  Write-WatchdogLog "Port $Port is listening (PID $listenerPid) but health check failed after retries - restarting"
  Stop-Process -Id $listenerPid -Force
  Start-Sleep -Seconds 2
} else {
  Write-WatchdogLog "Port $Port is not healthy - starting server"
}

Start-AnalyzerServer

for ($i = 0; $i -lt $StartWaitSec; $i++) {
  Start-Sleep -Seconds 1
  if (Test-ServerHealthy) {
    Write-WatchdogLog "Server healthy on port $Port"
    exit 0
  }
}

Write-WatchdogLog "Server failed to become healthy within ${StartWaitSec}s - check logs\server-stderr.log"
exit 1