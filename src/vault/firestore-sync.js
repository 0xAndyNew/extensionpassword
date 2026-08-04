import { FIREBASE_CONFIG } from '../auth/firebase-config.js';

const SYNC_REQUEST_TIMEOUT_MS = 20_000;
const CHUNK_FORMAT = 'aegis-firestore-chunks-v1';
const MAX_CHUNK_CHARACTERS = 600 * 1024;
const activeSyncControllers = new Set();

export class FirebaseSyncError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'FirebaseSyncError';
    this.status = status;
    this.code = status;
    this.details = details;
  }
}

async function firebaseFetch(url, options = {}) {
  const controller = new AbortController();
  activeSyncControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new FirebaseSyncError(
        'Kết nối Firebase phản hồi quá chậm. Dữ liệu đã được lưu trên máy và Firebase sẽ thử lại ở lần đồng bộ tiếp theo.',
        408,
        { reason: 'request-timeout' }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    activeSyncControllers.delete(controller);
  }
}

export function abortActiveSyncRequests() {
  for (const controller of activeSyncControllers) controller.abort();
}

async function readErrorDetails(response) {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

async function assertOk(response, message) {
  if (!response.ok) {
    throw new FirebaseSyncError(message, response.status, await readErrorDetails(response));
  }
  return response;
}

function resolveUid(userUid, filename) {
  if (userUid && userUid !== 'default') return userUid;
  const match = String(filename || '').match(/aegis_vault_(.+)\.json/);
  if (match && match[1]) return match[1];
  return userUid || 'default';
}

function getDocumentUrl(userUid, filename = '') {
  const uid = resolveUid(userUid, filename);
  const projectId = FIREBASE_CONFIG.projectId || 'extension-login-60851';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/vault/snapshot`;
}

function getChunkDocumentUrl(userUid, commitId, index) {
  const base = getDocumentUrl(userUid);
  const chunkId = `${commitId}_${String(index).padStart(5, '0')}`;
  return `${base}/chunks/${encodeURIComponent(chunkId)}`;
}

function fieldString(doc, name) {
  return doc?.fields?.[name]?.stringValue || '';
}

function fieldInteger(doc, name) {
  const value = Number(doc?.fields?.[name]?.integerValue);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function createCommitId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function splitIntoChunks(value) {
  const chunks = [];
  for (let offset = 0; offset < value.length; offset += MAX_CHUNK_CHARACTERS) {
    chunks.push(value.slice(offset, offset + MAX_CHUNK_CHARACTERS));
  }
  return chunks.length ? chunks : [''];
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function writeChunk(accessToken, userUid, commitId, index, data) {
  const url = new URL(getChunkDocumentUrl(userUid, commitId, index));
  url.searchParams.set('currentDocument.exists', 'false');
  const response = await firebaseFetch(url.href, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        format: { stringValue: CHUNK_FORMAT },
        commitId: { stringValue: commitId },
        index: { integerValue: String(index) },
        data: { stringValue: data }
      }
    })
  });
  await assertOk(response, 'Không thể tải một phần dữ liệu vault lên Firebase Cloud Firestore.');
}

async function readChunk(accessToken, userUid, commitId, index) {
  const response = await firebaseFetch(getChunkDocumentUrl(userUid, commitId, index), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  await assertOk(response, 'Không thể tải đầy đủ dữ liệu vault từ Firebase Cloud Firestore.');
  const doc = await response.json();
  if (fieldString(doc, 'format') !== CHUNK_FORMAT || fieldString(doc, 'commitId') !== commitId || fieldInteger(doc, 'index') !== index) {
    throw new FirebaseSyncError('Một phần dữ liệu vault trên Firebase không hợp lệ.', 422);
  }
  return fieldString(doc, 'data');
}

async function deletePreviousChunks(accessToken, userUid, commitId, chunkCount) {
  if (!commitId || !Number.isSafeInteger(chunkCount) || chunkCount < 1) return;
  await Promise.allSettled(Array.from({ length: chunkCount }, async (_, index) => {
    await firebaseFetch(getChunkDocumentUrl(userUid, commitId, index), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }));
}

/**
 * Returns vault snapshot metadata or null if not found
 */
export async function findVaultDocuments(accessToken, filename, userUid = 'default') {
  if (!accessToken) return [];
  const url = getDocumentUrl(userUid, filename);
  const response = await firebaseFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 404) return [];
  await assertOk(response, 'Không thể kiểm tra tệp vault trên Firebase.');
  const doc = await response.json();
  if (Array.isArray(doc.files)) return doc.files;
  return doc ? [{
    id: doc.name,
    name: filename || 'aegis-vault.json',
    modifiedTime: doc.updateTime || doc.fields?.modifiedTime?.stringValue || new Date().toISOString(),
    etag: doc.updateTime || '1',
    version: 1,
    commitId: fieldString(doc, 'commitId') || null,
    chunkCount: fieldInteger(doc, 'chunkCount')
  }] : [];
}

export async function findVaultDocument(accessToken, filename, userUid = 'default') {
  if (!accessToken) return null;
  const url = getDocumentUrl(userUid, filename);
  const response = await firebaseFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 404) return null;
  await assertOk(response, 'Không thể kiểm tra tệp vault trên Firebase.');
  const doc = await response.json();
  
  return {
    id: doc.name,
    name: filename || 'aegis-vault.json',
    modifiedTime: doc.updateTime || doc.fields?.modifiedTime?.stringValue || new Date().toISOString(),
    etag: doc.updateTime || '1',
    version: 1,
    commitId: fieldString(doc, 'commitId') || null,
    chunkCount: fieldInteger(doc, 'chunkCount')
  };
}

function resolveUidFromFileId(fileId, userUid) {
  if (userUid && userUid !== 'default') return userUid;
  const match = String(fileId || '').match(/users\/([^\/]+)\/vault/);
  if (match && match[1]) return match[1];
  return resolveUid(userUid, fileId);
}

export async function readVaultDocumentSnapshot(accessToken, fileId, userUid = 'default') {
  const uid = resolveUidFromFileId(fileId, userUid);
  const url = getDocumentUrl(uid);
  const response = await firebaseFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 404) {
    throw new FirebaseSyncError('Không tìm thấy bản ghi vault trên Firebase Cloud Firestore.', 404);
  }
  await assertOk(response, 'Không thể tải dữ liệu từ Firebase Cloud Firestore.');
  
  try {
    const doc = await response.json();
    let rawEnvelope = doc.fields?.envelopeData?.stringValue;
    const format = fieldString(doc, 'format');
    const commitId = fieldString(doc, 'commitId');
    const chunkCount = fieldInteger(doc, 'chunkCount');
    if (!rawEnvelope && format === CHUNK_FORMAT && commitId && chunkCount) {
      const chunks = await Promise.all(Array.from(
        { length: chunkCount },
        (_, index) => readChunk(accessToken, uid, commitId, index)
      ));
      rawEnvelope = chunks.join('');
      const expectedHash = fieldString(doc, 'envelopeHash');
      if (!expectedHash || await sha256Hex(rawEnvelope) !== expectedHash) {
        throw new FirebaseSyncError('Dữ liệu vault trên Firebase không vượt qua kiểm tra toàn vẹn.', 422);
      }
    }
    if (!rawEnvelope) throw new FirebaseSyncError('Dữ liệu vault trên Firebase trống.', 422);
    const envelope = JSON.parse(rawEnvelope);
    return {
      envelope,
      etag: doc.updateTime || '1',
      fileId: doc.name || fileId,
      commitId: commitId || null,
      chunkCount
    };
  } catch (err) {
    if (err instanceof FirebaseSyncError) throw err;
    throw new FirebaseSyncError('Tệp vault trên Firebase không phải JSON hợp lệ.', 422, err);
  }
}

export async function readVaultDocument(accessToken, fileId, userUid = 'default') {
  return (await readVaultDocumentSnapshot(accessToken, fileId, userUid)).envelope;
}

export async function writeVaultDocument(
  accessToken,
  filename,
  contentObj,
  {
    expectedEtag = null,
    expectedAbsent = false,
    previousCommitId = null,
    previousChunkCount = null,
    userUid = 'default'
  } = {}
) {
  const uid = resolveUid(userUid, filename);
  const url = new URL(getDocumentUrl(uid, filename));
  if (expectedEtag) url.searchParams.set('currentDocument.updateTime', expectedEtag);
  if (expectedAbsent) url.searchParams.set('currentDocument.exists', 'false');

  const rawEnvelope = JSON.stringify(contentObj);
  const commitId = createCommitId();
  const chunks = splitIntoChunks(rawEnvelope);
  const envelopeHash = await sha256Hex(rawEnvelope);
  await Promise.all(chunks.map((data, index) => writeChunk(accessToken, uid, commitId, index, data)));

  const payload = {
    fields: {
      format: { stringValue: CHUNK_FORMAT },
      commitId: { stringValue: commitId },
      chunkCount: { integerValue: String(chunks.length) },
      envelopeHash: { stringValue: envelopeHash },
      envelopeBytes: { integerValue: String(new TextEncoder().encode(rawEnvelope).byteLength) },
      modifiedTime: { stringValue: new Date().toISOString() }
    }
  };

  const response = await firebaseFetch(url.href, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await readErrorDetails(response);
    await deletePreviousChunks(accessToken, uid, commitId, chunks.length);
    const reason = response.status === 412
      ? (details?.reason || (expectedAbsent ? 'expected-absent' : 'etag-refresh-failed'))
      : response.status === 409
        ? (details?.reason || 'duplicate-remote-files')
        : null;
    throw new FirebaseSyncError(
      'Không thể cập nhật tệp trên Firebase Cloud Firestore.',
      response.status,
      { reason, details }
    );
  }

  const doc = await response.json();
  const etag = doc.updateTime || new Date().toISOString();
  void deletePreviousChunks(accessToken, uid, previousCommitId, previousChunkCount);
  
  return {
    id: doc.name || 'firestore-snapshot',
    name: filename || 'aegis-vault.json',
    modifiedTime: doc.updateTime || new Date().toISOString(),
    etag,
    commitId,
    chunkCount: chunks.length
  };
}
