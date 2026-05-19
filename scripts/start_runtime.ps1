param(
    [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path ".").Path
$env:PYTHONPATH = $Root
$Python = (& python -c "import sys; print(getattr(sys, '_base_executable', sys.executable))").Trim()

if ($Foreground) {
    & $Python -m app.channels.telegram
    exit $LASTEXITCODE
}

$Logs = Join-Path $Root "logs\runtime"
New-Item -ItemType Directory -Path $Logs -Force | Out-Null

Start-Process `
    -FilePath $Python `
    -ArgumentList @("-m", "app.channels.telegram") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Logs "runtime.out.log") `
    -RedirectStandardError (Join-Path $Logs "runtime.err.log")
