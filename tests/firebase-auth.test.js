import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getFirebaseIdToken,
  getFirebaseUser,
  signOutFirebase,
  isMicrosoftEdge,
  normalizeGoogleWebClientId
} from '../src/auth/firebase-auth.js';
import { isFirebaseConfigured } from '../src/auth/firebase-config.js';

const WEB_CLIENT_ID = '1234567890-aegisvaultedge.apps.googleusercontent.com';

test('isMicrosoftEdge distinguishes Edge from Chrome user agents', () => {
  assert.equal(
    isMicrosoftEdge('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0'),
    true
  );
  assert.equal(
    isMicrosoftEdge('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36'),
    false
  );
});

test('normalizeGoogleWebClientId accepts a public Google client id and rejects invalid formats', () => {
  assert.equal(normalizeGoogleWebClientId(`  ${WEB_CLIENT_ID}  `), WEB_CLIENT_ID);
  assert.throws(() => normalizeGoogleWebClientId('not-a-client-secret'), /không hợp lệ/i);
  assert.equal(normalizeGoogleWebClientId('', { allowEmpty: true }), '');
});

test('isFirebaseConfigured returns boolean indicating configuration status', () => {
  assert.equal(typeof isFirebaseConfigured(), 'boolean');
});

function storageArea(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async get(keys) {
      const result = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (values.has(key)) result[key] = values.get(key);
      }
      return result;
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
    async setAccessLevel() {},
    values
  };
}

function authChrome({ user, tokens }) {
  const local = storageArea({ aegisFirebaseUser: user, aegisFirebaseTokens: tokens });
  const session = storageArea();
  return {
    chrome: {
      storage: { local, session },
      runtime: { id: 'production-extension-id' }
    },
    local,
    session
  };
}

test('Firebase tokens are rejected when they belong to another stored user', async t => {
  const originalChrome = globalThis.chrome;
  const environment = authChrome({
    user: { sub: 'user-b' },
    tokens: { uid: 'user-a', idToken: 'token-a', refreshToken: 'refresh-a', expiresAt: Date.now() + 60_000 }
  });
  globalThis.chrome = environment.chrome;
  t.after(() => { globalThis.chrome = originalChrome; });

  await assert.rejects(
    getFirebaseIdToken(),
    error => error?.code === 'TOKEN_OWNER_MISMATCH'
  );
  assert.equal(environment.local.values.has('aegisFirebaseTokens'), false);
});

test('an expired Firebase ID token is not reused after refresh fails', async t => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const environment = authChrome({
    user: { sub: 'user-a' },
    tokens: { uid: 'user-a', idToken: 'expired-token', refreshToken: 'revoked-refresh', expiresAt: Date.now() - 60_000 }
  });
  globalThis.chrome = environment.chrome;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'revoked' } }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
  t.after(() => {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    getFirebaseIdToken(),
    error => error?.code === 'RECONNECT_REQUIRED'
  );
});

for (const identities of [
  { aegisFirebaseUser: { sub: 'modern' } },
  { aegisGoogleUser: { sub: 'legacy' } },
  { aegisFirebaseUser: { sub: 'modern' }, aegisGoogleUser: { sub: 'legacy' } }
]) {
  test(`sign-out clears identity keys ${Object.keys(identities).join(', ')} without removing the vault`, async t => {
    const originalChrome = globalThis.chrome;
    const local = storageArea({ ...identities, aegisFirebaseTokens: { idToken: 'local-token' }, aegisVault_modern: { encrypted: true } });
    const session = storageArea({ ...identities, aegisFirebaseTokens: { idToken: 'session-token' } });
    globalThis.chrome = { storage: { local, session } };
    t.after(() => { globalThis.chrome = originalChrome; });
    await signOutFirebase();
    assert.equal(await getFirebaseUser(), null);
    for (const area of [local, session]) {
      for (const key of ['aegisFirebaseUser', 'aegisGoogleUser', 'aegisFirebaseTokens']) assert.equal(area.values.has(key), false);
    }
    assert.deepEqual(local.values.get('aegisVault_modern'), { encrypted: true });
  });
}

test('Google OAuth requests only an ID token and validates the returned state', async () => {
  const source = await readFile(new URL('../src/auth/firebase-auth.js', import.meta.url), 'utf8');
  assert.match(source, /response_type:\s*'id_token'/);
  assert.doesNotMatch(source, /response_type:\s*'id_token token'/);
  assert.match(source, /hashParams\.get\('state'\)\s*!==\s*state/);
});
