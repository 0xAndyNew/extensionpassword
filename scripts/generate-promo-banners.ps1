Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\dist\screenshots'
$logoPath = Join-Path $PSScriptRoot '..\src\ui\logo-128.png'

if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]100)

# Build 440x280 Small Promo Banner
function Build-SmallPromo() {
  $w = 440
  $h = 280
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Dark elegant background
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $c1 = [System.Drawing.Color]::FromArgb(15, 23, 42)
  $c2 = [System.Drawing.Color]::FromArgb(30, 41, 59)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)
  $g.FillRectangle($bgBrush, $rect)

  # Ambient glow
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(25, 0, 113, 227))
  $g.FillEllipse($glowBrush, 220, -40, 260, 260)

  # Draw Logo
  $logoSize = 72
  $logoX = 32
  $logoY = [int](($h - $logoSize) / 2) - 8

  if (Test-Path $logoPath) {
    $logoImg = [System.Drawing.Image]::FromFile($logoPath)
    $g.DrawImage($logoImg, $logoX, $logoY, $logoSize, $logoSize)
    $logoImg.Dispose()
  }

  $textX = $logoX + $logoSize + 18
  
  $fontTitle = New-Object System.Drawing.Font('Segoe UI', 21, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString('Aegis Vault', $fontTitle, $textBrush, $textX, ($logoY + 2))

  $fontSub1 = New-Object System.Drawing.Font('Segoe UI', 10.5, [System.Drawing.FontStyle]::Regular)
  $fontSub2 = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Regular)
  $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(148, 163, 184))

  $g.DrawString('Zero-Knowledge', $fontSub1, $subBrush, $textX, ($logoY + 40))
  $g.DrawString('Password & OTP Manager', $fontSub2, $subBrush, $textX, ($logoY + 60))

  $outPath = Join-Path $outDir 'promo_small_440x280.jpg'
  $bmp.Save($outPath, $jpegCodec, $encoderParams)

  $g.Dispose()
  $bmp.Dispose()
  $fontTitle.Dispose()
  $fontSub1.Dispose()
  $fontSub2.Dispose()
  $textBrush.Dispose()
  $subBrush.Dispose()
  $glowBrush.Dispose()
  $bgBrush.Dispose()
  Write-Host "Generated small promo: $outPath"
}

# Build 1400x560 Marquee Banner with Perfect Padding
function Build-MarqueePromo() {
  $w = 1400
  $h = 560
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Dark gradient background
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $c1 = [System.Drawing.Color]::FromArgb(15, 23, 42)
  $c2 = [System.Drawing.Color]::FromArgb(30, 41, 59)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)
  $g.FillRectangle($bgBrush, $rect)

  # Large ambient glow
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 0, 113, 227))
  $g.FillEllipse($glowBrush, 850, -80, 650, 650)

  # Logo
  $logoSize = 180
  $logoX = 120
  $logoY = [int](($h - $logoSize) / 2) - 15

  if (Test-Path $logoPath) {
    $logoImg = [System.Drawing.Image]::FromFile($logoPath)
    $g.DrawImage($logoImg, $logoX, $logoY, $logoSize, $logoSize)
    $logoImg.Dispose()
  }

  $textX = $logoX + $logoSize + 50

  # Tag Badge
  $fontBadge = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
  $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 189, 248)) # Light sky blue
  $g.DrawString('ZERO-KNOWLEDGE • LOCAL-FIRST • ENCRYPTED', $fontBadge, $badgeBrush, $textX, 150)

  # Title
  $fontTitle = New-Object System.Drawing.Font('Segoe UI', 48, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString('Aegis Vault', $fontTitle, $textBrush, $textX, 195)

  # Subtitles
  $fontSub1 = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)
  $fontSub2 = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Regular)
  $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(148, 163, 184))
  
  $g.DrawString('Secure Password Manager & 2FA OTP Authenticator', $fontSub1, $subBrush, $textX, 285)
  $g.DrawString('On-screen QR Scanner • Firebase Cloud Sync • Autofill', $fontSub2, $subBrush, $textX, 335)

  $outPath = Join-Path $outDir 'promo_marquee_1400x560.jpg'
  $bmp.Save($outPath, $jpegCodec, $encoderParams)

  $g.Dispose()
  $bmp.Dispose()
  $fontBadge.Dispose()
  $fontTitle.Dispose()
  $fontSub1.Dispose()
  $fontSub2.Dispose()
  $textBrush.Dispose()
  $subBrush.Dispose()
  $badgeBrush.Dispose()
  $glowBrush.Dispose()
  $bgBrush.Dispose()
  Write-Host "Generated marquee promo: $outPath"
}

Build-SmallPromo
Build-MarqueePromo
