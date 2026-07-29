Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\Xuan Hieu\.gemini\antigravity-ide\brain\f96d7ff9-a020-483e-9ca5-52a02230f9f0\media__1785309682172.png'
$outDir = Join-Path $PSScriptRoot '..\dist\screenshots'
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$outPath = Join-Path $outDir 'store_screenshot_1280x800.png'

if (Test-Path $srcPath) {
  $srcImg = [System.Drawing.Image]::FromFile($srcPath)
  $bmp = New-Object System.Drawing.Bitmap(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # Sleek background canvas
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 245, 247))
  $g.FillRectangle($brush, 0, 0, 1280, 800)

  $scaleW = 1280.0 / $srcImg.Width
  $scaleH = 800.0 / $srcImg.Height
  $scale = [Math]::Min($scaleW, $scaleH)

  $newW = [int]($srcImg.Width * $scale)
  $newH = [int]($srcImg.Height * $scale)
  $posX = [int]((1280 - $newW) / 2)
  $posY = [int]((800 - $newH) / 2)

  $g.DrawImage($srcImg, $posX, $posY, $newW, $newH)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $srcImg.Dispose()
  Write-Host "Created exact 1280x800 store screenshot: $outPath"
} else {
  Write-Host "Source image not found: $srcPath"
}
