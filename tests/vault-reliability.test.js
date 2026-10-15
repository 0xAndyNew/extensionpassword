import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createEnvelope,
  openEnvelope,
  validateEnvelope,
  MAX_KDF_ITERATIONS
} from '../src/vault/crypto.js';
import {
  compareVaultSnapshots,
  legacyCommitIdForMetadata,
  parseLegacyEnvelopeChunks,
  validateVaultData,
  inspectEncryptedBackup,
  validateNewMasterPassword,
  readVault,
  writeVaultLocal,
  hasVault,
  lockVault,
  __getVaultCacheStatsForTests,
  __resetVaultCacheForTests
} from '../src/vault/repository.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');

const owner = { googleSub: 'google-user-1', email: 'owner@example.com' };

test('new master passwords must be long and not trivially guessable', () => {
  assert.throws(() => validateNewMasterPassword('123456'), /phổ biến|dễ đoán/);
  assert.throws(() => validateNewMasterPassword('Short'), /6 ký tự/);
  assert.equal(validateNewMasterPassword('Aegis!'), true);
});

test('encrypted envelope round-trips and rejects tampering', async () => {
  const data = {
    owner,
    credentials: [{ id: 'one', username: 'alice', password: 'secret' }],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {},
    _meta: {
      schemaVersion: 2,
      vaultId: 'vault-one',
      revision: 3,
      updatedAt: '2026-07-28T00:00:00.000Z'
    }
  };
  const envelope = await createEnvelope(data, 'a-strong-master-password');
  assert.deepEqual(await openEnvelope(envelope, 'a-strong-master-password'), data);

  const tampered = structuredClone(envelope);
  tampered.payload = `${tampered.payload.slice(0, -4)}AAAA`;
  await assert.rejects(openEnvelope(tampered, 'a-strong-master-password'), /không đúng|bị hỏng/);
});

test('envelope validation bounds KDF before decryption', () => {
  const malformed = {
    version: 1,
    kdf: {
      name: 'PBKDF2-SHA-256',
      iterations: MAX_KDF_ITERATIONS + 1,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA=='
    },
    cipher: { name: 'AES-256-GCM', nonce: 'AAAAAAAAAAAAAAAA' },
    payload: 'AAAAAAAAAAAAAAAAAAAAAA=='
  };
  assert.throws(() => validateEnvelope(malformed), /KDF/);
});

test('legacy chunks are assembled only after bounded validation', async () => {
  const envelope = await createEnvelope({
    owner,
    credentials: [],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {}
  }, 'a-strong-master-password');
  const serialized = JSON.stringify(envelope);
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += 37) {
    chunks.push(serialized.slice(offset, offset + 37));
  }
  assert.deepEqual(parseLegacyEnvelopeChunks(chunks), envelope);
  assert.throws(() => parseLegacyEnvelopeChunks(['not-json']), /bị hỏng/);
});

