import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setLanguage, t, translateDocument } from '../src/i18n.js';

const source = await readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8');
const auth = source.slice(source.indexOf('function authMode('), source.indexOf('function renderVaultLoading('));
const retry = source.slice(source.indexOf('async function retryAuthStatus('), source.indexOf('// Vault Auth Action'));

function harness() {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { dataset: {}, textContent: '', value: '', disabled: false, focused: false,
        focus() { this.focused = true; },
        classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v),
          toggle: (v, on) => on ? classes.add(v) : classes.delete(v) } });
    }
    return elements.get(id);
  };
  for (const match of html.matchAll(/id="([^"]+)"[^>]*data-i18n="([^"]+)"/g)) $(match[1]).dataset.i18n = match[2];
  const doc = { querySelectorAll: selector => selector === '[data-i18n]'
    ? [...elements.values()].filter(e => e.dataset.i18n) : [] };
  const requests = [];
  const context = { $, t, signedIn: true, vaultUnlocked: false, popupClosed: false, authState: null,
    setAccountControls() {}, l: en => en, showVault: async () => { context.vaultUnlocked = true; },
    send: async message => { requests.push(message); return { ok: true }; },
    sendReadWithRetry: async () => ({ ok: true, exists: true, canCreate: false, unlocked: false }) };
  runInNewContext(auth + '\n' + retry, context);
  return { $, context, requests, translate: () => translateDocument(doc) };
}

for (const language of ['en', 'vi']) test(`auth translation preserves blocked, create and unlock control state (${language})`, async () => {
  await setLanguage(language);
  const h = harness();
  for (const [exists, canCreate, key, disabled] of [
    [false, false, 'waitingFirebase', true], [false, true, 'createVaultBtn', false], [true, false, 'unlockBtnText', false]
  ]) {
    h.context.authMode(exists, canCreate);
    h.translate();
    assert.equal(h.$('authButton').textContent, t(key));
    assert.equal(h.$('masterPassword').disabled, disabled);
    assert.equal(h.$('authButton').disabled, disabled);
    assert.equal(h.$('authRetryButton').classList.contains('hidden'), !disabled);
    assert.equal(h.$('authButton').dataset.exists, String(exists));
  }
  await setLanguage('en');
});

for (const exists of [true, false]) test(`Firebase retry enables password input after verified ${exists ? 'existing' : 'absent'} remote vault`, async () => {
  const h = harness();
  h.context.authMode(false, false);
  h.context.sendReadWithRetry = async () => ({ ok: true, exists, canCreate: !exists, unlocked: false });
  await h.context.retryAuthStatus();
  h.translate();
  assert.deepEqual(h.requests.map(message => message.type), ['SYNC_NOW']);
  assert.equal(h.$('masterPassword').disabled, false);
  assert.equal(h.$('authButton').disabled, false);
  assert.equal(h.$('authButton').dataset.exists, String(exists));
  assert.equal(h.$('masterPassword').focused, true);
});

test('failed Firebase retry retains creation protection and shows the error, then permits retry', async () => {
  const h = harness();
  h.context.authMode(false, false);
  h.context.sendReadWithRetry = async () => ({ ok: true, exists: false, canCreate: false, syncStatus: { error: 'Network unavailable' } });
  await h.context.retryAuthStatus();
  assert.equal(h.$('masterPassword').disabled, true);
  assert.equal(h.$('authButton').disabled, true);
  assert.equal(h.$('error').textContent, 'Network unavailable');
  assert.equal(h.$('authRetryButton').disabled, false);
});

test('Firebase retry blocks duplicate clicks and ignores response after popup closes', async () => {
  const h = harness();
  h.context.authMode(false, false);
  let finish;
  h.context.send = async message => { h.requests.push(message); return new Promise(resolve => { finish = resolve; }); };
  const pending = h.context.retryAuthStatus();
  await h.context.retryAuthStatus();
  assert.equal(h.requests.length, 1);
  h.context.popupClosed = true;
  finish({ ok: true });
  await pending;
  assert.equal(h.$('masterPassword').disabled, true);
});
