@echo off
title Setup distressos.local URL
cd /d "%~dp0"

findstr /C:"distressos.local" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if not errorlevel 1 (
  echo distressos.local is already configured.
  echo Open the app at: http://distressos.local:3456
  pause
  exit /b 0
)

echo.
echo  This adds "distressos.local" as a nickname for your computer.
echo  Windows will ask for Administrator permission once.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%~dp0scripts\add-distressos-host.ps1\"\"' -Verb RunAs -Wait"

findstr /C:"distressos.local" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Setup did not complete. Run this file again and approve the admin prompt.
  pause
  exit /b 1
)

echo.
echo  Done. Use: http://distressos.local:3456
echo.
pause
exit /b 0