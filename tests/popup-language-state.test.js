import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext, runInContext } from 'node:vm';

const source = await readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
const authFunctions = source.slice(source.indexOf('function authMode('), source.indexOf('function renderVaultLoading('));
const languageFunction = source.slice(source.indexOf('function updateLangUI('), source.indexOf('function initLanguageUI('));

function harness(state) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { textContent: '', value: '', disabled: false, dataset: {},
        classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v),
          toggle: (v, on) => on ? classes.add(v) : classes.delete(v) } });
    }
    return elements.get(id);
  };
  const context = { $, renderCount: 0, translateDocument() {}, setAccountControls() {} };
  const vi = { unlockVaultHeader: 'Mở khóa kho bảo mật', unlockBtnText: 'Mở khóa →', waitingFirebase: 'Đang chờ Firebase' };
  runInNewContext(`let activeLanguage = 'en', signedIn = false, vaultUnlocked = false, authState = null;
    function t(key, fallback) { return activeLanguage === 'vi' ? (vi[key] || fallback) : fallback; }
    function render() { renderCount++; }
    ${authFunctions}\n${languageFunction}`, Object.assign(context, { vi }));
  $('googleView').classList.add('hidden'); $('authView').classList.add('hidden'); $('vaultView').classList.add('hidden');
  if (state === 'signed-out') {
    // Stale authentication metadata must not make the signed-out view become locked.
    runInContext('authState = { exists: true, canCreate: true };', context);
    $('authButton').dataset.exists = 'true';
    $('googleView').classList.remove('hidden');
  } else {
    runInContext('signedIn = true; authMode(true, true);', context);
    if (state === 'unlocked') {
      runInContext('vaultUnlocked = true;', context);
      $('authView').classList.add('hidden'); $('vaultView').classList.remove('hidden');
    }
  }
  return { $, context };
}

for (const state of ['signed-out', 'locked', 'unlocked']) test(`language changes vi/en preserve ${state} authentication state`, () => {
  const { $, context } = harness(state);
  for (const language of ['vi', 'en']) {
    context.updateLangUI(language);
    assert.equal(runInContext('vaultUnlocked', context), state === 'unlocked');
    assert.equal($('googleView').classList.contains('hidden'), state !== 'signed-out');
    assert.equal($('authView').classList.contains('hidden'), state !== 'locked');
    assert.equal($('vaultView').classList.contains('hidden'), state !== 'unlocked');
    if (state === 'locked') assert.equal($('authButton').textContent, language === 'vi' ? 'Mở khóa →' : 'Unlock →');
  }
  assert.equal(context.renderCount, state === 'unlocked' ? 2 : 0);
});

test('language changes retain blocked creation state instead of deriving it from button busy state', () => {
  const { $, context } = harness('locked');
  runInContext('authMode(false, false);', context);
  for (const language of ['vi', 'en']) {
    context.updateLangUI(language);
    assert.equal($('authButton').disabled, true);
    assert.equal($('masterPassword').disabled, true);
    assert.equal($('authButton').textContent, language === 'vi' ? 'Đang chờ Firebase' : 'Waiting for Firebase');
    assert.equal(runInContext('vaultUnlocked', context), false);
  }
});
