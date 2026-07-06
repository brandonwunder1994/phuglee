@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ========================================
echo   Distress OS — Starting all modules
echo  ========================================
echo.

if not exist "modules\form-forge\run_review_portal.py" (
  echo [1/2] Linking Form Forge...
  if exist "modules\form-forge" rmdir "modules\form-forge" 2>nul
  mklink /J "modules\form-forge" "C:\Users\brand\Projects\city-list-requests" >nul 2>&1
  if errorlevel 1 echo   WARNING: Form Forge junction failed. See modules\README.md
) else (
  echo [1/2] Form Forge module linked.
)

if not exist "modules\property-analyzer\server.js" (
  echo [2/2] Linking Property Analyzer...
  if exist "modules\property-analyzer" rmdir "modules\property-analyzer" 2>nul
  mklink /J "modules\property-analyzer" "C:\Users\brand\Projects\property-distress-analyzer" >nul 2>&1
  if errorlevel 1 echo   WARNING: Property Analyzer junction failed. See modules\README.md
) else (
  echo [2/2] Property Analyzer module linked.
)

echo.
echo  Landing:  http://127.0.0.1:3000/
echo  Hub:      http://127.0.0.1:3000/heat
echo  Forge:    http://127.0.0.1:3000/forge/
echo  Analyzer: http://127.0.0.1:3000/analyzer/
echo.

start "" "http://127.0.0.1:3000/heat"
node server.js