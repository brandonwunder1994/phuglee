# Verify key Phuglee pages at phone widths (no horizontal document overflow).
# Ensures the local server is up, then runs scripts/verify-mobile.cjs via system Edge/Chrome.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-mobile.ps1
#   powershell -File scripts\verify-mobile.ps1 -Pages "/,/collect,/bridge"
#   powershell -File scripts\verify-mobile.ps1 -Width 375
#
# Exit: 0 pass, 1 layout fail, 2 tooling/server fail

param(
    [string]$Pages = "",
    [int[]]$Width = @(),
    [switch]$NoTouch,
    [switch]$Devices
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$live = Join-Path $root "scripts\verify-live.ps1"
if (Test-Path $live) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $live
    if ($LASTEXITCODE -ne 0) {
        Write-Host "MOBILE skipped: server not live" -ForegroundColor Red
        exit 2
    }
}

$argsList = @()
if ($Pages) { $argsList += "--pages=$Pages" }
foreach ($w in $Width) {
    if ($w -gt 0) { $argsList += "--width=$w" }
}
if ($NoTouch) { $argsList += "--no-touch" }
if ($Devices) { $argsList += "--devices" }

Write-Host ""
Write-Host "== Mobile layout check ==" -ForegroundColor Cyan
& node (Join-Path $root "scripts\verify-mobile.cjs") @argsList
exit $LASTEXITCODE
