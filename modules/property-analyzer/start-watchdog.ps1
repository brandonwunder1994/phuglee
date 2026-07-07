# Starts the watchdog in the background if it is not already running.
$ErrorActionPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $Root 'logs'
$PidFile = Join-Path $LogsDir 'watchdog.pid'
$WatchdogScript = Join-Path $Root 'server-watchdog.ps1'

if (Test-Path $PidFile) {
  $existingPid = [int](Get-Content $PidFile -ErrorAction SilentlyContinue)
  if ($existingPid -gt 0 -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    exit 0
  }
}

Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$WatchdogScript`"" `
  -WorkingDirectory $Root `
  -WindowStyle Hidden | Out-Null