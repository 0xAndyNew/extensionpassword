import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVaultData,
  mergeVaultData
} from '../src/vault/repository.js';

test('validateVaultData accepts valid notes, cards, identities, trash, and passwordHistory', () => {
  const data = {
    credentials: [
      {
        id: 'c1',
        title: 'Test Login',
        password: 'Password123!',
        passwordHistory: [
          { password: 'OldPassword1!', changedAt: '2026-01-01T00:00:00.000Z' }
        ]
      }
    ],
    notes: [
      { id: 'n1', title: 'Secret Note', notes: 'Top secret content', favorite: true }
    ],
    cards: [
      { id: 'cd1', title: 'Visa Card', cardholderName: 'John Doe', cardNumber: '4111222233334444', cvv: '123' }
    ],
    identities: [
      { id: 'i1', title: 'My Profile', fullName: 'John Doe', email: 'john@example.com' }
    ],
    trash: [
      {
        id: 't1',
        itemType: 'credential',
        originalItem: { id: 'c0', title: 'Old Account' },
        deletedAt: new Date().toISOString()
      }
    ]
  };

  const validated = validateVaultData(data);
  assert.equal(validated.credentials.length, 1);
  assert.equal(validated.credentials[0].passwordHistory.length, 1);
  assert.equal(validated.notes.length, 1);
  assert.equal(validated.cards.length, 1);
  assert.equal(validated.identities.length, 1);
  assert.equal(validated.trash.length, 1);
});

test('validateVaultData rejects malformed passwordHistory or invalid trash items', () => {
  assert.throws(() => {
    validateVaultData({
      credentials: [
        {
          id: 'c1',
          passwordHistory: 'invalid-string'
        }
      ]
    });
  }, /Lịch sử mật khẩu/);

  assert.throws(() => {
    validateVaultData({
      credentials: [],
      trash: [{ invalidField: true }]
    });
  }, /thùng rác/);
});

test('mergeVaultData correctly merges notes, cards, identities, and trash items', () => {
  const localData = {
    credentials: [{ id: 'c1', title: 'Local Cred' }],
    notes: [{ id: 'n1', title: 'Local Note', updatedAt: '2026-01-01T00:00:00.000Z' }],
    cards: [{ id: 'cd1', title: 'Local Card' }],
    identities: [],
    trash: [{ id: 't1', itemType: 'credential', originalItem: { id: 'c0' }, deletedAt: '2026-01-01T00:00:00.000Z' }]
  };

  const remoteData = {
    credentials: [{ id: 'c2', title: 'Remote Cred' }],
    notes: [{ id: 'n1', title: 'Remote Note (Newer)', updatedAt: '2026-02-01T00:00:00.000Z' }],
    cards: [{ id: 'cd2', title: 'Remote Card' }],
    identities: [{ id: 'i1', title: 'Remote Identity' }],
    trash: [{ id: 't2', itemType: 'otp', originalItem: { id: 'o0' }, deletedAt: '2026-01-02T00:00:00.000Z' }]
  };

  const merged = mergeVaultData(localData, remoteData);
  assert.equal(merged.credentials.length, 2);
  assert.equal(merged.notes.length, 1);
  assert.equal(merged.notes[0].title, 'Remote Note (Newer)');
  assert.equal(merged.cards.length, 2);
  assert.equal(merged.identities.length, 1);
  assert.equal(merged.trash.length, 2);
});
