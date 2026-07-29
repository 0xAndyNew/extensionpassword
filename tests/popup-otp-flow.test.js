import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('OTP editor exposes progress and completion feedback', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="otpFormStatus"[^>]+role="status"/);
  assert.match(source, /saveButton\.textContent = busy \? 'Đang lưu…' : 'Lưu OTP'/);
  assert.match(source, /Đã lưu OTP và đồng bộ Firebase/);
  assert.match(source, /Array\.isArray\(response\.otpAccounts\)/);
});

test('screen scanning injects a fresh selector and lets the user choose one QR region', async () => {
  const [html, source, selector, background, manifest] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/content/qr-selector.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/background.js', import.meta.url), 'utf8'),
    readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="scanScreenMenuBtn"[^>]*>[\s\S]*Quét màn hình</);
  assert.match(html, /id="scanImportMenuBtn"[^>]*>[\s\S]*Import ảnh QR</);
  assert.match(html, /id="otpCameraBtn">Khoanh vùng QR</);
  assert.match(html, /id="headerQrFile"[^>]+accept="image\/\*"/);
  assert.match(source, /chrome\.scripting\.executeScript\(\{/);
  assert.match(source, /files: \['src\/vendor\/jsqr\.js', 'src\/content\/qr-selector\.js'\]/);
  assert.match(selector, /Kéo chuột khoanh đúng 1 mã QR/);
  assert.match(selector, /cropScreenshot\(capture\.screenshot, rect\)/);
  assert.match(selector, /decodeQrCanvas\(qrCanvas\)/);
  assert.match(selector, /type: 'SAVE_QR_URI'/);
  assert.match(selector, /Đã quét xong và tự lưu mã OTP/);
  assert.match(background, /chrome\.tabs\.captureVisibleTab\(tab\.windowId, \{ format: 'png' \}\)/);
  assert.match(background, /writeVaultLocal\(vault, password, user\.sub\)/);
  assert.match(background, /DEFERRED_QR_SYNC_ALARM/);
  assert.match(background, /setBadgeText\(\{ text: success \? '✓' : '!' \}\)/);
  assert.match(background, /OPEN_OTP_TAB_SESSION_KEY/);
  assert.match(background, /LAST_QR_SAVED_SESSION_KEY/);
  assert.match(background, /PENDING_QR_SYNC_SESSION_KEY/);
  assert.match(background, /rememberPendingQrSync\(savedItem\.id\)/);
  assert.match(background, /async function promotePendingQrSync\(user, password\)/);
  assert.match(background, /upsertIds\.map\(id => \(\{ kind: 'otp-upsert', id \}\)\)/);
  assert.match(background, /clearQrSyncCoveredBy\(operations\)/);
  assert.match(background, /adoptStagedRemoteIfPresent\(user\.sub, password\)/);
  assert.match(background, /scheduleDeferredQrSync\(30_000\)/);
  assert.match(source, /scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
  assert.match(html, /\.otp-card\.just-saved/);
  assert.doesNotMatch(background, /popup\.html\?qrCapture=1/);
  assert.doesNotMatch(background, /OffscreenCanvas/);
  const permissions = JSON.parse(manifest).permissions;
  assert.ok(permissions.includes('activeTab'));
  assert.ok(permissions.includes('scripting'));
  assert.ok(permissions.includes('alarms'));
});

test('popup has no floating add button', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /id="floatAddBtn"/);
  assert.doesNotMatch(source, /floatAddBtn/);
});

test('OTP deletion asks for explicit consent and updates the list optimistically', async () => {
  const [html, source, background] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/background.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="otpDeleteCancelBtn"[^>]*>Không xóa</);
  assert.match(html, /id="otpDeleteConfirmBtn"[^>]*>Đồng ý xóa</);
  assert.match(source, /otpAccounts = otpAccounts\.filter\(item => item\.id !== id\)/);
  assert.match(source, /showOtpToast\('Đã xóa OTP trên máy'/);
  assert.match(background, /otpAccounts: vault\.otpAccounts/);
});

test('popup shows a loading state instead of a blank content area', async () => {
  const [html, source, background] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/background.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="bootView"[^>]+aria-busy="true"/);
  assert.match(html, /class="boot-row"/);
  assert.match(source, /function renderVaultLoading\(\)/);
  assert.match(source, /function renderOtpLoading\(\)/);
  assert.match(source, /async function sendReadWithRetry/);
  assert.match(source, /buttonId: 'vaultRetryBtn'/);
  assert.match(source, /buttonId: 'otpRetryBtn'/);
  assert.match(source, /sendReadWithRetry\(\{ type: 'STATUS' \}/);
  const mutatingActions = background.match(/const MUTATING_ACTIONS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  const automaticDriveActions = background.match(/const AUTO_DRIVE_ACTIONS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(mutatingActions, /'STATUS'/);
  assert.doesNotMatch(automaticDriveActions, /'STATUS'/);
  assert.match(background, /const AUTO_SYNC_ALARM = 'aegisAutoSync'/);
  assert.match(background, /periodInMinutes: 1/);
  assert.match(background, /chrome\.runtime\.onStartup\.addListener/);
  assert.match(source, /\$\('bootView'\)\.classList\.add\('hidden'\)/);
});

test('Drive requests have a finite timeout so local OTP saves do not wait forever', async () => {
  const source = await readFile(new URL('../src/vault/firebase-sync.js', import.meta.url), 'utf8');

  assert.match(source, /SYNC_REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /Firebase sẽ thử lại ở lần đồng bộ tiếp theo/);
});
