$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$PrivateDir   = Join-Path $Root ".private"
$KeyFile      = Join-Path $PrivateDir "api-key.dat"
$SettingsFile = Join-Path $PrivateDir "settings.json"
$LogDir       = Join-Path $Root ".logs"
$ServerOut    = Join-Path $LogDir "server.out.log"
$ServerErr    = Join-Path $LogDir "server.err.log"
$UpdaterLog   = Join-Path $LogDir "updater.log"
$Url          = "http://127.0.0.1:8787"
$plainKey     = $null

function Show-Message([string]$Text, [string]$Title = "GPT Personal Assistant") {
    try {
        $ws = New-Object -ComObject WScript.Shell
        [void]$ws.Popup($Text, 0, $Title, 0x40)
    } catch {}
}

function Server-IsRunning {
    try {
        $null = Invoke-RestMethod -Uri "$Url/api/config" -Method Get -TimeoutSec 1
        return $true
    } catch {
        return $false
    }
}

try {
    if (Server-IsRunning) {
        Start-Process $Url
        exit 0
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Show-Message "Node.js를 찾을 수 없습니다.`nhttps://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요." "실행 오류"
        exit 1
    }

    if (-not (Test-Path $KeyFile)) {
        Show-Message "저장된 API Key가 없습니다.`nREPAIR.cmd를 다시 실행해 주세요." "초기설정 필요"
        exit 1
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

    # DPAPI-encrypted key -> plaintext only in this process.
    $encrypted = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
    $secure = ConvertTo-SecureString $encrypted
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    if ($plainKey) {
        $plainKey = ($plainKey -replace [char]0xFEFF, '')
        $plainKey = $plainKey.Trim()
        $plainKey = $plainKey.Trim('"').Trim("'")
        $plainKey = ($plainKey -replace '\s+', '')
    }

    if ([string]::IsNullOrWhiteSpace($plainKey)) {
        Show-Message "저장된 OpenAI API Key가 비어 있습니다.`nREPAIR.cmd를 다시 실행해서 키를 입력해 주세요." "API Key 오류"
        exit 1
    }

    $model = "gpt-5-nano"
    if (Test-Path $SettingsFile) {
        try {
            $settings = Get-Content -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
            if ($settings.model) { $model = [string]$settings.model }
        } catch {}
    }

    $env:OPENAI_API_KEY = $plainKey
    $env:OPENAI_MODEL = $model

    # Update check is best-effort. A failed update must never block launch.
    $updater = Join-Path $Root "updater.js"
    if (Test-Path $updater) {
        try {
            & $node.Source $updater *>> $UpdaterLog
        } catch {
            "[$(Get-Date -Format o)] updater: $($_.Exception.Message)" | Add-Content -LiteralPath $UpdaterLog
        }
    }

    $proc = Start-Process `
        -FilePath $node.Source `
        -ArgumentList "server.js" `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $ServerOut `
        -RedirectStandardError $ServerErr `
        -PassThru

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        if (Server-IsRunning) {
            $ready = $true
            break
        }
        if ($proc.HasExited) { break }
    }

    if ($ready) {
        Start-Process $Url
    } else {
        $lastError = ""
        if (Test-Path $ServerErr) {
            try {
                $lastError = (Get-Content -LiteralPath $ServerErr -Tail 8) -join "`n"
            } catch {}
        }
        if ($lastError) {
            Show-Message "서버를 시작하지 못했습니다.`n`n$lastError" "실행 오류"
        } else {
            Show-Message "서버를 시작하지 못했습니다.`n.logs\server.err.log를 확인해 주세요." "실행 오류"
        }
    }
}
catch {
    try {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        "[$(Get-Date -Format o)] $($_.Exception.ToString())" | Add-Content -LiteralPath $ServerErr
    } catch {}
    Show-Message "실행 실패:`n$($_.Exception.Message)" "GPT Personal Assistant"
}
finally {
    $plainKey = $null
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:OPENAI_MODEL -ErrorAction SilentlyContinue
}
