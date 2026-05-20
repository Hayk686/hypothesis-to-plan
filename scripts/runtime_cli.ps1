param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RuntimeArgs
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path ".").Path
$env:PYTHONPATH = $Root
$Python = (& python -c "import sys; print(getattr(sys, '_base_executable', sys.executable))").Trim()

& $Python -m app.channels.cli @RuntimeArgs
