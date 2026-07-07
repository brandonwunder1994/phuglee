# One-time setup: map distressos.local -> this computer (127.0.0.1)
$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$marker = 'distressos.local'
$entry = '127.0.0.1 distressos.local'

$content = Get-Content $hostsPath -ErrorAction Stop
if ($content -match [regex]::Escape($marker)) {
  Write-Host 'distressos.local is already in the hosts file.'
  exit 0
}

$block = @(
  ''
  '# Property Distress Analyzer'
  $entry
)
Add-Content -Path $hostsPath -Value ($block -join "`r`n") -Encoding ASCII
Write-Host 'Added distressos.local to hosts file.'
exit 0