import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveTrustedCaptureOrigin } from '../src/login-capture.js';

const capture = {
  sourceOrigin: 'https://login.live.com',
  username: 'user@example.test',
  password: 'submitted-password'
};

test('login capture survives a trusted cross-origin redirect in the same tab flow', () => {
  assert.equal(resolveTrustedCaptureOrigin({
    currentOrigin: 'https://account.microsoft.com',
    requestedOrigin: 'https://login.live.com',
    capture,
    username: capture.username,
    password: capture.password
  }), 'https://login.live.com');
});

test('login capture rejects a spoofed origin or different credential values', () => {
  assert.throws(() => resolveTrustedCaptureOrigin({
    currentOrigin: 'https://attacker.example',
    requestedOrigin: 'https://login.live.com',
    capture: { ...capture, sourceOrigin: 'https://other.example' },
    username: capture.username,
    password: capture.password
  }), /không khớp trang nguồn/);

  assert.throws(() => resolveTrustedCaptureOrigin({
    currentOrigin: 'https://account.microsoft.com',
    requestedOrigin: 'https://login.live.com',
    capture,
    username: capture.username,
    password: 'different-password'
  }), /không khớp trang nguồn/);
});

test('same-origin capture needs no staged cross-origin proof', () => {
  assert.equal(resolveTrustedCaptureOrigin({
    currentOrigin: 'https://login.example.com',
    requestedOrigin: 'https://login.example.com',
    capture: null,
    username: 'user',
    password: 'password'
  }), 'https://login.example.com');
});

test('locked vault capture shows an unlock-and-retry notice instead of failing silently', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /function showUnlockCaptureBanner/);
  assert.match(source, /if \(!account\?\.ok\) \{[\s\S]*showUnlockCaptureBanner/);
  assert.match(source, /open\.textContent = text\.retry/);
  assert.match(source, /showSaveBanner\(username, password, intent, captureOrigin\)/);
});

test('same-page login outcome delegates comparison to the save banner', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const outcome = source.slice(
    source.indexOf('function waitForLoginOutcome'),
    source.indexOf('function queueSaveCapture')
  );
  assert.match(outcome, /showSaveBanner\(candidate\.username, candidate\.password, candidate\.intent\)/);
  assert.doesNotMatch(outcome, /type:\s*'CHECK_EXISTS'/);
});

test('an unchanged password clears the staged login capture', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /if \(account\.unchanged\) \{\s*await send\(\{ type: 'DISMISS_LOGIN_CAPTURE' \}\)/);
});

test('visible account identity outranks a remembered username on multi-step login', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const hints = source.slice(
    source.indexOf('function collectIdentityHints'),
    source.indexOf('function setNativeValue')
  );
  assert.match(hints, /rememberedUsernameAt <= REMEMBERED_USERNAME_TTL_MS/);
  assert.ok(
    hints.indexOf('regionHints.push(credential.username)') < hints.indexOf('addHint(rememberedUsername)'),
    'the account visibly selected by the page must outrank a stale remembered username'
  );
});

test('suggestion menu narrows to an exact selected-account match', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const suggestions = source.slice(
    source.indexOf('async function showSuggestions'),
    source.indexOf('function injectIcon')
  );
  assert.match(suggestions, /matchCredentialsToIdentityHints\(rankedCredentials, identityHints\)/);
  assert.match(suggestions, /exactIdentityMatches\.length\s*\? exactIdentityMatches\s*:\s*rankedCredentials/);
});

test('Google-style account chip identity is used when the username input is absent', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /function collectPageIdentityCandidates/);
  assert.match(source, /\[data-email\], \[data-identifier\], \[aria-label\]/);
  assert.match(source, /const pageIdentity = collectPageIdentityCandidates\(passwordInput\)\[0\]/);
});

test('Vietnamese Google Next button triggers login capture', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /tiếp\\s\*\(\?:tục\|theo\)/);
});

test('standalone Microsoft username fields receive an autofill icon', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /function isLikelyUsernameField/);
  assert.match(source, /phone\|mobile\|skype/);
  assert.match(source, /const usernameFields = \[\.\.\.document\.querySelectorAll\('input'\)\]/);
  assert.match(source, /for \(const input of usernameFields\) injectIcon\(input\)/);
});

test('username-step suggestion fills only the username without requesting a password', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const suggestions = source.slice(
    source.indexOf('async function showSuggestions'),
    source.indexOf('function injectIcon')
  );
  assert.match(suggestions, /const usernameOnly = input\.type !== 'password'/);
  assert.match(suggestions, /if \(usernameOnly\) \{[\s\S]*setNativeValue\(input, item\.username\)[\s\S]*return;/);
  assert.ok(
    suggestions.indexOf("if (usernameOnly)") < suggestions.indexOf("type: 'FILL'"),
    'the username-only branch must return before requesting decrypted password data'
  );
});

test('ordinary username and password forms render one smaller icon beside username', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /\.icon \{[\s\S]*width: 20px;[\s\S]*height: 20px;/);
  assert.match(source, /function findPairedPasswordField/);
  assert.match(source, /if \(!findUsernameField\(input\)\) injectIcon\(input\)/);
  assert.match(source, /const passwordIconFields = passwordFields\.filter\(input => !findUsernameField\(input\)\)/);
  assert.match(source, /const rightOutside = rect\.right \+ outsideGap/);
});

test('username icon fills both fields when a password is present in the same login form', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const suggestions = source.slice(
    source.indexOf('async function showSuggestions'),
    source.indexOf('function injectIcon')
  );
  assert.match(suggestions, /const pairedPasswordInput = input\.type !== 'password'/);
  assert.match(suggestions, /const passwordInput = input\.type === 'password' \? input : pairedPasswordInput/);
  assert.match(suggestions, /setNativeValue\(passwordInput, credential\.password\)/);
});

test('password change fallback recognizes current, new, and confirmation fields', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  const candidate = source.slice(
    source.indexOf('function getLoginCandidate'),
    source.indexOf('function rememberUsernameFrom')
  );
  assert.match(candidate, /visiblePasswords\.length === 3/);
  assert.match(candidate, /visiblePasswords\[1\]\.value === visiblePasswords\[2\]\.value/);
  assert.match(candidate, /intent: 'update'/);
});
