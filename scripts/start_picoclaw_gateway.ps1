param(
    [string]$InstallDir = "tools\picoclaw",
    [string]$ConfigPath = "picoclaw\config.local.json"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path ".").Path
$PicoclawExe = Get-ChildItem -Path (Join-Path $Root $InstallDir) -Recurse -Filter "picoclaw.exe" | Select-Object -First 1
if (-not $PicoclawExe) {
    throw "picoclaw.exe not found. Run .\scripts\setup_picoclaw_windows.ps1 first."
}

$ConfigFullPath = Join-Path $Root $ConfigPath
if (-not (Test-Path $ConfigFullPath)) {
    throw "Config not found: $ConfigFullPath. Run .\scripts\setup_picoclaw_windows.ps1 first."
}

$env:PICOCLAW_CONFIG = $ConfigFullPath
Push-Location $Root
try {
    & $PicoclawExe.FullName gateway
} finally {
    Pop-Location
}

