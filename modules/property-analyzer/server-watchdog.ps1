# Keeps the Property Distress Analyzer server running.
# Single-instance via PID lock file; checks every 15 seconds.
$ErrorActionPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root 'logs'
$PidFile = Join-Path $LogsDir 'watchdog.pid'
$EnsureScript = Join-Path $Root 'ensure-server.ps1'
$CheckIntervalSec = 15

if (-not (Test-Path $LogsDir)) {
  New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

if (Test-Path $PidFile) {
  $existingPid = [int](Get-Content $PidFile -ErrorAction SilentlyContinue)
  if ($existingPid -gt 0) {
    $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -like '*powershell*') {
      exit 0
    }
  }
}

Set-Content -Path $PidFile -Value $PID -Encoding ascii

try {
  & $EnsureScript

  while ($true) {
    Start-Sleep -Seconds $CheckIntervalSec
    & $EnsureScript | Out-Null
  }
} finally {
  if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force
  }
}