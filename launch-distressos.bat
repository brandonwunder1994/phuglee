@echo off
setlocal
cd /d "%~dp0"

if not exist "modules\form-forge\run_review_portal.py" (
  echo Linking Form Forge module...
  if exist "modules\form-forge" rmdir "modules\form-forge" 2>nul
  mklink /J "modules\form-forge" "C:\Users\brand\Projects\city-list-requests" >nul 2>&1
  if errorlevel 1 (
    echo WARNING: Could not create junction. Set FORM_FORGE_PATH or run mklink manually.
    echo See modules\README.md
  )
)

echo Starting Distress OS...
start "" "http://127.0.0.1:3000"
node server.js