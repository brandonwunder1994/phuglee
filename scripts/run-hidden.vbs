' Start Distress OS fully hidden (no console window).
' Called by restart.ps1 / scheduled task / ensure-server.
Option Explicit

Dim fso, shell, root, logFile, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(root & "\.logs") Then
  fso.CreateFolder root & "\.logs"
End If
logFile = root & "\.logs\distress-os.log"

shell.CurrentDirectory = root
' 0 = hidden window, False = do not wait for exit
cmd = "cmd.exe /c node server.js >> """ & logFile & """ 2>>&1"
shell.Run cmd, 0, False
