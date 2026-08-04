import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coalescePendingMutations,
  replayPendingMutations
} from '../src/vault/pending-mutations.js';

test('pending mutation queue keeps only the latest operation per item and OTP order', () => {
  const operations = coalescePendingMutations(
    [
      { kind: 'credential-upsert', id: 'login-1' },
      { kind: 'otp-reorder', ids: ['otp-1', 'otp-2'] }
    ],
    [
      { kind: 'credential-delete', id: 'login-1' },
      { kind: 'otp-upsert', id: 'otp-2' },
      { kind: 'otp-reorder', ids: ['otp-2', 'otp-1'] }
    ]
  );

  assert.deepEqual(operations, [
    { kind: 'credential-delete', id: 'login-1' },
    { kind: 'otp-upsert', id: 'otp-2' },
    { kind: 'otp-reorder', ids: ['otp-2', 'otp-1'] }
  ]);
  assert.deepEqual(
    coalescePendingMutations(operations, [{ kind: 'replace-vault' }]),
    [{ kind: 'replace-vault' }]
  );
});

test('pending local operations replay on top of a newer Firestore vault without losing unrelated data', () => {
  const driveVault = {
    owner: { googleSub: 'user-1', email: 'user@example.com' },
    credentials: [
      { id: 'login-1', title: 'Old local value', username: 'old', password: 'old' },
      { id: 'drive-only', title: 'Firestore only', username: 'drive', password: 'drive' }
    ],
    otpAccounts: [
      { id: 'otp-delete', issuer: 'Delete me', account: 'old', secret: 'AAAA' },
      { id: 'otp-drive', issuer: 'Firestore', account: 'drive', secret: 'BBBB' }
    ],
    excludedOrigins: [],
    settings: {},
    _meta: { vaultId: 'vault-1', revision: 4 }
  };
  const localVault = {
    ...structuredClone(driveVault),
    credentials: [
      { id: 'login-1', title: 'Updated locally', username: 'new', password: 'new' }
    ],
    otpAccounts: [
      { id: 'otp-new', issuer: 'Local OTP', account: 'local', secret: 'CCCC' }
    ]
  };
  const merged = replayPendingMutations(driveVault, localVault, [
    { kind: 'credential-upsert', id: 'login-1' },
    { kind: 'otp-delete', id: 'otp-delete' },
    { kind: 'otp-upsert', id: 'otp-new' },
    { kind: 'otp-reorder', ids: ['otp-new', 'otp-drive'] }
  ]);

  assert.equal(merged.credentials.find(item => item.id === 'login-1').username, 'new');
  assert.ok(merged.credentials.some(item => item.id === 'drive-only'));
  assert.deepEqual(merged.otpAccounts.map(item => item.id), ['otp-new', 'otp-drive']);
  assert.equal(driveVault.credentials[0].username, 'old');
});

test('replace-vault operation uses the complete encrypted-local source snapshot', () => {
  const driveVault = { credentials: [{ id: 'drive' }], otpAccounts: [] };
  const localVault = { credentials: [{ id: 'local' }], otpAccounts: [{ id: 'otp-local' }] };
  const replaced = replayPendingMutations(
    driveVault,
    localVault,
    [{ kind: 'replace-vault' }]
  );

  assert.deepEqual(replaced, localVault);
  assert.notEqual(replaced, localVault);
});
