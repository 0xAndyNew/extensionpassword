import test from 'node:test';
import assert from 'node:assert/strict';
import qrcode from '../src/vendor/qrcode-generator.js';
import '../src/vendor/jsqr.js';

const jsQR = globalThis.jsQR;

test('screen scanner finds a gray OTP QR inside a full-page screenshot', () => {
  const uri = 'otpauth://totp/Google:test%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google';
  const qr = qrcode(0, 'M');
  qr.addData(uri);
  qr.make();

  const width = 1200;
  const height = 700;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255);

  const quietZone = 4;
  const moduleSize = 5;
  const qrPixels = (qr.getModuleCount() + quietZone * 2) * moduleSize;
  const offsetX = Math.floor((width - qrPixels) / 2);
  const offsetY = Math.floor((height - qrPixels) / 2);

  for (let row = 0; row < qr.getModuleCount(); row += 1) {
    for (let column = 0; column < qr.getModuleCount(); column += 1) {
      if (!qr.isDark(row, column)) continue;
      for (let y = 0; y < moduleSize; y += 1) {
        for (let x = 0; x < moduleSize; x += 1) {
          const pixelX = offsetX + (column + quietZone) * moduleSize + x;
          const pixelY = offsetY + (row + quietZone) * moduleSize + y;
          const index = (pixelY * width + pixelX) * 4;
          rgba[index] = 128;
          rgba[index + 1] = 128;
          rgba[index + 2] = 128;
          rgba[index + 3] = 255;
        }
      }
    }
  }

  const decoded = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
  assert.equal(decoded?.data, uri);
});
