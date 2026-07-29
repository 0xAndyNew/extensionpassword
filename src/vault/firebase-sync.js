import { FIREBASE_CONFIG, isFirebaseConfigured } from '../auth/firebase-config.js';

const SYNC_REQUEST_TIMEOUT_MS = 20_000;
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

export function abortActiveDriveRequests() {
  for (const controller of activeSyncControllers) controller.abort();
}

export function abortActiveSyncRequests() {
  abortActiveDriveRequests();
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

/**
 * Returns vault snapshot metadata or null if not found
 */
export async function findVaultFiles(accessToken, filename, userUid = 'default') {
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
    version: 1
  }] : [];
}

export async function findVaultFile(accessToken, filename, userUid = 'default') {
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
    version: 1
  };
}

function resolveUidFromFileId(fileId, userUid) {
  if (userUid && userUid !== 'default') return userUid;
  const match = String(fileId || '').match(/users\/([^\/]+)\/vault/);
  if (match && match[1]) return match[1];
  return resolveUid(userUid, fileId);
}

export async function readVaultFileSnapshot(accessToken, fileId, userUid = 'default') {
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
    const rawEnvelope = doc.fields?.envelopeData?.stringValue;
    if (!rawEnvelope) {
      throw new FirebaseSyncError('Dữ liệu vault trên Firebase trống.', 422);
    }
    const envelope = JSON.parse(rawEnvelope);
    return {
      envelope,
      etag: doc.updateTime || '1',
      fileId: doc.name || fileId
    };
  } catch (err) {
    if (err instanceof FirebaseSyncError) throw err;
    throw new FirebaseSyncError('Tệp vault trên Firebase không phải JSON hợp lệ.', 422, err);
  }
}

export async function readVaultFile(accessToken, fileId, userUid = 'default') {
  return (await readVaultFileSnapshot(accessToken, fileId, userUid)).envelope;
}

export async function writeVaultFile(
  accessToken,
  filename,
  contentObj,
  { expectedEtag = null, expectedAbsent = false, userUid = 'default' } = {}
) {
  const url = getDocumentUrl(userUid, filename);
  
  if (expectedAbsent) {
    const existing = await findVaultFile(accessToken, filename, userUid);
    if (existing) {
      throw new FirebaseSyncError(
        'Vault trên Firebase đã tồn tại trước khi tải lên.',
        412,
        { reason: 'expected-absent', file: existing }
      );
    }
  }

  const payload = {
    fields: {
      envelopeData: { stringValue: JSON.stringify(contentObj) },
      modifiedTime: { stringValue: new Date().toISOString() }
    }
  };

  const response = await firebaseFetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await readErrorDetails(response);
    const reason = response.status === 412
      ? (details?.reason || 'etag-refresh-failed')
      : response.status === 409
        ? 'duplicate-remote-files'
        : null;
    throw new FirebaseSyncError(
      'Không thể cập nhật tệp trên Firebase Cloud Firestore.',
      response.status,
      { reason, details }
    );
  }

  const doc = await response.json();
  const etag = doc.updateTime || new Date().toISOString();
  
  return {
    id: doc.name || 'firestore-snapshot',
    name: filename || 'aegis-vault.json',
    modifiedTime: doc.updateTime || new Date().toISOString(),
    etag
  };
}
