Option Explicit
Dim shell, command
Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""$p=(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if($p){Stop-Process -Id $p -Force}"""
shell.Run command, 0, False
