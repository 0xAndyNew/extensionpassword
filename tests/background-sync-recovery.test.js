import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createEnvelope, openEnvelope } from '../src/vault/crypto.js';
import { validateVaultData } from '../src/vault/repository.js';
import {
  PENDING_MUTATIONS_VERSION,
  MAX_PENDING_MUTATIONS,
  coalescePendingMutations,
  replayPendingMutations
} from '../src/vault/pending-mutations.js';

const background = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');
const user = { sub: 'pending-recovery-user' };
const password = 'pending-source-master-password';
const key = `aegisPendingMutations_${user.sub}`;
const clone = value => structuredClone(value);
const vault = (credentials = []) => ({ owner: { googleSub: user.sub }, credentials, otpAccounts: [] });
const item = (id, secret = id) => ({ id, password: secret });

function harness(initial, overrides = {}) {
  const values = new Map();
  const state = { local: clone(initial), cloud: null, qrCleared: 0, rotated: 0, ...overrides.state };
  const context = {
    structuredClone,
    PENDING_MUTATIONS_VERSION,
    MAX_PENDING_MUTATIONS,
    coalescePendingMutations,
    replayPendingMutations,
    createEnvelope,
    openEnvelope,
    validateVaultData,
    chrome: { storage: { local: {
      async get(name) { return { [name]: clone(values.get(name)) }; },
      async set(entries) { for (const [name, value] of Object.entries(entries)) values.set(name, clone(value)); },
      async remove(name) { values.delete(name); }
    } } },
    async getSessionPassword() { return password; },
    async readVault() { return clone(state.local); },
    async scheduleAutomaticSyncRetry() {},
    async clearQrSyncCoveredBy() { state.qrCleared += 1; },
    async manualSyncVault() { return { ok: true, action: 'uploaded', status: { state: 'synced' } }; },
    async adoptStagedRemoteIfPresent() { return null; },
    async writeVault(data) {
      state.local = clone(data);
      state.cloud = clone(data);
      return { sync: { ok: true, action: 'uploaded', status: { state: 'synced' } } };
    },
    async requireUser() { return user; },
    async changeMasterPassword() { state.rotated += 1; return { sync: { ok: true, status: { state: 'synced' } } }; },
    asText(value) { return value; },
    ...overrides
  };
  delete context.state;
  vm.createContext(context);
  const journalFunctions = background.slice(background.indexOf('function pendingMutationsKey('), background.indexOf('async function clearQrSyncCoveredBy('));
  const syncFunction = background.slice(background.indexOf('async function syncPendingLocalMutations('), background.indexOf('async function runAutomaticSync('));
  const handleFunction = background.slice(background.indexOf('async function handle(rawMessage,'), background.indexOf('async function handleWithAutomaticSync('));
  vm.runInContext(`${journalFunctions}\n${syncFunction}\n${handleFunction}`, context);
  return { context, state, values };
}

for (const kind of ['credential-delete', 'credential-upsert', 'replace-vault']) {
  test(`failed persisted union retains encrypted ${kind} intent through restart and retry`, async () => {
    const intended = kind === 'credential-delete' ? vault([]) : vault([item('edited', 'original-local-secret')]);
    const union = vault([item('edited', 'remote-winning-secret'), item('remote-only')]);
    const h = harness(intended, {
      async manualSyncVault() {
        h.state.local = clone(union);
        return { ok: false, status: { state: 'error' }, error: 'offline merged upload' };
      }
    });
    const operations = [{ kind, id: kind === 'replace-vault' ? undefined : 'edited' }];
    // Legacy journals gain a source before the first potentially destructive sync.
    h.values.set(key, { version: PENDING_MUTATIONS_VERSION, operations });
    await assert.rejects(h.context.syncPendingLocalMutations(user, password), /offline/);
    const persisted = clone(h.values.get(key));
    assert.ok(persisted.sourceEnvelope);
    assert.equal(JSON.stringify(persisted).includes('original-local-secret'), false);
    assert.deepEqual(await openEnvelope(persisted.sourceEnvelope, password), intended);
    assert.equal(h.state.qrCleared, 0);

    const restarted = harness(union);
    restarted.values.set(key, persisted);
    assert.equal(await restarted.context.syncPendingLocalMutations(user, password), true);
    const expected = kind === 'replace-vault' ? intended
      : kind === 'credential-delete' ? vault([item('remote-only')])
        : vault([item('edited', 'original-local-secret'), item('remote-only')]);
    assert.deepEqual(restarted.state.cloud, expected);
    assert.equal(restarted.values.has(key), false);
    assert.equal(restarted.state.qrCleared, 1);
  });
}

test('append after failed merge preserves prior payload and overlays the latest incoming edit', async () => {
  const original = vault([item('old-edit', 'preserved-old-secret')]);
  const h = harness(original);
  await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'old-edit' }]);
  h.state.local = vault([item('old-edit', 'remote-overwrite'), item('new-edit', 'new-local-secret')]);
  await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'new-edit' }]);
  const journal = h.values.get(key);
  const saved = await openEnvelope(journal.sourceEnvelope, password);
  assert.deepEqual(saved.credentials, [item('old-edit', 'preserved-old-secret'), item('new-edit', 'new-local-secret')]);
  assert.equal(JSON.stringify(journal).includes('preserved-old-secret'), false);
  await h.context.syncPendingLocalMutations(user, password);
  assert.deepEqual(h.state.cloud.credentials, saved.credentials);
});

