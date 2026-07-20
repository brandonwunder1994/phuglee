# start-local-server.ps1 — guarantee Phuglee on 127.0.0.1:3000
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# scripts/ -> repo root
$root = Split-Path -Parent $here
if (-not (Test-Path (Join-Path $root "server.js"))) { $root = $here }
Set-Location $root
$logDir = Join-Path $root ".logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$health = "http://127.0.0.1:3000/api/health"
function Test-Up {
  try {
    $r = Invoke-WebRequest $health -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}
if (Test-Up) {
  Write-Host ""
  Write-Host "  LIVE  http://127.0.0.1:3000/"
  Write-Host "  LIVE  http://127.0.0.1:3000/analyzer/"
  Write-Host ""
  exit 0
}
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
$out = Join-Path $logDir "local-server.out.log"
$err = Join-Path $logDir "local-server.err.log"
$p = Start-Process -FilePath "node.exe" -ArgumentList "server.js" `
  -WorkingDirectory $root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err
$p.Id | Set-Content (Join-Path $logDir "distress-os.pid") -Encoding ascii
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Up) {
    Write-Host ""
    Write-Host "  LIVE pid=$($p.Id)"
    Write-Host "  http://127.0.0.1:3000/"
    Write-Host "  http://127.0.0.1:3000/analyzer/"
    Write-Host "  Hard refresh: Ctrl+Shift+R"
    Write-Host ""
    exit 0
  }
}
Write-Host "FAILED to start. Last errors:"
if (Test-Path $err) { Get-Content $err -Tail 50 }
exit 1