test('conflict comparison protects a populated vault from a newer empty vault', () => {
  const populated = {
    data: {
      credentials: [{ id: 'one' }],
      otpAccounts: [],
      _meta: { vaultId: 'local', revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' }
    },
    envelope: { updatedAt: '2026-01-01T00:00:00.000Z' }
  };
  const newerEmpty = {
    data: {
      credentials: [],
      otpAccounts: [],
      _meta: { vaultId: 'cloud', revision: 99, updatedAt: '2026-12-01T00:00:00.000Z' }
    },
    envelope: { updatedAt: '2026-12-01T00:00:00.000Z' }
  };
  assert.equal(compareVaultSnapshots(populated, newerEmpty), 1);
  assert.equal(compareVaultSnapshots(newerEmpty, populated), -1);
});

test('different populated vault lineages report a conflict', () => {
  const snapshot = vaultId => ({
    data: {
      credentials: [{ id: vaultId }],
      otpAccounts: [],
      _meta: { vaultId, revision: 1, updatedAt: '2026-07-28T00:00:00.000Z' }
    },
    envelope: { updatedAt: '2026-07-28T00:00:00.000Z' }
  });
  assert.equal(compareVaultSnapshots(snapshot('local'), snapshot('cloud')), null);
});

test('authenticated ancestry wins while same-revision sibling commits conflict', () => {
  const baseMeta = {
    schemaVersion: 3,
    vaultId: 'shared-vault',
    revision: 7,
    commitId: 'commit-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const snapshot = meta => ({
    data: {
      owner,
      credentials: [{ id: 'one' }],
      otpAccounts: [],
      excludedOrigins: [],
      settings: {},
      _meta: meta
    },
    envelope: { payload: meta.commitId, updatedAt: meta.updatedAt }
  });
  const child = {
    ...baseMeta,
    revision: 8,
    commitId: 'commit-child',
    ancestors: ['commit-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  };
  const sibling = {
    ...baseMeta,
    revision: 8,
    commitId: 'commit-sibling',
    ancestors: ['commit-base'],
    updatedAt: '2026-07-28T00:02:00.000Z'
  };

  assert.equal(compareVaultSnapshots(snapshot(child), snapshot(baseMeta)), 1);
  assert.equal(compareVaultSnapshots(snapshot(baseMeta), snapshot(child)), -1);
  assert.equal(compareVaultSnapshots(snapshot(child), snapshot(sibling)), null);
});

test('legacy metadata can be an authenticated parent without timestamp LWW', () => {
  const legacyMeta = {
    schemaVersion: 2,
    vaultId: 'legacy-vault',
    revision: 4,
    updatedAt: '2026-07-20T00:00:00.000Z'
  };
  const legacyCommit = legacyCommitIdForMetadata(legacyMeta);
  const legacy = {
    data: {
      owner,
      credentials: [{ id: 'legacy' }],
      otpAccounts: [],
      _meta: legacyMeta
    },
    envelope: { payload: 'legacy-payload' }
  };
  const upgraded = {
    data: {
      ...legacy.data,
      _meta: {
        schemaVersion: 3,
        vaultId: 'legacy-vault',
        revision: 5,
        commitId: 'upgraded-commit',
        ancestors: [legacyCommit],
        updatedAt: '2026-07-21T00:00:00.000Z'
      }
    },
    envelope: { payload: 'upgraded-payload' }
  };
  assert.equal(compareVaultSnapshots(upgraded, legacy), 1);

  const legacySibling = structuredClone(legacy);
  legacySibling.data.credentials[0].id = 'other-device';
  legacySibling.data._meta.updatedAt = '2026-07-22T00:00:00.000Z';
  legacySibling.envelope.payload = 'legacy-sibling-payload';
  assert.equal(compareVaultSnapshots(legacy, legacySibling), null);
});

test('vault validation bounds lineage and item structures while tolerating malformed legacy OTP secrets', () => {
  const legacyData = {
    owner,
    credentials: [{
      id: 'one',
      title: 'Example',
      username: 'alice',
      password: 'secret',
      favorite: false,
      origins: ['https://example.com']
    }],
    otpAccounts: [{
      id: 'otp-one',
      issuer: 'Legacy',
      account: 'alice',
      secret: 'BAD'
    }],
    excludedOrigins: ['https://example.net'],
    settings: {},
    _meta: {
      schemaVersion: 3,
      vaultId: 'vault-one',
      revision: 1,
      commitId: 'commit-one',
      ancestors: [],
      updatedAt: '2026-07-28T00:00:00.000Z'
    }
  };
  assert.equal(validateVaultData(legacyData), legacyData);
  assert.throws(
    () => validateVaultData(legacyData, { strictOtp: true }),
    /80 bit|Base32/
  );

  const malformed = structuredClone(legacyData);
  malformed.credentials[0].favorite = 'yes';
  assert.throws(() => validateVaultData(malformed), /yêu thích/);

  const oversizedLineage = structuredClone(legacyData);
  oversizedLineage._meta.ancestors = Array.from({ length: 33 }, (_, index) => `ancestor-${index}`);
  assert.throws(() => validateVaultData(oversizedLineage), /Lịch sử commit/);
});

test('encrypted backup validates owner after authenticated decryption', async () => {
  const data = {
    owner,
    credentials: [],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {}
  };
  validateVaultData(data, { expectedGoogleSub: owner.googleSub, requireOwner: true });
  const envelope = await createEnvelope(data, 'a-strong-master-password');
  const backup = JSON.stringify({
    format: 'aegis-vault-encrypted-backup',
    version: 1,
    exportedAt: '2026-07-28T00:00:00.000Z',
    envelope
  });
  await assert.rejects(
    inspectEncryptedBackup(backup, 'a-strong-master-password', { sub: 'another-user' }),
    /tài khoản Google khác/
  );
});

function memoryStorageArea(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(keys) {
      const result = {};
      const requested = keys == null
        ? [...values.keys()]
        : Array.isArray(keys)
          ? keys
          : typeof keys === 'string'
            ? [keys]
            : Object.keys(keys);
      for (const key of requested) {
        if (values.has(key)) result[key] = values.get(key);
        else if (keys && typeof keys === 'object' && !Array.isArray(keys) && key in keys) result[key] = keys[key];
      }
      return result;
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
    async setAccessLevel() {}
  };
}

test('regular local writes retain single-parent lineage and upgrade legacy parent identities', async t => {
  const originalChrome = globalThis.chrome;
  const local = memoryStorageArea();
  globalThis.chrome = {
    storage: { local, sync: memoryStorageArea(), session: memoryStorageArea() }
  };
  t.after(() => {
    globalThis.chrome = originalChrome;
    __resetVaultCacheForTests();
  });
  const password = 'a-strong-master-password';
  const key = `aegisVault_${owner.googleSub}`;
  const data = {
    owner,
    credentials: [{ id: 'regular-write' }],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {},
    _meta: {
      schemaVersion: 2,
      vaultId: 'regular-write-vault',
      revision: 5,
      updatedAt: '2026-07-28T00:00:00.000Z'
    }
  };
  const legacyParent = legacyCommitIdForMetadata(data._meta);
  await local.set({ [key]: await createEnvelope(data, password) });
  await writeVaultLocal(structuredClone(data), password, owner.googleSub);
  const upgraded = await openEnvelope(local.values.get(key), password);
  assert.equal(upgraded._meta.vaultId, data._meta.vaultId);
  assert.equal(upgraded._meta.revision, 6);
  assert.equal(upgraded._meta.schemaVersion, 3);
  assert.deepEqual(upgraded._meta.ancestors, [legacyParent]);

  upgraded._meta.ancestors = Array.from({ length: 32 }, (_, index) => `regular-history-${index}`);
  await local.set({ [key]: await createEnvelope(upgraded, password) });
  await writeVaultLocal(structuredClone(upgraded), password, owner.googleSub);
  const next = await openEnvelope(local.values.get(key), password);
  assert.equal(next._meta.revision, 7);
  assert.notEqual(next._meta.commitId, upgraded._meta.commitId);
  assert.equal(next._meta.ancestors.length, 32);
  assert.deepEqual(next._meta.ancestors, [upgraded._meta.commitId, ...upgraded._meta.ancestors.slice(0, 31)]);
});

test('trusted memory cache avoids repeated PBKDF2 and legacy owner claims isolate accounts', async t => {
  const originalChrome = globalThis.chrome;
  t.after(() => {
    globalThis.chrome = originalChrome;
    __resetVaultCacheForTests();
  });
  const local = memoryStorageArea();
  const sync = memoryStorageArea();
  const session = memoryStorageArea();
  globalThis.chrome = {
    storage: { local, sync, session }
  };

  const password = 'a-strong-master-password';
  const data = {
    owner,
    credentials: [],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {},
    _meta: {
      schemaVersion: 3,
      vaultId: 'cache-vault',
      revision: 1,
      commitId: 'cache-commit',
      ancestors: [],
      updatedAt: '2026-07-28T00:00:00.000Z'
    }
  };
  const envelope = await createEnvelope(data, password);
  await local.set({ [`aegisVault_${owner.googleSub}`]: envelope });
  __resetVaultCacheForTests();

  const [firstRead, secondRead] = await Promise.all([
    readVault(password, owner.googleSub),
    readVault(password, owner.googleSub)
  ]);
  assert.deepEqual(firstRead, data);
  assert.deepEqual(secondRead, data);
  assert.deepEqual(await readVault(password, owner.googleSub), data);
  assert.deepEqual(
    __getVaultCacheStatsForTests(),
    { hits: 1, decryptions: 1, cached: true }
  );
  await lockVault();
  assert.equal(__getVaultCacheStatsForTests().cached, false);

  await local.remove([
    `aegisVault_${owner.googleSub}`,
    `aegisVault_${owner.googleSub}_last_good`
  ]);
  await local.set({
    aegisVault: envelope,
    aegisLegacyOwnerClaim: {
      version: 1,
      googleSub: owner.googleSub,
      claimedAt: '2026-07-28T00:00:00.000Z'
    }
  });
  assert.equal(await hasVault(owner.googleSub), true);
  assert.equal(await hasVault('another-google-user'), false);
});
