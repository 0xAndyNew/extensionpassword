import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { replayPendingMutations } from '../src/vault/pending-mutations.js';

const source = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');
const start = source.indexOf('async function syncPendingLocalMutations(');
const end = source.indexOf('async function runAutomaticSync()', start);

for (const action of ['merged', 'downloaded']) {
  test(`${action} sync replays pending deletes before clearing the mutation journal`, async () => {
    const localBefore = { credentials: [], otpAccounts: [], notes: [] };
    const merged = { credentials: [{ id: 'deleted-login' }, { id: 'remote-login' }], otpAccounts: [], notes: [] };
    let cleared = 0, writes = 0;
    const run = runInNewContext(`${source.slice(start, end)}; syncPendingLocalMutations`, {
      getPendingMutations: async () => [{ kind: 'credential-delete', id: 'deleted-login' }],
      pendingMutationSource: async () => localBefore,
      readVault: async () => merged,
      manualSyncVault: async () => ({ ok: true, action, status: { state: 'synced' } }),
      replayPendingMutations,
      writeVault: async data => {
        writes++;
        assert.deepEqual(data.credentials.map(item => item.id), ['remote-login']);
        assert.equal(cleared, 0, 'do not clear before the replayed write is acknowledged');
        return { sync: { ok: true, action: 'uploaded' } };
      },
      clearPendingMutations: async () => { cleared++; }, clearQrSyncCoveredBy: async () => {}
    });
    assert.equal(await run({ sub: 'test-user' }, 'test-password'), true);
    assert.equal(writes, 1);
    assert.equal(cleared, 1);
  });
}

test('failed adoption keeps pending mutations and does not replay against an unacknowledged result', async () => {
  let cleared = false;
  const run = runInNewContext(`${source.slice(start, end)}; syncPendingLocalMutations`, {
    getPendingMutations: async () => [{ kind: 'credential-delete', id: 'deleted-login' }],
    pendingMutationSource: async () => ({ credentials: [] }),
    readVault: async () => ({ credentials: [] }),
    manualSyncVault: async () => ({ ok: false, status: { state: 'conflict' } }),
    adoptStagedRemoteIfPresent: async () => ({ ok: false, status: { state: 'error', error: 'Upload offline' } }),
    writeVault: async () => assert.fail('must not clear a failed adoption by writing again'),
    clearPendingMutations: async () => { cleared = true; }
  });
  await assert.rejects(run({ sub: 'test-user' }, 'test-password'), /Upload offline/);
  assert.equal(cleared, false);
});
