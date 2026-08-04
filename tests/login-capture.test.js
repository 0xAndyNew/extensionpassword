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
