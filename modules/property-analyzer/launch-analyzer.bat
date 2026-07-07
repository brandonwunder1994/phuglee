@echo off
title Property Distress Analyzer
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Download from https://nodejs.org
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist "logs" mkdir logs

REM Ensure distressos.local resolves on this PC (no-op if already configured).
findstr /C:"distressos.local" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if errorlevel 1 (
  echo First run: Windows may ask to allow distressos.local — click Yes.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%~dp0scripts\add-distressos-host.ps1\"\"' -Verb RunAs -Wait"
)

REM Start watchdog + server in background via VBS (avoids PowerShell window flash).
wscript.exe "%~dp0server-watchdog.vbs"

REM Wait up to 45 seconds for the server to respond before opening the browser.
set /a _tries=0
:wait_ready
timeout /t 1 /nobreak >nul
curl.exe -s -m 5 http://localhost:3456/api/status >nul 2>&1
if not errorlevel 1 goto open_browser
set /a _tries+=1
if %_tries% lss 45 goto wait_ready

echo.
echo  Server did not start on port 3456.
echo  Check logs\server.log for errors, then try again.
echo.
pause
exit /b 1

:open_browser
ping -n 1 distressos.local | findstr /C:"127.0.0.1" >nul 2>&1
if errorlevel 1 (
  echo distressos.local not configured — opening localhost instead.
  echo Run setup-distressos-url.bat once for http://distressos.local:3456
  start http://localhost:3456
) else (
  start http://distressos.local:3456
)
exit /b 0