test('new replace-vault supersedes old encrypted pending source', async () => {
  const h = harness(vault([item('old')]));
  await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'old' }]);
  h.state.local = vault([item('replacement')]);
  await h.context.appendPendingMutations(user.sub, [{ kind: 'replace-vault' }]);
  assert.deepEqual(await openEnvelope(h.values.get(key).sourceEnvelope, password), h.state.local);
});

test('backup replacement with a new password replaces an old-password source without opening it', async () => {
  const h = harness(vault([item('new-backup')]));
  h.values.set(key, {
    version: PENDING_MUTATIONS_VERSION,
    operations: [{ kind: 'credential-upsert', id: 'old' }],
    sourceEnvelope: await createEnvelope(vault([item('old')]), 'old-password')
  });
  await h.context.appendPendingMutations(user.sub, [{ kind: 'replace-vault' }]);
  assert.deepEqual(await openEnvelope(h.values.get(key).sourceEnvelope, password), h.state.local);
});

test('a second merge during replay write is replayed again before acknowledgement', async () => {
  let writes = 0;
  const h = harness(vault([]), {
    async writeVault(data) {
      writes += 1;
      if (writes === 1) {
        h.state.local = vault([item('deleted'), item('remote-only')]);
        return { sync: { ok: true, action: 'merged', status: { state: 'synced' } } };
      }
      assert.ok(h.values.has(key), 'journal must survive the merged acknowledgement');
      h.state.cloud = clone(data);
      h.state.local = clone(data);
      return { sync: { ok: true, action: 'uploaded' } };
    }
  });
  await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-delete', id: 'deleted' }]);
  h.state.local = vault([item('deleted')]);
  await h.context.syncPendingLocalMutations(user, password);
  assert.equal(writes, 2);
  assert.deepEqual(h.state.cloud.credentials, [item('remote-only')]);
  assert.equal(h.values.has(key), false);
});

for (const response of [undefined, { sync: { ok: true, action: 'merged' } }, { sync: { ok: false, error: 'offline' } }]) {
  test(`missing or nonfinal acknowledgement retains journal (${JSON.stringify(response)})`, async () => {
    const h = harness(vault([item('queued')]), { async writeVault() { return response; } });
    await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'queued' }]);
    await assert.rejects(h.context.syncPendingLocalMutations(user, password));
    assert.ok(h.values.get(key).sourceEnvelope);
    assert.equal(h.state.qrCleared, 0);
  });
}

test('wrong-password or wrong-account encrypted sources are never overwritten or acknowledged', async () => {
  for (const invalidSource of [
    await createEnvelope(vault([item('queued')]), 'different-password'),
    await createEnvelope({ ...vault([]), owner: { googleSub: 'other-user' } }, password)
  ]) {
    const h = harness(vault([item('latest')]));
    const journal = { version: PENDING_MUTATIONS_VERSION, operations: [{ kind: 'credential-upsert', id: 'queued' }], sourceEnvelope: invalidSource };
    h.values.set(key, clone(journal));
    await assert.rejects(h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'latest' }]));
    await assert.rejects(h.context.syncPendingLocalMutations(user, password));
    assert.deepEqual(h.values.get(key), journal);
  }
});

for (const fail of [false, true]) {
  test(`password rotation flushes encrypted old-password source first (flush fails: ${fail})`, async () => {
    const h = harness(vault([item('queued')]), fail ? {
      async manualSyncVault() { return { ok: false, error: 'flush offline', status: { state: 'error' } }; }
    } : {});
    await h.context.appendPendingMutations(user.sub, [{ kind: 'credential-upsert', id: 'queued' }]);
    const action = () => h.context.handle({ type: 'CHANGE_PASSWORD', currentPassword: password, newPassword: 'replacement-password' }, {});
    if (fail) {
      await assert.rejects(action(), /flush offline/);
      assert.ok(h.values.has(key));
      assert.equal(h.state.rotated, 0);
    } else {
      await action();
      assert.equal(h.values.has(key), false);
      assert.equal(h.state.rotated, 1);
    }
  });
}

for (const change of ['none', 'inactive', 'window', 'url']) {
  test(`QR capture revalidates sender tab after screenshot (${change})`, async () => {
    const before = { active: true, windowId: 7, url: 'https://example.com/login' };
    const after = { ...before };
    if (change === 'inactive') after.active = false;
    if (change === 'window') after.windowId = 8;
    if (change === 'url') after.url = 'https://example.com/other';
    const h = harness(vault([]));
    let captured = false;
    h.context.chrome.tabs = {
      async get() { return clone(captured ? after : before); },
      async captureVisibleTab() { await Promise.resolve(); captured = true; return 'private-screenshot'; }
    };
    const action = () => h.context.handle({ type: 'CAPTURE_QR_SELECTION' }, { kind: 'content', tabId: 1, windowId: 7 });
    if (change === 'none') assert.equal((await action()).screenshot, 'private-screenshot');
    else await assert.rejects(action(), /đã thay đổi/);
  });
}
