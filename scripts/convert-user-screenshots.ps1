param(
  [string]$SourceDirectory = 'D:\OneDrive\Desktop\Agens'
)

Add-Type -AssemblyName System.Drawing

$srcDir = $SourceDirectory
if (-not (Test-Path $srcDir)) {
  Write-Host "Source directory does not exist: $srcDir"
  exit 0
}

$outDir = Join-Path $PSScriptRoot '..\dist\screenshots'
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$files = Get-ChildItem -Path $srcDir -Filter *.png
Write-Host "Found $($files.Count) screenshots in $srcDir"

# Encoder parameters for 100% high quality JPEG without alpha
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]100)

$index = 1
foreach ($file in $files) {
  try {
    $srcImg = [System.Drawing.Image]::FromFile($file.FullName)
    $bmp = New-Object System.Drawing.Bitmap(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Modern background fill (solid RGB, no alpha)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 245, 247))
    $g.FillRectangle($brush, 0, 0, 1280, 800)

    # Calculate centered fitted bounds
    $maxW = 1200.0
    $maxH = 740.0
    $scaleW = $maxW / $srcImg.Width
    $scaleH = $maxH / $srcImg.Height
    $scale = [Math]::Min($scaleW, $scaleH)
    if ($scale -gt 1.5) { $scale = 1.5 }

    $newW = [int]($srcImg.Width * $scale)
    $newH = [int]($srcImg.Height * $scale)
    $posX = [int]((1280 - $newW) / 2)
    $posY = [int]((800 - $newH) / 2)

    # Subtle shadow
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 230, 235))
    $g.FillRectangle($shadowBrush, $posX - 4, $posY - 4, $newW + 8, $newH + 8)

    $g.DrawImage($srcImg, $posX, $posY, $newW, $newH)

    # Save JPEG version (No alpha channel guaranteed)
    $jpgName = "store_screenshot_${index}.jpg"
    $jpgPath = Join-Path $outDir $jpgName
    $bmp.Save($jpgPath, $jpegCodec, $encoderParams)

    # Save PNG version
    $pngName = "screenshot_${index}_1280x800.png"
    $pngPath = Join-Path $outDir $pngName
    $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $srcImg.Dispose()
    $shadowBrush.Dispose()
    $brush.Dispose()

    Write-Host "Converted $($file.Name) -> $jpgName & $pngName (1280x800)"
    $index++
  } catch {
    Write-Host "Failed to process $($file.Name): $_"
  }
}
