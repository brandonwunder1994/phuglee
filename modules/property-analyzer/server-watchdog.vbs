' Starts the PowerShell watchdog (single instance, auto-restarts server).
Option Explicit

Dim sh, fso, dir, cmd

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\start-watchdog.ps1"""
sh.Run cmd, 0, False