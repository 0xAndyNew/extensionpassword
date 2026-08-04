import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('normal credential and OTP mutations save locally before background Firestore sync', async () => {
  const [background, popup, repository] = await Promise.all([
    readFile(new URL('../src/background.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/vault/repository.js', import.meta.url), 'utf8')
  ]);

  assert.match(background, /async function writeVaultLocalFirst\(vault, password, googleSub, operations\)/);
  assert.match(background, /await writeVaultLocal\(vault, password, googleSub\)/);
  assert.match(background, /await appendPendingMutations\(googleSub, operations\)/);
  assert.match(background, /\{ kind: 'credential-upsert', id: savedItem\.id \}/);
  assert.match(background, /\{ kind: 'credential-delete', id \}/);
  assert.match(background, /\{ kind: 'otp-upsert', id: savedItem\.id \}/);
  assert.match(background, /\{ kind: 'otp-delete', id \}/);
  assert.match(background, /\{ kind: 'otp-reorder', ids \}/);
  assert.match(background, /respond\(\{ ok: true, \.\.\.publicResult \}\);[\s\S]*enqueueMutation\(runAutomaticSync\)/);
  assert.match(background, /isForegroundMutation && automaticSyncInFlight[\s\S]*abortActiveSyncRequests\(\)/);
  assert.match(background, /automaticSyncInFlight = true;[\s\S]*finally \{[\s\S]*automaticSyncInFlight = false/);
  assert.match(background, /aegisPendingMutations_/);
  assert.match(background, /async function syncPendingLocalMutations\(user, password\)/);
  assert.match(background, /const maxMergeAttempts = 3/);
  assert.match(background, /clearQrSyncCoveredBy\(operations\)/);
  assert.match(background, /replayPendingMutations\(remoteVault, localBeforeSync, operations\)/);
  assert.match(background, /async function promotePendingQrSync\(user, password\)/);
  assert.match(background, /explicitlyDeletedIds\.has\(id\)/);
  assert.match(background, /upsertIds\.map\(id => \(\{ kind: 'otp-upsert', id \}\)\)/);
  assert.match(background, /await adoptStagedRemoteIfPresent\(user\.sub, password\);[\s\S]*return;/);
  assert.doesNotMatch(background, /console\.error\('Đồng bộ/);
  assert.match(repository, /\{ currentPassword = backupPassword, upload = true \}/);
  assert.match(popup, /Đang mã hóa và lưu an toàn trên máy/);
  assert.match(popup, /Đã lưu OTP · đang tự đồng bộ Firebase/);
});
