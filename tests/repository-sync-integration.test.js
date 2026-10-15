import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createEnvelope, openEnvelope } from '../src/vault/crypto.js';
import {
  syncToFirestore,
  syncFromFirestore,
  adoptStagedRemote,
  resolveSyncConflict,
  exportPreCloudRecovery,
  writeVault,
  writeVaultLocal,
  readVault,
  unlockVault,
  hasVault,
  manualSyncVault,
  compareVaultSnapshots,
  legacyCommitIdForMetadata,
  __resetVaultCacheForTests
} from '../src/vault/repository.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');

const googleSub = 'sync-user-one';
const password = 'correct horse battery staple';
const user = { sub: googleSub, email: 'sync@example.com' };

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

function response(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() {
      return structuredClone(body);
    },
    async text() {
      return JSON.stringify(body);
    },
    clone() {
      return response(body, { status, headers });
    }
  };
}

function vaultData(meta, credentialId = meta.commitId) {
  return {
    owner: { googleSub, email: user.email },
    credentials: [{
      id: credentialId,
      title: 'Example',
      username: 'alice',
      password: 'secret',
      origins: ['https://example.com']
    }],
    otpAccounts: [],
    excludedOrigins: [],
    settings: {},
    _meta: meta
  };
}

function mockEnvironment(t, drive) {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const local = memoryStorageArea({ aegisGoogleUser: user });
  const sync = memoryStorageArea();
  const session = memoryStorageArea();
  let patchCount = 0;
  let createCount = 0;
  drive.chunks ||= new Map();
  globalThis.chrome = {
    storage: { local, sync, session },
    runtime: {
      id: 'test-extension-id',
      getManifest() {
        return {
          oauth2: {
            client_id: '1234567890-aegisvaulttests.apps.googleusercontent.com',
            scopes: [
              'openid',
              'email',
              'profile'
            ]
          }
        };
      }
    },
    identity: {
      getRedirectURL(path = '') {
        return `https://test-extension-id.chromiumapp.org/${path}`;
      },
      async launchWebAuthFlow({ url }) {
        const request = new URL(url);
        const redirectUri = request.searchParams.get('redirect_uri');
        const state = request.searchParams.get('state');
        return `${redirectUri}#access_token=test-firebase-id-token&expires_in=3600&state=${state}`;
      },
      async removeCachedAuthToken() {},
      async clearAllCachedAuthTokens() {}
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const requestUrl = new URL(href);
    const chunkMatch = decodeURIComponent(requestUrl.pathname).match(/\/vault\/snapshot\/chunks\/([^/]+)$/);
    if (href.includes('identitytoolkit.googleapis.com')) return response(user);
    if ((!options.method || options.method === 'GET') && chunkMatch) {
      const chunk = drive.chunks.get(chunkMatch[1]);
      if (!chunk) return response({ message: 'Not found' }, { status: 404 });
      return response({
        name: `projects/test/databases/(default)/documents/users/${googleSub}/vault/snapshot/chunks/${chunkMatch[1]}`,
        fields: {
          format: { stringValue: 'aegis-firestore-chunks-v1' },
          commitId: { stringValue: chunk.commitId },
          index: { integerValue: String(chunk.index) },
          data: { stringValue: chunk.data }
        }
      });
    }
    if ((!options.method || options.method === 'GET') && href.includes('firestore.googleapis.com')) {
      if (typeof drive.onMedia === 'function') {
        const custom = await drive.onMedia({ drive });
        if (custom) return custom;
      }
      if (Array.isArray(drive.files) && drive.files.length > 1) {
        return response({ files: drive.files });
      }
      if (!drive.envelope && (!drive.files || !drive.files.length)) {
        return response({ message: 'Not found' }, { status: 404 });
      }
      return response({
        name: drive.fileId || 'firestore-snapshot',
        updateTime: drive.etag || '2026-07-28T00:00:00.000Z',
        fields: drive.metaFields || {
          envelopeData: { stringValue: JSON.stringify(drive.envelope) },
          modifiedTime: { stringValue: '2026-07-28T00:00:00.000Z' }
        }
      }, { headers: { etag: drive.etag || '"etag-1"' } });
    }
    if (options.method === 'PATCH' && chunkMatch) {
      const body = JSON.parse(options.body);
      drive.chunks.set(chunkMatch[1], {
        commitId: body.fields.commitId.stringValue,
        index: Number(body.fields.index.integerValue),
        data: body.fields.data.stringValue
      });
      return response({ name: chunkMatch[1], updateTime: new Date().toISOString() });
    }
    if (options.method === 'DELETE' && chunkMatch) {
      drive.chunks.delete(chunkMatch[1]);
      return response(null, { status: 204 });
    }
    if (options.method === 'PATCH' || options.method === 'POST') {
      patchCount += 1;
      createCount += 1;
      if (typeof drive.onPatch === 'function') {
        const custom = await drive.onPatch({ options, patchCount, drive, url: requestUrl });
        if (custom) return custom;
      }
      const expectedEtag = requestUrl.searchParams.get('currentDocument.updateTime');
      const expectedAbsent = requestUrl.searchParams.get('currentDocument.exists') === 'false';
      if ((expectedEtag && expectedEtag !== drive.etag) || (expectedAbsent && drive.envelope)) {
        return response({ error: 'precondition' }, { status: 412 });
      }
      try {
        const body = JSON.parse(options.body);
        if (body.fields?.envelopeData?.stringValue) {
          drive.envelope = JSON.parse(body.fields.envelopeData.stringValue);
          drive.metaFields = body.fields;
        } else if (body.fields?.format?.stringValue === 'aegis-firestore-chunks-v1') {
          drive.metaFields = body.fields;
          const commitId = body.fields.commitId.stringValue;
          const chunkCount = Number(body.fields.chunkCount.integerValue);
          const raw = Array.from({ length: chunkCount }, (_, index) => {
            const chunkId = `${commitId}_${String(index).padStart(5, '0')}`;
            return drive.chunks.get(chunkId)?.data || '';
          }).join('');
          drive.envelope = JSON.parse(raw);
        } else {
          drive.envelope = body;
        }
      } catch {}
      drive.etag = `2026-07-28T00:00:${String(patchCount + 1).padStart(2, '0')}.000Z`;
      return response(
        { name: drive.fileId || 'firestore-snapshot', updateTime: drive.etag },
        { headers: { etag: drive.etag } }
      );
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${href}`);
  };
  t.after(() => {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    __resetVaultCacheForTests();
  });
  return {
    local,
    getPatchCount: () => patchCount,
    getCreateCount: () => createCount
  };
}

test('conflict resolution never lets a device copy overwrite Firestore', async t => {
  const environment = mockEnvironment(t, {});

  await assert.rejects(
    resolveSyncConflict(googleSub, password, 'keep-local'),
    /Firestore là nguồn dữ liệu chính/
  );
  assert.equal(environment.getPatchCount(), 0);
  assert.equal(environment.getCreateCount(), 0);
});

test('unlock automatically adopts the signed-in account Firestore branch', async t => {
  const base = {
    schemaVersion: 3,
    vaultId: 'auto-drive-vault',
    revision: 1,
    commitId: 'auto-drive-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteData = vaultData({
    ...base,
    revision: 2,
    commitId: 'auto-drive-remote',
    ancestors: ['auto-drive-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'drive-copy');
  const localData = vaultData({
    ...base,
    revision: 2,
    commitId: 'auto-drive-local',
    ancestors: ['auto-drive-base'],
    updatedAt: '2026-07-28T00:02:00.000Z'
  }, 'device-copy');
  const remoteEnvelope = await createEnvelope(remoteData, password);
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, {
    envelope: remoteEnvelope,
    etag: '"auto-drive-etag"'
  });
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });

  const unlocked = await unlockVault(password, user);

  // adoptStagedRemote keeps the Firestore copy; local backup is preserved for recovery
  assert.ok(unlocked.credentials.length >= 1);
  assert.equal(
    environment.local.values.get(`aegisVault_${googleSub}_pre_cloud_recovery`).envelope.payload,
    localEnvelope.payload
  );
});

test('unlock rejects a device-only password when Firestore is authoritative', async t => {
  const localPassword = 'device-only password with enough entropy';
  const drivePassword = 'drive-only password with enough entropy';
  const meta = {
    schemaVersion: 3,
    vaultId: 'drive-password-vault',
    revision: 1,
    commitId: 'drive-password-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const localEnvelope = await createEnvelope(vaultData(meta, 'device-copy'), localPassword);
  const remoteEnvelope = await createEnvelope(vaultData({
    ...meta,
    revision: 2,
    commitId: 'drive-password-remote',
    ancestors: ['drive-password-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'drive-copy'), drivePassword);
  const environment = mockEnvironment(t, {
    envelope: remoteEnvelope,
    etag: '"drive-password-etag"'
  });
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });

  await assert.rejects(
    unlockVault(localPassword, user),
    /mật khẩu của Vault trên Firestore/
  );
  assert.equal(
    environment.local.values.get(`aegisVault_${googleSub}`).payload,
    localEnvelope.payload
  );
});

test('two same-revision device branches auto-merge and upload the union', async t => {
  const base = {
    schemaVersion: 3,
    vaultId: 'shared-vault',
    revision: 1,
    commitId: 'commit-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteData = vaultData({
    ...base,
    revision: 2,
    commitId: 'commit-device-a',
    ancestors: ['commit-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'device-a');
  const localData = vaultData({
    ...base,
    revision: 2,
    commitId: 'commit-device-b',
    ancestors: ['commit-base'],
    updatedAt: '2026-07-28T00:02:00.000Z'
  }, 'device-b');
  const remoteEnvelope = await createEnvelope(remoteData, password);
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, {
    envelope: remoteEnvelope,
    etag: '"etag-a"'
  });

  const result = await syncToFirestore(googleSub, localEnvelope, { password });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'merged');
  // The merged version was uploaded to Firestore
  assert.equal(environment.getPatchCount(), 1);
  // Verify the merged vault contains both credentials
  const mergedEnvelope = environment.local.values.get(`aegisVault_${googleSub}`);
  const mergedData = await openEnvelope(mergedEnvelope, password);
  const ids = mergedData.credentials.map(c => c.id);
  assert.ok(ids.includes('device-a'), 'merged vault must contain device-a credential');
  assert.ok(ids.includes('device-b'), 'merged vault must contain device-b credential');
});

function mergeBranches({ legacy = false, fullLineage = false } = {}) {
  const base = {
    schemaVersion: 3,
    vaultId: 'merge-regression-vault',
    revision: 8,
    commitId: 'merge-branch-a',
    ancestors: fullLineage
      ? Array.from({ length: 32 }, (_, index) => `merge-history-${index}`)
      : ['merge-shared-root'],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remote = vaultData(base, 'branch-a');
  const local = vaultData({
    ...base,
    revision: 11,
    commitId: 'merge-branch-b',
    ancestors: fullLineage
      ? Array.from({ length: 32 }, (_, index) => `local-history-${index}`)
      : ['merge-shared-root']
  }, 'branch-b');
  if (legacy) {
    local._meta.schemaVersion = 2;
    delete local._meta.commitId;
    delete local._meta.ancestors;
  }
  return { remote, local };
}

async function runMergePath(path, localEnvelope) {
  if (path === 'upload') return syncToFirestore(googleSub, localEnvelope, { password });
  if (path === 'download') return syncFromFirestore(googleSub, password);
  await syncFromFirestore(googleSub);
  return adoptStagedRemote(googleSub, password);
}

function assertCredentialUnion(data, expected = ['branch-a', 'branch-b']) {
  assert.deepEqual(data.credentials.map(item => item.id).sort(), [...expected].sort());
}

for (const path of ['upload', 'download', 'adoption']) {
  for (const staleDirection of ['upload', 'download']) {
    test(`${path} merge has two fresh parents and survives stale A descendant ${staleDirection}`, async t => {
      const branches = mergeBranches();
      const localEnvelope = await createEnvelope(branches.local, password);
      const drive = { envelope: await createEnvelope(branches.remote, password), etag: 'merge-etag' };
      const environment = mockEnvironment(t, drive);
      const key = `aegisVault_${googleSub}`;
      await environment.local.set({ [key]: localEnvelope });

      const result = await runMergePath(path, localEnvelope);
      assert.equal(result.ok, true);
      const mergedEnvelope = environment.local.values.get(key);
      const merged = await openEnvelope(mergedEnvelope, password);
      assertCredentialUnion(merged);
      assert.notEqual(merged._meta.commitId, branches.remote._meta.commitId);
      assert.notEqual(merged._meta.commitId, branches.local._meta.commitId);
      assert.equal(merged._meta.revision, 12);
      assert.deepEqual(merged._meta.ancestors.slice(0, 2), ['merge-branch-a', 'merge-branch-b']);
      assert.equal(compareVaultSnapshots({ data: merged }, { data: branches.remote }), 1);
      assert.equal(compareVaultSnapshots({ data: merged }, { data: branches.local }), 1);
      assert.deepEqual(await openEnvelope(drive.envelope, password), merged);
      assert.equal(environment.getPatchCount(), 1, 'all merge paths must acknowledge the union');
      if (path === 'adoption') {
        assert.equal(environment.local.values.get(`${key}_pre_cloud_recovery`).envelope.payload, localEnvelope.payload);
      }

      const staleDescendant = structuredClone(branches.remote);
      staleDescendant._meta = {
        ...staleDescendant._meta,
        revision: 99,
        commitId: 'stale-a-descendant',
        ancestors: ['merge-branch-a', ...branches.remote._meta.ancestors]
      };
      const staleEnvelope = await createEnvelope(staleDescendant, password);
      if (staleDirection === 'download') {
        drive.envelope = staleEnvelope;
        drive.metaFields = null;
        drive.etag = 'stale-descendant-etag';
      } else {
        await environment.local.set({ [key]: staleEnvelope });
      }
      const retry = staleDirection === 'download'
        ? await syncFromFirestore(googleSub, password)
        : await syncToFirestore(googleSub, staleEnvelope, { password });
      assert.equal(retry.ok, true);
      assertCredentialUnion(await openEnvelope(environment.local.values.get(key), password));
      assertCredentialUnion(await openEnvelope(drive.envelope, password));
      if (staleDirection === 'upload') {
        // Restore device A's saved merged snapshot, then download the version
        // published by device B's real conditional upload of its stale branch.
        await environment.local.set({ [key]: mergedEnvelope });
        __resetVaultCacheForTests();
        const downloaded = await syncFromFirestore(googleSub, password);
        assert.equal(downloaded.ok, true);
        assertCredentialUnion(await readVault(password, googleSub));
      }
    });
  }
}

for (const path of ['upload', 'download', 'adoption']) {
  test(`${path} merge caps ancestry after preserving both direct parents and legacy identity`, async t => {
    const branches = mergeBranches({ legacy: true, fullLineage: true });
    const localEnvelope = await createEnvelope(branches.local, password);
    const drive = { envelope: await createEnvelope(branches.remote, password), etag: 'lineage-cap-etag' };
    const environment = mockEnvironment(t, drive);
    await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });
    const result = await runMergePath(path, localEnvelope);
    assert.equal(result.ok, true);
    const merged = await openEnvelope(drive.envelope, password);
    assert.equal(merged._meta.ancestors.length, 32);
    assert.equal(new Set(merged._meta.ancestors).size, 32);
    assert.deepEqual(merged._meta.ancestors.slice(0, 2), [
      'merge-branch-a', legacyCommitIdForMetadata(branches.local._meta)
    ]);
    assert.equal(compareVaultSnapshots({ data: merged }, { data: branches.local }), 1);
  });

  for (const failure of ['offline', '412']) {
    test(`${path} merge retains local union and journals after ${failure}, then safely retries`, async t => {
      const branches = mergeBranches();
      const localEnvelope = await createEnvelope(branches.local, password);
      let failed = false;
      const drive = {
        envelope: await createEnvelope(branches.remote, password),
        etag: 'failure-before-etag',
        async onPatch({ drive: current }) {
          if (failed) return null;
          failed = true;
          if (failure === 'offline') throw new Error('merged upload offline');
          const competing = vaultData({
            ...branches.remote._meta,
            commitId: 'competing-branch-c',
            ancestors: ['merge-branch-a']
          }, 'branch-c');
          current.envelope = await createEnvelope(competing, password);
          current.etag = 'failure-after-etag';
          return response({ error: 'precondition' }, { status: 412 });
        }
      };
      const environment = mockEnvironment(t, drive);
      const key = `aegisVault_${googleSub}`;
      await environment.local.set({ [key]: localEnvelope });
      const first = await runMergePath(path, localEnvelope);
      assert.equal(first.ok, false);
      assert.notEqual(first.status.state, 'synced');
      assert.equal(first.status.reason, failure === 'offline' ? 'upload-pending' : 'etag-mismatch');
      const savedUnion = await openEnvelope(environment.local.values.get(key), password);
      assertCredentialUnion(savedUnion);
      const pending = environment.local.values.get(`${key}_pending_upload`);
      assert.equal(pending.localCommitId, savedUnion._meta.commitId);
      assert.equal(pending.baseRemoteCommitId, branches.remote._meta.commitId);
      if (path !== 'upload' || failure === '412') {
        assert.ok(environment.local.values.get(`${key}_remote_staging`));
      }
      if (path === 'adoption') {
        assert.equal(environment.local.values.get(`${key}_pre_cloud_recovery`).envelope.payload, localEnvelope.payload);
      }

      const retry = await manualSyncVault(password, googleSub);
      assert.equal(retry.ok, true);
      assert.equal(retry.status.state, 'synced');
      const expected = failure === '412' ? ['branch-a', 'branch-b', 'branch-c'] : ['branch-a', 'branch-b'];
      assertCredentialUnion(await openEnvelope(environment.local.values.get(key), password), expected);
      assertCredentialUnion(await openEnvelope(drive.envelope, password), expected);
      assert.equal(environment.local.values.has(`${key}_pending_upload`), false);
      assert.equal(environment.local.values.has(`${key}_remote_staging`), false);
      assert.equal(environment.getPatchCount(), 2);
    });
  }
}

test('adoption returns the saved union when its upload preflight discovers another branch', async t => {
  const branches = mergeBranches();
  const localEnvelope = await createEnvelope(branches.local, password);
  const remoteEnvelope = await createEnvelope(branches.remote, password);
  const competing = vaultData({
    ...branches.remote._meta,
    commitId: 'adopt-preflight-branch-c',
    ancestors: ['merge-branch-a']
  }, 'branch-c');
  const competingEnvelope = await createEnvelope(competing, password);
  let mediaReads = 0;
  const drive = {
    envelope: remoteEnvelope,
    etag: 'adopt-before-etag',
    onMedia({ drive: current }) {
      mediaReads += 1;
      // Staging and adoption each list/read the old remote, then upload lists
      // the changed remote. The new version must be merged into returned data.
      if (mediaReads === 5) {
        current.envelope = competingEnvelope;
        current.etag = 'adopt-preflight-etag';
      }
      return null;
    }
  };
  const environment = mockEnvironment(t, drive);
  const key = `aegisVault_${googleSub}`;
  await environment.local.set({ [key]: localEnvelope });
  await syncFromFirestore(googleSub);
  const adopted = await adoptStagedRemote(googleSub, password);
  assert.equal(adopted.ok, true);
  assertCredentialUnion(adopted.data, ['branch-a', 'branch-b', 'branch-c']);
  assert.deepEqual(adopted.data, await openEnvelope(environment.local.values.get(key), password));
  assert.deepEqual(adopted.data, await openEnvelope(drive.envelope, password));
  assert.equal(environment.local.values.get(`${key}_pre_cloud_recovery`).envelope.payload, localEnvelope.payload);
});

test('an ETag race stages the re-read competing snapshot instead of overwriting it', async t => {
  const baseMeta = {
    schemaVersion: 3,
    vaultId: 'etag-vault',
    revision: 1,
    commitId: 'etag-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const baseData = vaultData(baseMeta, 'base');
  const localData = vaultData({
    ...baseMeta,
    revision: 2,
    commitId: 'etag-local',
    ancestors: ['etag-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'local');
  const competingData = vaultData({
    ...baseMeta,
    revision: 2,
    commitId: 'etag-remote',
    ancestors: ['etag-base'],
    updatedAt: '2026-07-28T00:02:00.000Z'
  }, 'remote');
  const drive = {
    envelope: await createEnvelope(baseData, password),
    etag: '"etag-1"',
    async onPatch({ drive: current }) {
      current.envelope = await createEnvelope(competingData, password);
      current.etag = '"etag-2"';
      return response({ error: 'precondition' }, { status: 412 });
    }
  };
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, drive);

  const result = await syncToFirestore(googleSub, localEnvelope, { password });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'etag-mismatch');
  assert.equal(environment.getPatchCount(), 1);
  const staged = environment.local.values.get(`aegisVault_${googleSub}_remote_staging`);
  assert.equal(staged.envelope.payload, drive.envelope.payload);
  assert.equal(staged.file.etag, '"etag-2"');
});

test('a failed post-412 refresh reports retryable error without fake resolvable staging', async t => {
  const baseMeta = {
    schemaVersion: 3,
    vaultId: 'etag-refresh-vault',
    revision: 1,
    commitId: 'etag-refresh-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const baseData = vaultData(baseMeta, 'base');
  const localData = vaultData({
    ...baseMeta,
    revision: 2,
    commitId: 'etag-refresh-local',
    ancestors: ['etag-refresh-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'local');
  const drive = {
    envelope: await createEnvelope(baseData, password),
    etag: '"etag-before-race"',
    refreshMustFail: false,
    onPatch({ drive: current }) {
      current.refreshMustFail = true;
      return response({ error: 'precondition' }, { status: 412 });
    },
    onMedia({ drive: current }) {
      if (current.refreshMustFail) throw new Error('simulated refresh outage');
      return null;
    }
  };
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, drive);

  const result = await syncToFirestore(googleSub, localEnvelope, { password });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'etag-refresh-failed');
  assert.equal(result.status.state, 'error');
  assert.equal(result.status.retryable, true);
  assert.equal(
    environment.local.values.has(`aegisVault_${googleSub}_remote_staging`),
    false
  );
});

test('failed password-rotation upload retries safely using persisted ETag proof', async t => {
  const oldPassword = 'old correct horse battery staple';
  const newPassword = 'new correct horse battery staple';
  const baseMeta = {
    schemaVersion: 3,
    vaultId: 'rotation-vault',
    revision: 4,
    commitId: 'rotation-base',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteData = vaultData(baseMeta, 'base');
  const localData = vaultData({
    ...baseMeta,
    revision: 5,
    commitId: 'rotation-local',
    ancestors: ['rotation-base'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  }, 'rotated');
  const drive = {
    envelope: await createEnvelope(remoteData, oldPassword),
    etag: '"rotation-etag"',
    failFirstPatch: true,
    onPatch({ drive: current }) {
      if (current.failFirstPatch) {
        current.failFirstPatch = false;
        throw new Error('simulated offline upload');
      }
      return null;
    }
  };
  const localEnvelope = await createEnvelope(localData, newPassword);
  const environment = mockEnvironment(t, drive);
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });
  const preflight = {
    file: { id: 'drive-file', etag: drive.etag },
    envelope: drive.envelope,
    data: remoteData
  };

  const first = await syncToFirestore(googleSub, localEnvelope, {
    password: newPassword,
    remotePassword: oldPassword,
    preflight
  });
  assert.equal(first.ok, false);
  assert.equal(first.status.reason, 'upload-pending');
  assert.equal(first.status.retryable, true);
  assert.ok(environment.local.values.get(`aegisVault_${googleSub}_pending_upload`));

  const retry = await syncFromFirestore(googleSub, newPassword);
  assert.equal(retry.ok, true);
  assert.equal(retry.action, 'uploaded');
  assert.equal(environment.getPatchCount(), 2);
  assert.equal(
    environment.local.values.has(`aegisVault_${googleSub}_pending_upload`),
    false
  );
});

test('new cloud password stages local mismatch, then explicit adoption preserves encrypted recovery', async t => {
  const oldPassword = 'old local password with enough entropy';
  const newPassword = 'new cloud password with enough entropy';
  const localMeta = {
    schemaVersion: 3,
    vaultId: 'adopt-vault',
    revision: 2,
    commitId: 'adopt-local',
    ancestors: ['adopt-root'],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteMeta = {
    ...localMeta,
    revision: 3,
    commitId: 'adopt-cloud',
    ancestors: ['adopt-local', 'adopt-root'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  };
  const localEnvelope = await createEnvelope(vaultData(localMeta, 'local'), oldPassword);
  const remoteEnvelope = await createEnvelope(vaultData(remoteMeta, 'cloud'), newPassword);
  const environment = mockEnvironment(t, {
    envelope: remoteEnvelope,
    etag: '"adopt-etag"'
  });
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });

  const staged = await syncFromFirestore(googleSub, newPassword);
  assert.equal(staged.ok, false);
  assert.equal(staged.reason, 'local-password-mismatch');
  assert.equal(staged.status.state, 'staged');
  assert.equal(
    environment.local.values.get(`aegisVault_${googleSub}`).payload,
    localEnvelope.payload
  );

  const adopted = await adoptStagedRemote(googleSub, newPassword);
  assert.equal(adopted.ok, true);
  assert.equal(adopted.status.recoveryAvailable, true);
  assert.equal(
    environment.local.values.get(`aegisVault_${googleSub}`).payload,
    remoteEnvelope.payload
  );
  const recovery = environment.local.values.get(`aegisVault_${googleSub}_pre_cloud_recovery`);
  assert.equal(recovery.envelope.payload, localEnvelope.payload);
  const exported = await exportPreCloudRecovery(googleSub);
  assert.equal(JSON.parse(exported.backup).envelope.payload, localEnvelope.payload);
});

test('old local password plus a different remote password blocks subsequent writes', async t => {
  const localPassword = 'local password with enough entropy';
  const remotePassword = 'remote password with enough entropy';
  const localMeta = {
    schemaVersion: 3,
    vaultId: 'blocked-vault',
    revision: 2,
    commitId: 'blocked-local',
    ancestors: ['blocked-root'],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteMeta = {
    ...localMeta,
    revision: 3,
    commitId: 'blocked-cloud',
    ancestors: ['blocked-local', 'blocked-root'],
    updatedAt: '2026-07-28T00:01:00.000Z'
  };
  const localData = vaultData(localMeta, 'local');
  const localEnvelope = await createEnvelope(localData, localPassword);
  const remoteEnvelope = await createEnvelope(vaultData(remoteMeta, 'cloud'), remotePassword);
  const environment = mockEnvironment(t, {
    envelope: remoteEnvelope,
    etag: '"blocked-etag"'
  });
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });

  const conflict = await syncFromFirestore(googleSub, localPassword);
  assert.equal(conflict.reason, 'remote-password-mismatch');
  assert.equal(conflict.status.state, 'conflict');
  await assert.rejects(
    writeVault(structuredClone(localData), localPassword, googleSub),
    error => error.code === 'SYNC_CONFLICT_PENDING'
  );
  assert.equal(environment.getPatchCount(), 0);
});

test('duplicate same-name Firestore files report a non-resolvable error state', async t => {
  const localData = vaultData({
    schemaVersion: 3,
    vaultId: 'duplicate-vault',
    revision: 1,
    commitId: 'duplicate-local',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  }, 'local');
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, {
    files: [
      { id: 'duplicate-one', modifiedTime: '2026-07-28T00:01:00.000Z' },
      { id: 'duplicate-two', modifiedTime: '2026-07-28T00:02:00.000Z' }
    ],
    envelope: null,
    etag: null
  });

  const result = await syncToFirestore(googleSub, localEnvelope, { password });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'duplicate-remote-files');
  assert.equal(result.status.state, 'error');
  assert.equal(result.status.retryable, false);
  assert.equal(
    environment.local.values.has(`aegisVault_${googleSub}_remote_staging`),
    false
  );
  assert.equal(environment.getPatchCount(), 0);
});

test('unscoped legacy vault is claimed only after a successful unlock and migration', async t => {
  const legacyPassword = 'legacy password with enough entropy';
  const legacyData = {
    credentials: [],
    excludedOrigins: [],
    settings: {}
  };
  const legacyEnvelope = await createEnvelope(legacyData, legacyPassword);
  const drive = { envelope: null, etag: null };
  const environment = mockEnvironment(t, drive);
  await environment.local.set({ aegisVault: legacyEnvelope });

  await assert.rejects(unlockVault('wrong legacy password', user));
  assert.equal(environment.local.values.has('aegisLegacyOwnerClaim'), false);
  assert.equal(environment.local.values.has(`aegisVault_${googleSub}`), false);

  const unlocked = await unlockVault(legacyPassword, user);
  assert.equal(unlocked.owner.googleSub, googleSub);
  assert.equal(
    environment.local.values.get('aegisLegacyOwnerClaim').googleSub,
    googleSub
  );
  assert.equal(environment.local.values.get('aegisVault').payload, legacyEnvelope.payload);
  assert.equal(environment.local.values.has(`aegisVault_${googleSub}`), true);
  assert.equal(await hasVault('another-google-user'), false);
});

test('manual sync uploads an unlocked local-only vault when Firestore is empty', async t => {
  const localData = vaultData({
    schemaVersion: 3,
    vaultId: 'local-only-vault',
    revision: 1,
    commitId: 'local-only-commit',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  }, 'local-only');
  const localEnvelope = await createEnvelope(localData, password);
  const environment = mockEnvironment(t, {
    envelope: null,
    etag: null
  });
  await environment.local.set({ [`aegisVault_${googleSub}`]: localEnvelope });

  const result = await manualSyncVault(password, googleSub);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'uploaded');
  assert.equal(result.remoteFound, false);
  assert.equal(result.status.state, 'synced');
  assert.equal(environment.getCreateCount(), 1);
});

test('a locally saved QR OTP remains visible and is uploaded by deferred sync', async t => {
  const baseData = vaultData({
    schemaVersion: 3,
    vaultId: 'qr-save-vault',
    revision: 1,
    commitId: 'qr-base-commit',
    ancestors: [],
    updatedAt: '2026-07-28T00:00:00.000Z'
  }, 'qr-base');
  const baseEnvelope = await createEnvelope(baseData, password);
  const drive = {
    envelope: structuredClone(baseEnvelope),
    etag: '"qr-base-etag"'
  };
  const environment = mockEnvironment(t, drive);
  await environment.local.set({ [`aegisVault_${googleSub}`]: baseEnvelope });

  const changed = structuredClone(baseData);
  changed.otpAccounts.push({
    id: 'qr-otp-id',
    issuer: 'Google',
    account: 'qr@example.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: '2026-07-28T00:01:00.000Z',
    updatedAt: '2026-07-28T00:01:00.000Z'
  });

  await writeVaultLocal(changed, password, googleSub);
  assert.equal((await readVault(password, googleSub)).otpAccounts[0].id, 'qr-otp-id');

  const sync = await manualSyncVault(password, googleSub);
  assert.equal(sync.ok, true);
  assert.equal(sync.action, 'uploaded');
  assert.equal((await readVault(password, googleSub)).otpAccounts[0].id, 'qr-otp-id');
  assert.equal((await openEnvelope(drive.envelope, password)).otpAccounts[0].id, 'qr-otp-id');
});
