$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$chromeRoot = Join-Path $repoRoot "chrome"
$manifestPath = Join-Path $chromeRoot "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$version = [string]$manifest.version

$distPath = Join-Path $repoRoot "dist"
if (-not (Test-Path $distPath)) {
    New-Item -ItemType Directory -Path $distPath | Out-Null
}

$zipPath = Join-Path $distPath ("notebook-to-anki-bridge-chrome-{0}.zip" -f $version)
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

$files = @(
    "manifest.json",
    "background.js",
    "content.js",
    "content.css",
    "network-hook.js",
    "rpc-parser.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "LICENSE"
)

foreach ($relativePath in $files) {
    $sourceRoot = if ($relativePath -eq "LICENSE") { $repoRoot } else { $chromeRoot }
    $fullPath = Join-Path $sourceRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Required Chrome package file is missing: $relativePath"
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open(
    $zipPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
    foreach ($relativePath in $files) {
        $sourceRoot = if ($relativePath -eq "LICENSE") { $repoRoot } else { $chromeRoot }
        $fullPath = Join-Path $sourceRoot $relativePath
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $fullPath,
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$verification = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entryNames = @($verification.Entries | ForEach-Object { $_.FullName })
    if ($entryNames -notcontains "manifest.json") {
        throw "Packaging verification failed: manifest.json is not at the ZIP root."
    }
    if ($entryNames | Where-Object { $_ -like "chrome/*" }) {
        throw "Packaging verification failed: nested Chrome directory was included."
    }
    if ($entryNames.Count -ne $files.Count) {
        throw "Packaging verification failed: unexpected ZIP entry count."
    }
}
finally {
    $verification.Dispose()
}

Write-Host "Created and verified Chrome package:"
Write-Host $zipPath
Write-Host ("Files: " + $files.Count)
