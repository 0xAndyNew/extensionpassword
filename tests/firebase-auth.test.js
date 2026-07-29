import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
