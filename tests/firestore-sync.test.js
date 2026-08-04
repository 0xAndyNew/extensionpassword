import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readVaultDocumentSnapshot,
  writeVaultDocument
} from '../src/vault/firestore-sync.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

test('Firestore writes immutable chunks before committing metadata with an update-time precondition', async t => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return jsonResponse({ name: 'snapshot', updateTime: '2026-08-04T10:00:00.000Z' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const envelope = { format: 'test', payload: 'x'.repeat(1_400_000) };
  const result = await writeVaultDocument('token', 'aegis_vault_user-1.json', envelope, {
    expectedEtag: '2026-08-04T09:00:00.000Z'
  });

  const chunkRequests = requests.filter(request => request.url.includes('/chunks/'));
  const metaRequest = requests.find(request => !request.url.includes('/chunks/'));
  assert.ok(chunkRequests.length >= 3, 'large envelopes must be split below the Firestore document limit');
  assert.ok(metaRequest, 'metadata must be committed after chunks');
  assert.equal(requests.at(-1), metaRequest);
  assert.equal(new URL(metaRequest.url).searchParams.get('currentDocument.updateTime'), '2026-08-04T09:00:00.000Z');
  assert.equal(result.chunkCount, chunkRequests.length);

  for (const request of chunkRequests) {
    assert.equal(new URL(request.url).searchParams.get('currentDocument.exists'), 'false');
    const body = JSON.parse(request.options.body);
    assert.ok(body.fields.data.stringValue.length <= 600 * 1024);
  }
});

test('new Firestore vault creation uses an atomic not-exists precondition', async t => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return jsonResponse({ name: 'snapshot', updateTime: '2026-08-04T10:00:00.000Z' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await writeVaultDocument('token', 'aegis_vault_user-2.json', { payload: 'small' }, { expectedAbsent: true });
  const metaRequest = requests.find(request => !request.url.includes('/chunks/'));
  assert.equal(new URL(metaRequest.url).searchParams.get('currentDocument.exists'), 'false');
});

test('failed metadata preconditions clean up the uncommitted chunk set', async t => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'PATCH' && !String(url).includes('/chunks/')) {
      return jsonResponse({ reason: 'etag-refresh-failed' }, { status: 412 });
    }
    return jsonResponse({ name: 'chunk', updateTime: '2026-08-04T10:00:00.000Z' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    writeVaultDocument('token', 'aegis_vault_user-cleanup.json', { payload: 'small' }, {
      expectedEtag: '2026-08-04T09:00:00.000Z'
    }),
    error => error?.status === 412
  );
  assert.equal(requests.some(request => request.options.method === 'DELETE' && request.url.includes('/chunks/')), true);
});

test('chunked Firestore snapshots are reassembled and integrity checked', async t => {
  const originalFetch = globalThis.fetch;
  const envelope = { version: 1, payload: 'payload'.repeat(200_000) };
  const raw = JSON.stringify(envelope);
  const commitId = 'commit-read';
  const chunks = [];
  for (let offset = 0; offset < raw.length; offset += 600 * 1024) chunks.push(raw.slice(offset, offset + 600 * 1024));
  const hash = await sha256Hex(raw);

  globalThis.fetch = async url => {
    const href = decodeURIComponent(String(url));
    const match = href.match(/commit-read_(\d{5})/);
    if (match) {
      const index = Number(match[1]);
      return jsonResponse({
        fields: {
          format: { stringValue: 'aegis-firestore-chunks-v1' },
          commitId: { stringValue: commitId },
          index: { integerValue: String(index) },
          data: { stringValue: chunks[index] }
        }
      });
    }
    return jsonResponse({
      name: 'projects/test/databases/(default)/documents/users/user-3/vault/snapshot',
      updateTime: '2026-08-04T10:00:00.000Z',
      fields: {
        format: { stringValue: 'aegis-firestore-chunks-v1' },
        commitId: { stringValue: commitId },
        chunkCount: { integerValue: String(chunks.length) },
        envelopeHash: { stringValue: hash }
      }
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const snapshot = await readVaultDocumentSnapshot('token', 'users/user-3/vault/snapshot');
  assert.deepEqual(snapshot.envelope, envelope);
  assert.equal(snapshot.commitId, commitId);
  assert.equal(snapshot.chunkCount, chunks.length);
});

test('legacy single-document Firestore snapshots remain readable', async t => {
  const originalFetch = globalThis.fetch;
  const envelope = { version: 1, payload: 'legacy' };
  globalThis.fetch = async () => jsonResponse({
    name: 'legacy-snapshot',
    updateTime: '2026-08-04T10:00:00.000Z',
    fields: { envelopeData: { stringValue: JSON.stringify(envelope) } }
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const snapshot = await readVaultDocumentSnapshot('token', 'legacy-snapshot', 'user-4');
  assert.deepEqual(snapshot.envelope, envelope);
  assert.equal(snapshot.commitId, null);
});

test('legacy Firestore snapshots migrate to chunk metadata on the next write', async t => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const envelope = { version: 1, payload: 'legacy-to-chunks' };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (!options.method) {
      return jsonResponse({
        name: 'projects/test/databases/(default)/documents/users/user-migrate/vault/snapshot',
        updateTime: '2026-08-04T09:00:00.000Z',
        fields: { envelopeData: { stringValue: JSON.stringify(envelope) } }
      });
    }
    return jsonResponse({
      name: 'projects/test/databases/(default)/documents/users/user-migrate/vault/snapshot',
      updateTime: '2026-08-04T10:00:00.000Z'
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const legacy = await readVaultDocumentSnapshot('token', 'legacy-snapshot', 'user-migrate');
  await writeVaultDocument('token', 'aegis_vault_user-migrate.json', legacy.envelope, {
    expectedEtag: legacy.etag,
    userUid: 'user-migrate'
  });

  const metadataRequest = requests.find(request => request.options.method === 'PATCH' && !request.url.includes('/chunks/'));
  const metadata = JSON.parse(metadataRequest.options.body);
  assert.equal(metadata.fields.format.stringValue, 'aegis-firestore-chunks-v1');
  assert.equal('envelopeData' in metadata.fields, false);
  assert.equal(new URL(metadataRequest.url).searchParams.get('currentDocument.updateTime'), legacy.etag);
});

test('corrupted chunked snapshots are rejected before decryption', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('/chunks/')) {
      return jsonResponse({
        fields: {
          format: { stringValue: 'aegis-firestore-chunks-v1' },
          commitId: { stringValue: 'bad-commit' },
          index: { integerValue: '0' },
          data: { stringValue: '{"payload":"tampered"}' }
        }
      });
    }
    return jsonResponse({
      name: 'bad-snapshot',
      updateTime: '2026-08-04T10:00:00.000Z',
      fields: {
        format: { stringValue: 'aegis-firestore-chunks-v1' },
        commitId: { stringValue: 'bad-commit' },
        chunkCount: { integerValue: '1' },
        envelopeHash: { stringValue: '0'.repeat(64) }
      }
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    readVaultDocumentSnapshot('token', 'bad-snapshot', 'user-5'),
    /toàn vẹn/
  );
});
