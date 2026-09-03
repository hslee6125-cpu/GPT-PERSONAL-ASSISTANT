$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$PrivateDir = Join-Path $Root ".private"
$KeyFile = Join-Path $PrivateDir "api-key.dat"
$SettingsFile = Join-Path $PrivateDir "settings.json"
$LogDir = Join-Path $Root ".logs"
$ServerOut = Join-Path $LogDir "server.out.log"
$ServerErr = Join-Path $LogDir "server.err.log"
$UpdaterLog = Join-Path $LogDir "updater.log"
$Url = "http://127.0.0.1:8787"

function Show-Message([string]$Text, [string]$Title = "GPT 개인비서") {
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

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        Show-Message "Node.js를 찾을 수 없습니다.`n먼저 Node.js를 설치한 뒤 '개인비서_초기설정.cmd'를 다시 실행해 주세요." "GPT 개인비서 - 실행 오류"
        exit 1
    }

    if (-not (Test-Path $KeyFile)) {
        Show-Message "API 키 초기설정이 되어 있지 않습니다.`n먼저 '개인비서_초기설정.cmd'를 한 번 실행해 주세요." "GPT 개인비서 - 초기설정 필요"
        exit 1
    }

    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

    # Windows DPAPI로 현재 사용자 계정에 묶여 암호화된 API 키를 복호화합니다.
    $encrypted = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
    $secure = ConvertTo-SecureString $encrypted
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    if ([string]::IsNullOrWhiteSpace($plainKey)) {
        throw "저장된 API 키를 읽지 못했습니다. 초기설정을 다시 실행해 주세요."
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

    # 자동업데이트 확인. 오류가 나도 기존 버전을 계속 실행합니다.
    try {
        & $nodeCommand.Source (Join-Path $Root "updater.js") *>> $UpdaterLog
    } catch {
        "[$(Get-Date -Format o)] Updater launcher error: $($_.Exception.Message)" | Add-Content -LiteralPath $UpdaterLog
    }

    if (Server-IsRunning) {
        Start-Process $Url
        exit 0
    }

    # 서버를 숨김 창으로 실행합니다. 현재 프로세스의 API 환경변수를 상속합니다.
    $proc = Start-Process -FilePath $nodeCommand.Source `
        -ArgumentList "server.js" `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $ServerOut `
        -RedirectStandardError $ServerErr `
        -PassThru

    # 서버 준비가 끝나면 기본 브라우저를 엽니다.
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
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
        Show-Message "개인비서 서버를 시작하지 못했습니다.`n폴더의 .logs\server.err.log 파일을 확인해 주세요." "GPT 개인비서 - 실행 오류"
    }
} catch {
    try {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        "[$(Get-Date -Format o)] $($_.Exception.ToString())" | Add-Content -LiteralPath $ServerErr
    } catch {}
    Show-Message "개인비서를 실행하지 못했습니다.`n$($_.Exception.Message)" "GPT 개인비서 - 실행 오류"
} finally {
    if ($plainKey) { $plainKey = $null }
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}
