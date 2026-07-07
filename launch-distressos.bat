@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   Distress OS — Starting all modules
echo  ========================================
echo.

if not exist "modules\form-forge\run_review_portal.py" (
  echo ERROR: Form Forge missing at modules\form-forge
  echo Run: git pull  OR  see modules\README.md
  pause
  exit /b 1
)

if not exist "modules\property-analyzer\server.js" (
  echo ERROR: Property Analyzer missing at modules\property-analyzer
  echo Run: git pull  OR  see modules\README.md
  pause
  exit /b 1
)

echo [OK] Form Forge module present.
echo [OK] Property Analyzer module present.
echo.
echo  Logo Page: http://127.0.0.1:3000/
echo  Collect:  http://127.0.0.1:3000/collect
echo  Hub:      http://127.0.0.1:3000/heat
echo  Forge:    http://127.0.0.1:3000/forge/
echo  Analyzer: http://127.0.0.1:3000/analyzer/
echo  Bridge:   http://127.0.0.1:3000/bridge
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart.ps1"
if errorlevel 1 (
  echo.
  echo  Restart failed — trying direct start...
  start "" "http://127.0.0.1:3000/"
  node server.js
) else (
  start "" "http://127.0.0.1:3000/"
)