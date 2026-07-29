param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$stagingRoot = Join-Path $outputRoot 'aegis-vault'
$archivePath = Join-Path $outputRoot 'aegis-vault.zip'
$projectPrefix = $projectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

if (-not $outputRoot.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Output directory must be inside the project.'
}

Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
New-Item $stagingRoot -ItemType Directory -Force | Out-Null

Copy-Item (Join-Path $projectRoot 'manifest.json') $stagingRoot
Copy-Item (Join-Path $projectRoot 'src') $stagingRoot -Recurse
Copy-Item (Join-Path $projectRoot 'INSTALL.md') $stagingRoot

Get-ChildItem $stagingRoot -Recurse -File | Where-Object {
  $_.Extension -in @('.pem', '.key')
} | ForEach-Object {
  throw "Secret key detected in package: $($_.FullName)"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archiveStream = [System.IO.File]::Open(
  $archivePath,
  [System.IO.FileMode]::CreateNew,
  [System.IO.FileAccess]::ReadWrite,
  [System.IO.FileShare]::None
)
$archive = New-Object System.IO.Compression.ZipArchive(
  $archiveStream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)
try {
  Get-ChildItem $stagingRoot -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($stagingRoot.Length)
    $relativePath = $relativePath.TrimStart([char[]]@('\', '/')).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $_.FullName,
      $relativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
  $archiveStream.Dispose()
}
Write-Host "Portable package created: $archivePath"
