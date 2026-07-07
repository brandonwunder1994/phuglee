@echo off
title Install Property Distress Analyzer (auto-start)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Download from https://nodejs.org
  pause
  exit /b 1
)

if not exist "logs" mkdir logs

echo.
echo  Setting up background server (no window to keep open)...
echo.

REM Try scheduled task first; fall back to Startup folder (no admin needed).
schtasks /create /tn "PropertyDistressAnalyzer" /tr "wscript.exe \"%CD%\server-watchdog.vbs\"" /sc onlogon /rl limited /f >nul 2>&1
if errorlevel 1 (
  echo  Using Startup folder instead ^(runs when you sign in to Windows^)...
  powershell -NoProfile -Command ^
    "$w = New-Object -ComObject WScript.Shell; " ^
    "$startup = [Environment]::GetFolderPath('Startup'); " ^
    "$lnk = $w.CreateShortcut((Join-Path $startup 'Property Distress Analyzer Server.lnk')); " ^
    "$lnk.TargetPath = 'wscript.exe'; " ^
    "$lnk.Arguments = '\"\"%CD%\server-watchdog.vbs\"\"'; " ^
    "$lnk.WorkingDirectory = '%CD%'; " ^
    "$lnk.Description = 'Keeps Property Distress Analyzer server running in background'; " ^
    "$lnk.Save()"
) else (
  echo  Scheduled task created: PropertyDistressAnalyzer
)

powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell; " ^
  "$desk = [Environment]::GetFolderPath('Desktop'); " ^
  "$lnk = $w.CreateShortcut((Join-Path $desk 'Property Distress Analyzer.lnk')); " ^
  "$lnk.TargetPath = '%CD%\launch-analyzer.bat'; " ^
  "$lnk.WorkingDirectory = '%CD%'; " ^
  "$lnk.IconLocation = 'shell32.dll,13'; " ^
  "$lnk.Description = 'Open Property Distress Analyzer'; " ^
  "$lnk.Save()"

echo  Desktop shortcut: Property Distress Analyzer
echo.

wscript.exe "%~dp0run-server-hidden.vbs"
timeout /t 3 /nobreak >nul
start "" /MIN wscript.exe "%~dp0server-watchdog.vbs"

echo  Done. Double-click "Property Distress Analyzer" on your desktop.
echo  Or open http://distressos.local:3456 in your browser.
echo  No black window needs to stay open.
echo.
pause