' Fully silent ensure-server for Task Scheduler.
' No PowerShell, no visible console — ever.
' Health-check 127.0.0.1:3000; if down, start node via hidden cmd (window style 0).
Option Explicit

Dim fso, shell, root, logFile, http, up, cmd, port, healthUrl
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(root & "\.logs") Then
  On Error Resume Next
  fso.CreateFolder root & "\.logs"
  On Error GoTo 0
End If
logFile = root & "\.logs\distress-os.log"
port = "3000"
healthUrl = "http://127.0.0.1:" & port & "/api/health"

up = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
If http Is Nothing Then Set http = CreateObject("MSXML2.ServerXMLHTTP")
If Not http Is Nothing Then
  http.setTimeouts 1500, 1500, 1500, 1500
  http.Open "GET", healthUrl, False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then up = True
End If
Err.Clear
On Error GoTo 0

If up Then
  WScript.Quit 0
End If

' Server down — start fully hidden (0 = hide window, False = do not wait)
shell.CurrentDirectory = root
cmd = "cmd.exe /c node server.js >> """ & logFile & """ 2>>&1"
shell.Run cmd, 0, False
WScript.Quit 0
