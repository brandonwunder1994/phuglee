# Phuglee - stop background server + module ports
# Usage: powershell -ExecutionPolicy Bypass -File scripts\stop.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ports = @(3000, 8787, 3456)
$pidFile = Join-Path $root ".logs\phuglee.pid"
$legacyPidFile = Join-Path $root ".logs\distress-os.pid"

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

Write-Host "Stopping Phuglee..." -ForegroundColor Yellow

# Disable keep-alive so it does not immediately restart (new + legacy task names)
foreach ($taskName in @('Phuglee', 'PhugleeDistressOS')) {
    schtasks /Change /TN $taskName /DISABLE 2>$null | Out-Null
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null
}

foreach ($pf in @($pidFile, $legacyPidFile)) {
    if (Test-Path $pf) {
        $saved = Get-Content $pf -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($saved -match '^\d+$') {
            Stop-Process -Id ([int]$saved) -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped saved PID $saved"
        }
        Remove-Item $pf -Force -ErrorAction SilentlyContinue
    }
}

foreach ($port in $ports) { Stop-PortListener -Port $port }

Get-Process cmd -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match 'Distress OS|Phuglee'
} | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Closed leftover console PID $($_.Id)"
}

Write-Host "Done. (Keep-alive task removed; run restart.ps1 to start again.)" -ForegroundColor Green
