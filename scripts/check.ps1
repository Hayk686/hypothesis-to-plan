$ok = $true
function Check($name, $cmd) {
    try {
        $out = & $cmd 2>&1
        if ($LASTEXITCODE -eq 0 -or $?) { Write-Host "[OK]   $name" -ForegroundColor Green }
        else { Write-Host "[FAIL] $name" -ForegroundColor Red; $script:ok = $false }
    } catch { Write-Host "[FAIL] $name : $_" -ForegroundColor Red; $script:ok = $false }
}

Check "python"  { python --version }
Check "yt-dlp"  { yt-dlp --version }
Check "ffmpeg"  { ffmpeg -version }

$paths = @(
    "tools\picoclaw\picoclaw.exe",
    "picoclaw\openrouter_api_key.txt",
    "picoclaw\config.local.json",
    "picoclaw\AGENTS.md",
    "picoclaw\.security.yml"
)
foreach ($p in $paths) {
    if (Test-Path $p) { Write-Host "[OK]   $p" -ForegroundColor Green }
    else { Write-Host "[FAIL] missing: $p" -ForegroundColor Red; $ok = $false }
}

try {
    Get-Content "picoclaw\config.local.json" -Raw | ConvertFrom-Json | Out-Null
    Write-Host "[OK]   config.local.json is valid JSON" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] config.local.json invalid JSON: $_" -ForegroundColor Red; $ok = $false
}

$port = Get-NetTCPConnection -LocalPort 18790 -ErrorAction SilentlyContinue
if ($port) { Write-Host "[WARN] port 18790 already in use (picoclaw running?)" -ForegroundColor Yellow }
else { Write-Host "[OK]   port 18790 free" -ForegroundColor Green }

if ($ok) { Write-Host "`nAll checks passed." -ForegroundColor Green; exit 0 }
else { Write-Host "`nSome checks failed." -ForegroundColor Red; exit 1 }
