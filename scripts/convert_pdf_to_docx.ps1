param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath
)

$ErrorActionPreference = "Stop"

function Write-Result {
    param(
        [hashtable]$Payload,
        [int]$ExitCode
    )

    $Payload | ConvertTo-Json -Compress
    exit $ExitCode
}

try {
    $cleanInput = $InputPath.Trim()
    if ($cleanInput.StartsWith("[file:") -and $cleanInput.EndsWith("]")) {
        $cleanInput = $cleanInput.Substring(6, $cleanInput.Length - 7)
    }

    $source = [string](Resolve-Path -LiteralPath $cleanInput).Path
    $extension = [System.IO.Path]::GetExtension($source).ToLowerInvariant()

    if ($extension -ne ".pdf") {
        Write-Result @{
            status = "error"
            error = "Only .pdf files can be converted to DOCX."
            files = @()
            count = 0
        } 2
    }

    $workspace = [string](Resolve-Path -LiteralPath ".").Path
    $outputDir = [string](Join-Path $workspace "output\documents")
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($source)
    $docxPath = [string](Join-Path $outputDir ($baseName + ".docx"))

    $word = $null
    $document = $null

    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0
        $word.AutomationSecurity = 3
        $word.Options.UpdateLinksAtOpen = $false
        $word.Options.SaveNormalPrompt = $false

        $confirmConversions = $false
        $readOnly = $true
        $addToRecentFiles = $false
        $document = $word.Documents.OpenNoRepairDialog($source, $confirmConversions, $readOnly, $addToRecentFiles)

        if (Test-Path -LiteralPath $docxPath) {
            Remove-Item -LiteralPath $docxPath -Force
        }

        $wdFormatXMLDocument = 16
        $document.SaveAs2($docxPath, $wdFormatXMLDocument)
    }
    finally {
        if ($null -ne $document) {
            $saveChanges = $false
            $document.Close([ref]$saveChanges)
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
        }

        if ($null -ne $word) {
            $word.Quit()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
        }
    }

    if (-not (Test-Path -LiteralPath $docxPath)) {
        Write-Result @{
            status = "error"
            error = "DOCX conversion finished without producing a file."
            files = @()
            count = 0
        } 3
    }

    Write-Result @{
        status = "ok"
        files = @($docxPath)
        count = 1
    } 0
}
catch {
    Write-Result @{
        status = "error"
        error = $_.Exception.Message
        files = @()
        count = 0
    } 1
}
