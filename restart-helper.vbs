Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
WScript.Sleep 1800
launcher = base & "\launcher.vbs"
shell.Run "wscript.exe """ & launcher & """", 0, False
