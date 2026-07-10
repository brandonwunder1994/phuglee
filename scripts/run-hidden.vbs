' Start Distress OS fully hidden (no console window).
' Called by restart.ps1 / ensure-server.ps1 / ensure-server-hidden.vbs.
' MUST use WScript.Shell.Run with window style 0 — never bare CreateProcess/cmd
' without hide, or a black terminal flashes on the desktop.
Option Explicit

Dim fso, shell, root, logFile, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(root & "\.logs") Then
  On Error Resume Next
  fso.CreateFolder root & "\.logs"
  On Error GoTo 0
End If
logFile = root & "\.logs\distress-os.log"

shell.CurrentDirectory = root
' 0 = hidden window, False = do not wait for exit
cmd = "cmd.exe /c node server.js >> """ & logFile & """ 2>>&1"
shell.Run cmd, 0, False
