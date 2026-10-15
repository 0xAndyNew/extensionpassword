import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('dashboard OTP navigation sits between Logins and Notes and uses the existing vault', async () => {
  const [html, source] = await Promise.all([read('../src/ui/options.html'), read('../src/ui/options.js')]);
  assert.match(html, /id="menuLogins"[^\n]*\n[^\n]*id="menuOtp"[^\n]*\n[^\n]*id="menuNotes"/);
  assert.match(source, /menuOtp: \$\('otpSection'\)/);
  assert.match(source, /optionsOtp\.setActive\(menuId === 'menuOtp'\)/);
  assert.match(source, /optionsOtp\.setAccounts\(managerOtpAccounts\)/);
  assert.match(source, /onAccountsChanged: accounts => \{ managerOtpAccounts = accounts; \}/);
  assert.match(source, /optionsOtp\.refreshLanguage\(\)/);
  assert.doesNotMatch(html, /<iframe/);
});

test('dashboard OTP controls have unique IDs, QR import, and explicit delete confirmation', async () => {
  const html = await read('../src/ui/options.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['otpSection', 'otpList', 'addOtpBtn', 'scanScreenMenuBtn', 'scanImportMenuBtn',
    'otpModal', 'otpQrModal', 'otpCopyToast', 'otpSaveBtn', 'otpCancelBtn', 'otpScanPicker',
    'otpScanTab', 'otpScanStartBtn', 'otpScanCancelBtn', 'otpDeleteConfirm', 'otpDeleteConfirmBtn', 'otpDeleteCancelBtn']) {
    assert.ok(ids.includes(id), `Missing dashboard OTP control: ${id}`);
  }
  assert.match(html, /id="otpQrFile"[^>]*accept="image\/\*"/);
  assert.match(html, /id="headerQrFile"[^>]*accept="image\/\*"/);
  assert.match(html, /id="otpDeleteConfirm"[^>]*role="alertdialog"/);
  assert.match(html, /id="otpQrSecretWarning"|data-i18n="otpQrSecretWarning"/);
  assert.match(html, /href="options-otp\.css"/);
});

test('dashboard release versions stay synchronized', async () => {
  const [manifest, pkg] = await Promise.all([read('../manifest.json'), read('../package.json')]);
  assert.equal(JSON.parse(manifest).version, JSON.parse(pkg).version);
  assert.match(JSON.parse(pkg).scripts.check, /node --check src\/ui\/options-otp\.js/);
});
