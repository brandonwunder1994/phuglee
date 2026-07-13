@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   Distress OS - local server (port 3000)
echo  ========================================
echo.

if not exist "modules\form-forge\run_review_portal.py" (
  echo ERROR: Form Forge missing at modules\form-forge
  pause
  exit /b 1
)
if not exist "modules\property-analyzer\server.js" (
  echo ERROR: Property Analyzer missing at modules\property-analyzer
  pause
  exit /b 1
)

echo [OK] Modules present
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-server.ps1"
if errorlevel 1 (
  echo.
  echo  Failed. See .logs\local-server.err.log
  pause
  exit /b 1
)

echo  Opening browser...
start "" "http://127.0.0.1:3000/"
start "" "http://127.0.0.1:3000/analyzer/"
echo.
echo  Sign in as admin, open Analyze, click a property card.
echo  If UI looks old: Ctrl+Shift+R
echo.
exit /b 0
