@echo off
setlocal
cd /d "%~dp0"

if not exist "modules\form-forge\run_review_portal.py" (
  echo Linking Form Forge module...
  if exist "modules\form-forge" rmdir "modules\form-forge" 2>nul
  mklink /J "modules\form-forge" "C:\Users\brand\Projects\city-list-requests" >nul 2>&1
  if errorlevel 1 echo WARNING: Form Forge junction failed. See modules\README.md
)

if not exist "modules\property-analyzer\server.js" (
  echo Linking Property Analyzer module...
  if exist "modules\property-analyzer" rmdir "modules\property-analyzer" 2>nul
  mklink /J "modules\property-analyzer" "C:\Users\brand\Projects\property-distress-analyzer" >nul 2>&1
  if errorlevel 1 echo WARNING: Property Analyzer junction failed. See modules\README.md
)

echo Starting Distress OS...
start "" "http://127.0.0.1:3000"
node server.js