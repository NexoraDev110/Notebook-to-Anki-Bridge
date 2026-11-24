$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$version = [string]$manifest.version

$distPath = Join-Path $repoRoot "dist"
if (-not (Test-Path $distPath)) {
    New-Item -ItemType Directory -Path $distPath | Out-Null
}

$zipPath = Join-Path $distPath ("notebook-to-anki-bridge-firefox-{0}.zip" -f $version)
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

$iconFiles = @(
    "icons/logo-16.png",
    "icons/logo-32.png",
    "icons/logo-48.png",
    "icons/logo-96.png",
    "icons/logo-128.png"
)

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
) + $iconFiles

foreach ($relativePath in $files) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Required Firefox package file is missing: $relativePath"
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
        $fullPath = Join-Path $repoRoot ($relativePath -replace "/", "\")
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
        throw "Packaging verification failed: Chrome files were included."
    }
    if ($entryNames.Count -ne $files.Count) {
        throw "Packaging verification failed: unexpected ZIP entry count (got $($entryNames.Count), expected $($files.Count))."
    }
}
finally {
    $verification.Dispose()
}

Write-Host "Created and verified Firefox package:"
Write-Host $zipPath
Write-Host ("Files: " + $files.Count)
