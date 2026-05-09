param(
    [Parameter(Mandatory=$true)]
    [string]$Url,

    [string]$Items = "1:10",

    [string]$Format = "mp3",

    [string]$OutputDir = "output\media"
)

$ErrorActionPreference = "Stop"

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Refresh PATH so ffmpeg is available even if just installed
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path    = "$machinePath;$userPath"

# ffmpeg location (installed via winget)
$ffmpegDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin"

# Run yt-dlp
$ytdlp = "yt-dlp"
$args_list = @(
    "--playlist-items", $Items,
    "-x",
    "--audio-format", $Format,
    "--audio-quality", "0",
    "--no-overwrites",
    "--restrict-filenames",
    "--ffmpeg-location", $ffmpegDir,
    "-o", "$OutputDir\%(playlist_index)s_%(title)s.%(ext)s",
    $Url
)

Write-Host "Downloading items $Items from: $Url"
Write-Host "Output directory: $OutputDir"

# Run yt-dlp (stderr redirected to avoid PowerShell treating warnings as errors)
$ErrorActionPreference = "Continue"
& $ytdlp @args_list 2>&1 | ForEach-Object { Write-Host $_ }
$exitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($exitCode -ne 0) {
    Write-Error "yt-dlp exited with code $exitCode"
    exit 1
}

# List downloaded files
$files = Get-ChildItem -Path $OutputDir -Filter "*.$Format" | Sort-Object Name
Write-Host "`nDownloaded files:"
$files | ForEach-Object {
    Write-Host "  - $($_.FullName)"
}

# Output as JSON for the bot
$result = @{
    status = "ok"
    count  = $files.Count
    files  = @($files | ForEach-Object { $_.FullName })
}
$result | ConvertTo-Json -Compress
