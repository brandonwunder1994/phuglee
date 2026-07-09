@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   Distress OS - background start
echo  ========================================
echo.
echo  Starts headless on port 3000 (no extra
echo  terminal window). Keep-alive restarts it
echo  if it dies.
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
echo  Stop later: scripts\stop.ps1
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart.ps1"
if errorlevel 1 (
  echo.
  echo  Background start failed — see .logs\distress-os.log
  pause
  exit /b 1
)

start "" "http://127.0.0.1:3000/"
echo.
echo  Server is running in the background. This window can close.
echo.
exit /b 0
