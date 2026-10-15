import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const background = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');

function handlerBranch(type, endMarker) {
  const start = background.indexOf(`  if (message.type === '${type}') {`);
  const end = background.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return `(async function(message, context) { ${background.slice(start, end)} })`;
}

test('language lookup returns only en/vi before authentication without exposing storage', async () => {
  const source = handlerBranch('GET_UI_LANGUAGE', "  if (message.type === 'GOOGLE_STATUS')");
  assert.ok(background.indexOf("message.type === 'GET_UI_LANGUAGE'") < background.indexOf('const user = await requireUser()'));
  for (const value of ['vi', 'en', undefined, 'unexpected']) {
    const handle = runInNewContext(source, {
      chrome: { storage: { local: { get: async key => {
        assert.equal(key, 'aegisLanguage');
        return { aegisLanguage: value, aegisSessionPassword: 'never-return-this' };
      } } } }
    });
    const result = await handle({ type: 'GET_UI_LANGUAGE' }, { kind: 'content' });
    assert.equal(JSON.stringify(result), JSON.stringify({ language: value === 'vi' ? 'vi' : 'en' }));
  }
});

test('QR import keeps unrelated decrypted seeds inside trusted extension responses', async () => {
  const source = handlerBranch('SAVE_QR_URI', "  if (message.type === 'LIST_ALL')");
  const unrelated = { id: 'private', issuer: 'Unrelated', secret: 'PRIVATE-SEED' };
  for (const kind of ['content', 'extension']) {
    const vault = { otpAccounts: [unrelated] };
    const handle = runInNewContext(source, {
      chrome: { tabs: { get: async () => ({ active: true, windowId: 3 }) }, storage: { session: { set: async () => {} } } },
      Number, Array, Date, crypto: { randomUUID: () => 'new-id' },
      vault, password: 'test-only', user: { sub: 'test-user' },
      parseOtpQrUri: () => [{ issuer: 'New', account: 'new@example.test', secret: 'NEW-SEED' }],
      asText: value => value, otpIdentity: item => item.secret,
      writeVaultLocal: async () => {}, appendPendingMutations: async () => {}, rememberPendingQrSync: async () => {},
      scheduleDeferredQrSync: async () => {}, setQrActionBadge: async () => {},
      OPEN_OTP_TAB_SESSION_KEY: 'open', LAST_QR_SAVED_SESSION_KEY: 'saved'
    });
    const response = await handle({ type: 'SAVE_QR_URI', uri: 'test-uri' }, { kind, tabId: 7, windowId: 3 });
    assert.equal(response.importedCount, 1);
    if (kind === 'content') {
      assert.equal('otpAccounts' in response, false);
      assert.doesNotMatch(JSON.stringify(response), /PRIVATE-SEED|NEW-SEED/);
    } else {
      assert.equal(response.otpAccounts.length, 2);
    }
  }
});

test('content capture text uses background language lookup and falls back safely', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async function getCaptureText()');
  const end = source.indexOf('  function setImportantStyle', start);
  const vi = { label: 'Vietnamese' }, en = { label: 'English' };
  for (const response of [{ ok: true, language: 'vi' }, { ok: true, language: 'en' }, { ok: false }, null]) {
    const getText = runInNewContext(`${source.slice(start, end)}; getCaptureText`, {
      CAPTURE_TEXT: { vi, en }, chrome: { runtime: { sendMessage: async request => {
        assert.equal(request.type, 'GET_UI_LANGUAGE');
        return response;
      } } }
    });
    assert.equal(await getText(), response?.ok && response.language === 'vi' ? vi : en);
  }
  const selector = await readFile(new URL('../src/content/qr-selector.js', import.meta.url), 'utf8');
  assert.match(selector, /type: 'GET_UI_LANGUAGE'/);
  assert.doesNotMatch(selector, /chrome\.storage\.local\.get/);
});
