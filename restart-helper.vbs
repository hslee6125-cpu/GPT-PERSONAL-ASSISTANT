Option Explicit

Dim shell, fso, base, launcher, oldPid, i, alive
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
oldPid = ""
If WScript.Arguments.Count > 0 Then oldPid = Trim(CStr(WScript.Arguments(0)))

Function ProcessIsRunning(pid)
    On Error Resume Next
    Dim wmi, items, item
    ProcessIsRunning = False
    If Len(pid) = 0 Then Exit Function
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set items = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
    For Each item In items
        ProcessIsRunning = True
        Exit For
    Next
    On Error GoTo 0
End Function

Function ServerIsRunning()
    On Error Resume Next
    Dim http, status
    ServerIsRunning = False
    Err.Clear
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 300, 300, 300, 300
    http.Open "GET", "http://127.0.0.1:8787/api/config", False
    http.Send
    status = 0
    If Err.Number = 0 Then status = CLng(http.Status)
    If status >= 200 And status < 500 Then ServerIsRunning = True
    Err.Clear
    On Error GoTo 0
End Function

' v4.6.5+ passes the old Node PID. Older watchers may launch this helper
' without a PID after replacing the file, so the local server check is the fallback.
For i = 1 To 120
    alive = False
    If Len(oldPid) > 0 Then
        alive = ProcessIsRunning(oldPid)
    Else
        alive = ServerIsRunning()
    End If
    If Not alive Then Exit For
    WScript.Sleep 250
Next

' Give Windows a brief moment to release port 8787 before relaunching.
WScript.Sleep 350
launcher = base & "\launcher.vbs"
shell.Run "wscript.exe """ & launcher & """", 0, False
