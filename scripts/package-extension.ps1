param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$stagingRoot = Join-Path $outputRoot 'aegis-vault'
$archivePath = Join-Path $outputRoot 'aegis-vault.zip'

if (-not $outputRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
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

Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
Write-Host "Portable package created: $archivePath"
