$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pkgPath = Join-Path $projectRoot 'package.json'
$manifestPath = Join-Path $projectRoot 'manifest.json'

$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$oldVersion = $pkg.version

$parts = $oldVersion.Split('.')
$major = [int]$parts[0]
$minor = [int]$parts[1]
$patch = [int]$parts[2] + 1
$newVersion = "$major.$minor.$patch"

# Update package.json
$pkg.version = $newVersion
$pkgJsonText = $pkg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($pkgPath, $pkgJsonText, [System.Text.Encoding]::UTF8)

# Update manifest.json
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest.version = $newVersion
$manifestJsonText = $manifest | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($manifestPath, $manifestJsonText, [System.Text.Encoding]::UTF8)

Write-Host "Version bumped: $oldVersion -> $newVersion in package.json & manifest.json"
