import {
  createEnvelope,
  openEnvelope,
  base64ToBytes,
  validateEnvelope,
  MAX_ENVELOPE_PAYLOAD_BYTES
} from './crypto.js';
import { findVaultFiles, readVaultFileSnapshot, writeVaultFile } from './firebase-sync.js';
import { ensureTrustedStorageAccess, withFirebaseIdToken as withGoogleAccessToken } from '../auth/firebase-auth.js';
import { scorePassword } from './password-security.js';
import { normalizeSecret } from './totp.js';

const VAULT_KEY = 'aegisVault';
const SESSION_KEY = 'aegisSessionPassword';
const CHUNK_SIZE = 7500;
const MAX_LEGACY_CHUNKS = 2048;
const BACKUP_FORMAT = 'aegis-vault-encrypted-backup';
const BACKUP_VERSION = 1;
const BACKUP_MAX_JSON_BYTES = 10 * 1024 * 1024;
const LEGACY_OWNER_CLAIM_KEY = 'aegisLegacyOwnerClaim';
const LINEAGE_LIMIT = 32;
const STAGE_VERSION = 1;
const PENDING_UPLOAD_VERSION = 1;
export const MIN_MASTER_PASSWORD_LENGTH = 6;

let driveUploadTail = Promise.resolve();
let unlockedVaultCache = null;
let vaultReadInFlight = null;
const vaultCacheStats = { hits: 0, decryptions: 0 };

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneVaultData(data) {
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data));
}

function vaultStorageKey(googleSub) {
  return googleSub ? `${VAULT_KEY}_${String(googleSub)}` : VAULT_KEY;
}

function lastGoodKey(key) {
  return `${key}_last_good`;
}

function remoteStageKey(googleSub) {
  return `${vaultStorageKey(googleSub)}_remote_staging`;
}

function pendingUploadKey(googleSub) {
  return `${vaultStorageKey(googleSub)}_pending_upload`;
}

function preCloudRecoveryKey(googleSub) {
  return `${vaultStorageKey(googleSub)}_pre_cloud_recovery`;
}

function syncStatusKey(googleSub) {
  return `aegisSyncStatus_${String(googleSub)}`;
}

function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clearVaultMemoryCache() {
  unlockedVaultCache = null;
}

function envelopeCacheFingerprint(envelope) {
  return [
    envelope.version,
    envelope.kdf?.name,
    envelope.kdf?.iterations,
    envelope.kdf?.salt,
    envelope.cipher?.name,
    envelope.cipher?.nonce,
    envelope.payload
  ].join('|');
}

function setVaultMemoryCache(key, password, data, envelope) {
  unlockedVaultCache = {
    key,
    password,
    envelopeFingerprint: envelopeCacheFingerprint(envelope),
    data: cloneVaultData(data)
  };
}

export function __getVaultCacheStatsForTests() {
  return { ...vaultCacheStats, cached: Boolean(unlockedVaultCache) };
}

export function __resetVaultCacheForTests() {
  clearVaultMemoryCache();
  vaultReadInFlight = null;
  vaultCacheStats.hits = 0;
  vaultCacheStats.decryptions = 0;
}

export function validateNewMasterPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_MASTER_PASSWORD_LENGTH) {
    throw new Error(`Mật khẩu chính phải có ít nhất ${MIN_MASTER_PASSWORD_LENGTH} ký tự.`);
  }
  const score = scorePassword(password);
  if (score.reasons.includes('common')) {
    throw new Error('Mật khẩu chính quá phổ biến và dễ đoán (ví dụ: 123456). Vui lòng chọn mật khẩu khác.');
  }
  return true;
}

function requireGoogleSub(googleSub) {
  if (typeof googleSub !== 'string' || !googleSub.trim() || googleSub.length > 256) {
    throw new Error('Mã tài khoản Google không hợp lệ.');
  }
  return googleSub;
}

function validateOtpAccount(item, { strict = false } = {}) {
  if (!isPlainObject(item)) throw new Error('Tài khoản OTP không hợp lệ.');
  for (const field of ['id', 'issuer', 'account', 'secret', 'algorithm', 'createdAt', 'updatedAt']) {
    if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 16384)) {
      throw new Error('Tài khoản OTP không hợp lệ.');
    }
  }
  if (item.digits !== undefined && (!Number.isInteger(Number(item.digits)) || Number(item.digits) < 1 || Number(item.digits) > 16)) {
    throw new Error('Số chữ số OTP không hợp lệ.');
  }
  if (item.period !== undefined && (!Number.isInteger(Number(item.period)) || Number(item.period) < 1 || Number(item.period) > 3600)) {
    throw new Error('Chu kỳ OTP không hợp lệ.');
  }
  if (strict) {
    normalizeSecret(item.secret);
    const algorithm = String(item.algorithm || 'SHA1').toUpperCase().replaceAll('-', '');
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
      throw new Error('Thuật toán OTP không được hỗ trợ.');
    }
    if (![6, 7, 8].includes(Number(item.digits ?? 6))) {
      throw new Error('OTP phải có từ 6 đến 8 chữ số.');
    }
    const period = Number(item.period ?? 30);
    if (!Number.isInteger(period) || period < 5 || period > 300) {
      throw new Error('Chu kỳ OTP không hợp lệ.');
    }
  }
}

function validCommitId(value) {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function validateVaultData(
  data,
  { expectedGoogleSub, requireOwner = false, strictOtp = false } = {}
) {
  if (!isPlainObject(data)) throw new Error('Nội dung vault không hợp lệ.');
  if (!Array.isArray(data.credentials) || data.credentials.length > 100000) {
    throw new Error('Danh sách tài khoản trong vault không hợp lệ.');
  }
  for (const item of data.credentials) {
    if (!isPlainObject(item)) throw new Error('Tài khoản trong vault không hợp lệ.');
    for (const field of ['id', 'title', 'url', 'origin', 'username', 'password', 'notes', 'createdAt', 'updatedAt']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 1_000_000)) {
        throw new Error('Tài khoản trong vault không hợp lệ.');
      }
    }
    if (item.origins !== undefined) {
      if (!Array.isArray(item.origins) || item.origins.length > 1000 ||
          item.origins.some(origin => typeof origin !== 'string' || origin.length > 4096)) {
        throw new Error('Danh sách origin của tài khoản không hợp lệ.');
      }
    }
    if (item.favorite !== undefined && typeof item.favorite !== 'boolean') {
      throw new Error('Trạng thái yêu thích của tài khoản không hợp lệ.');
    }
    if (item.passwordHistory !== undefined) {
      if (!Array.isArray(item.passwordHistory) || item.passwordHistory.length > 50 ||
          item.passwordHistory.some(ph => !isPlainObject(ph) || typeof ph.password !== 'string' || typeof ph.changedAt !== 'string')) {
        throw new Error('Lịch sử mật khẩu của tài khoản không hợp lệ.');
      }
    }
  }
  if (data.otpAccounts !== undefined && (!Array.isArray(data.otpAccounts) || data.otpAccounts.length > 100000)) {
    throw new Error('Danh sách OTP trong vault không hợp lệ.');
  }
  for (const item of data.otpAccounts || []) validateOtpAccount(item, { strict: strictOtp });
  if (data.notes !== undefined && (!Array.isArray(data.notes) || data.notes.length > 100000)) {
    throw new Error('Danh sách ghi chú trong vault không hợp lệ.');
  }
  for (const item of data.notes || []) {
    if (!isPlainObject(item)) throw new Error('Ghi chú trong vault không hợp lệ.');
    for (const field of ['id', 'title', 'notes', 'createdAt', 'updatedAt']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 1_000_000)) {
        throw new Error('Ghi chú trong vault không hợp lệ.');
      }
    }
  }
  if (data.cards !== undefined && (!Array.isArray(data.cards) || data.cards.length > 100000)) {
    throw new Error('Danh sách thẻ trong vault không hợp lệ.');
  }
  for (const item of data.cards || []) {
    if (!isPlainObject(item)) throw new Error('Thẻ trong vault không hợp lệ.');
    for (const field of ['id', 'title', 'cardholderName', 'cardNumber', 'expMonth', 'expYear', 'cvv', 'notes', 'createdAt', 'updatedAt']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 1_000_000)) {
        throw new Error('Thẻ trong vault không hợp lệ.');
      }
    }
  }
  if (data.identities !== undefined && (!Array.isArray(data.identities) || data.identities.length > 100000)) {
    throw new Error('Danh sách định danh trong vault không hợp lệ.');
  }
  for (const item of data.identities || []) {
    if (!isPlainObject(item)) throw new Error('Định danh trong vault không hợp lệ.');
    for (const field of ['id', 'title', 'fullName', 'email', 'phone', 'address', 'city', 'zipCode', 'country', 'notes', 'createdAt', 'updatedAt']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 1_000_000)) {
        throw new Error('Định danh trong vault không hợp lệ.');
      }
    }
  }
  if (data.trash !== undefined && (!Array.isArray(data.trash) || data.trash.length > 100000)) {
    throw new Error('Danh sách thùng rác trong vault không hợp lệ.');
  }
  for (const item of data.trash || []) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.itemType !== 'string' || !isPlainObject(item.originalItem) || typeof item.deletedAt !== 'string') {
      throw new Error('Mục thùng rác trong vault không hợp lệ.');
    }
  }
  if (data.excludedOrigins !== undefined && (
    !Array.isArray(data.excludedOrigins)
    || data.excludedOrigins.length > 100000
    || data.excludedOrigins.some(origin => typeof origin !== 'string' || origin.length > 4096)
  )) {
    throw new Error('Danh sách website loại trừ không hợp lệ.');
  }
  if (data.settings !== undefined && !isPlainObject(data.settings)) {
    throw new Error('Cài đặt vault không hợp lệ.');
  }
  if (requireOwner && (!isPlainObject(data.owner) || !data.owner.googleSub)) {
    throw new Error('Vault không có thông tin chủ sở hữu hợp lệ.');
  }
  if (data.owner !== undefined && !isPlainObject(data.owner)) {
    throw new Error('Thông tin chủ sở hữu vault không hợp lệ.');
  }
  if (
    data.owner?.googleSub !== undefined
    && (
      typeof data.owner.googleSub !== 'string'
      || !data.owner.googleSub
      || data.owner.googleSub.length > 256
    )
  ) {
    throw new Error('Thông tin chủ sở hữu vault không hợp lệ.');
  }
  if (
    data.owner?.email !== undefined
    && (typeof data.owner.email !== 'string' || data.owner.email.length > 320)
  ) {
    throw new Error('Email chủ sở hữu vault không hợp lệ.');
  }
  if (expectedGoogleSub && data.owner?.googleSub && data.owner.googleSub !== expectedGoogleSub) {
    throw new Error('Vault thuộc một tài khoản Google khác.');
  }
  if (data._meta !== undefined) {
    if (!isPlainObject(data._meta)) throw new Error('Metadata vault không hợp lệ.');
    if (
      data._meta.schemaVersion !== undefined
      && (!Number.isSafeInteger(data._meta.schemaVersion)
        || data._meta.schemaVersion < 1
        || data._meta.schemaVersion > 1000)
    ) {
      throw new Error('Schema version của vault không hợp lệ.');
    }
    if (!Number.isSafeInteger(data._meta.revision) || data._meta.revision < 0) {
      throw new Error('Revision vault không hợp lệ.');
    }
    if (typeof data._meta.vaultId !== 'string' || !data._meta.vaultId || data._meta.vaultId.length > 128) {
      throw new Error('Vault ID không hợp lệ.');
    }
    if (
      typeof data._meta.updatedAt !== 'string'
      || data._meta.updatedAt.length > 128
      || !Number.isFinite(Date.parse(data._meta.updatedAt))
    ) {
      throw new Error('Thời gian cập nhật vault không hợp lệ.');
    }
    if (data._meta.commitId !== undefined && !validCommitId(data._meta.commitId)) {
      throw new Error('Commit ID của vault không hợp lệ.');
    }
    if (data._meta.ancestors !== undefined) {
      if (!data._meta.commitId || !Array.isArray(data._meta.ancestors) || data._meta.ancestors.length > LINEAGE_LIMIT) {
        throw new Error('Lịch sử commit của vault không hợp lệ.');
      }
      const seen = new Set();
      for (const commitId of data._meta.ancestors) {
        if (!validCommitId(commitId) || commitId === data._meta.commitId || seen.has(commitId)) {
          throw new Error('Lịch sử commit của vault không hợp lệ.');
        }
        seen.add(commitId);
      }
    }
  }
  return data;
}

/**
 * Pure helper used by migration tests. Every chunk is bounded before joining,
 * and the parsed envelope is validated before it can be copied to local.
 */
export function parseLegacyEnvelopeChunks(chunks) {
  if (!Array.isArray(chunks) || !chunks.length || chunks.length > MAX_LEGACY_CHUNKS) {
    throw new Error('Dữ liệu vault cũ không hợp lệ.');
  }
  let serialized = '';
  for (const chunk of chunks) {
    if (typeof chunk !== 'string' || chunk.length > CHUNK_SIZE) {
      throw new Error('Dữ liệu vault cũ không hợp lệ.');
    }
    serialized += chunk;
    if (serialized.length > BACKUP_MAX_JSON_BYTES) throw new Error('Dữ liệu vault cũ quá lớn.');
  }
  let envelope;
  try {
    envelope = JSON.parse(serialized);
  } catch {
    throw new Error('Dữ liệu vault cũ bị hỏng.');
  }
  validateEnvelope(envelope);
  return envelope;
}

function vaultIsEmpty(data) {
  return (data.credentials?.length || 0) === 0 && (data.otpAccounts?.length || 0) === 0;
}

export function legacyCommitIdForMetadata(meta) {
  if (!meta || typeof meta.vaultId !== 'string' || !Number.isSafeInteger(meta.revision)) return null;
  const updatedAt = Number.isFinite(Date.parse(meta.updatedAt)) ? meta.updatedAt : 'unknown';
  const source = `${meta.vaultId}\u0000${meta.revision}\u0000${updatedAt}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `legacy:${meta.revision}:${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

function metadataCommitId(meta) {
  return validCommitId(meta?.commitId) ? meta.commitId : legacyCommitIdForMetadata(meta);
}

function snapshotDataEqual(left, right) {
  try {
    return JSON.stringify(left.data) === JSON.stringify(right.data);
  } catch {
    return false;
  }
}

/**
 * Compare two already authenticated snapshots.
 * Returns 1 when left is newer, -1 when right is newer, 0 when equivalent,
 * and null for divergent non-empty vault lineages that need user resolution.
 */
export function compareVaultSnapshots(left, right) {
  const leftEmpty = vaultIsEmpty(left.data);
  const rightEmpty = vaultIsEmpty(right.data);
  const leftMeta = left.data?._meta;
  const rightMeta = right.data?._meta;
  if (leftMeta && rightMeta) {
    if (leftMeta.vaultId !== rightMeta.vaultId) {
      if (leftEmpty !== rightEmpty) return leftEmpty ? -1 : 1;
      return null;
    }

    const leftCommit = metadataCommitId(leftMeta);
    const rightCommit = metadataCommitId(rightMeta);
    if (leftCommit && rightCommit) {
      if (leftCommit === rightCommit) return snapshotDataEqual(left, right) ? 0 : null;
      if (Array.isArray(leftMeta.ancestors) && leftMeta.ancestors.includes(rightCommit)) return 1;
      if (Array.isArray(rightMeta.ancestors) && rightMeta.ancestors.includes(leftCommit)) return -1;
      // Revision numbers are authenticated, but they cannot prove ancestry.
      // In particular, equal-revision siblings must never use timestamps as a
      // last-writer-wins tiebreaker.
      return null;
    }
  }

  if (snapshotDataEqual(left, right)) return 0;
  if (leftEmpty !== rightEmpty) return leftEmpty ? -1 : 1;
  return null;
}

export function mergeVaultData(localData, remoteData) {
  if (!localData) return remoteData ? cloneVaultData(remoteData) : null;
  if (!remoteData) return localData ? cloneVaultData(localData) : null;

  const merged = remoteData ? cloneVaultData(remoteData) : cloneVaultData(localData);

  // Merge credentials
  merged.credentials = Array.isArray(merged.credentials) ? merged.credentials : [];
  const remoteCreds = new Map(merged.credentials.map(c => [c.id, c]));

  const localCreds = Array.isArray(localData.credentials) ? localData.credentials : [];
  for (const localCred of localCreds) {
    if (!remoteCreds.has(localCred.id)) {
      merged.credentials.push(cloneVaultData(localCred));
    } else {
      const remoteCred = remoteCreds.get(localCred.id);
      const localTime = Date.parse(localCred.updatedAt || 0);
      const remoteTime = Date.parse(remoteCred.updatedAt || 0);
      if (localTime > remoteTime) {
        const idx = merged.credentials.findIndex(c => c.id === localCred.id);
        if (idx >= 0) merged.credentials[idx] = cloneVaultData(localCred);
      }
    }
  }

  // Merge OTP accounts
  merged.otpAccounts = Array.isArray(merged.otpAccounts) ? merged.otpAccounts : [];
  const remoteOtps = new Map(merged.otpAccounts.map(o => [o.id, o]));

  const localOtps = Array.isArray(localData.otpAccounts) ? localData.otpAccounts : [];
  for (const localOtp of localOtps) {
    if (!remoteOtps.has(localOtp.id)) {
      merged.otpAccounts.push(cloneVaultData(localOtp));
    } else {
      const remoteOtp = remoteOtps.get(localOtp.id);
      const localTime = Date.parse(localOtp.updatedAt || localOtp.createdAt || 0);
      const remoteTime = Date.parse(remoteOtp.updatedAt || remoteOtp.createdAt || 0);
      if (localTime > remoteTime) {
        const idx = merged.otpAccounts.findIndex(o => o.id === localOtp.id);
        if (idx >= 0) merged.otpAccounts[idx] = cloneVaultData(localOtp);
      }
    }
  }

  // Helper for generic items (notes, cards, identities)
  const mergeGenericArray = (propName) => {
    merged[propName] = Array.isArray(merged[propName]) ? merged[propName] : [];
    const remoteMap = new Map(merged[propName].map(item => [item.id, item]));
    const localItems = Array.isArray(localData[propName]) ? localData[propName] : [];
    for (const localItem of localItems) {
      if (!remoteMap.has(localItem.id)) {
        merged[propName].push(cloneVaultData(localItem));
      } else {
        const remoteItem = remoteMap.get(localItem.id);
        const localTime = Date.parse(localItem.updatedAt || localItem.createdAt || 0);
        const remoteTime = Date.parse(remoteItem.updatedAt || remoteItem.createdAt || 0);
        if (localTime > remoteTime) {
          const idx = merged[propName].findIndex(i => i.id === localItem.id);
          if (idx >= 0) merged[propName][idx] = cloneVaultData(localItem);
        }
      }
    }
  };

  mergeGenericArray('notes');
  mergeGenericArray('cards');
  mergeGenericArray('identities');

  // Merge Trash
  merged.trash = Array.isArray(merged.trash) ? merged.trash : [];
  const remoteTrashMap = new Map(merged.trash.map(t => [t.id, t]));
  const localTrash = Array.isArray(localData.trash) ? localData.trash : [];
  for (const localT of localTrash) {
    if (!remoteTrashMap.has(localT.id)) {
      merged.trash.push(cloneVaultData(localT));
    }
  }

  return merged;
}

async function readLegacySyncEnvelope(key) {
  await ensureTrustedStorageAccess();
  const direct = await chrome.storage.sync.get(key);
  if (own(direct, key) && direct[key] != null) {
    validateEnvelope(direct[key]);
    return direct[key];
  }

  const countKey = `${key}_chunk_count`;
  const info = await chrome.storage.sync.get(countKey);
  if (!own(info, countKey)) return null;
  const count = info[countKey];
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_LEGACY_CHUNKS) {
    throw new Error('Số lượng chunk của vault cũ không hợp lệ.');
  }
  const chunkKeys = Array.from({ length: count }, (_, index) => `${key}_chunk_${index}`);
  const stored = await chrome.storage.sync.get(chunkKeys);
  const chunks = chunkKeys.map(chunkKey => {
    if (!own(stored, chunkKey)) throw new Error('Vault cũ bị thiếu dữ liệu.');
    return stored[chunkKey];
  });
  return parseLegacyEnvelopeChunks(chunks);
}

async function readLegacyOwnerClaim() {
  const stored = await chrome.storage.local.get(LEGACY_OWNER_CLAIM_KEY);
  if (!own(stored, LEGACY_OWNER_CLAIM_KEY)) return null;
  const claim = stored[LEGACY_OWNER_CLAIM_KEY];
  if (!isPlainObject(claim) || typeof claim.googleSub !== 'string' || !claim.googleSub) {
    return { invalid: true };
  }
  return claim;
}

async function legacyCommonAllowedFor(googleSub) {
  const claim = await readLegacyOwnerClaim();
  return !claim || (!claim.invalid && claim.googleSub === googleSub);
}

async function persistLegacyOwnerClaim(googleSub) {
  const existing = await readLegacyOwnerClaim();
  if (existing?.invalid || (existing?.googleSub && existing.googleSub !== googleSub)) {
    throw makeError('Vault cũ đã được liên kết với một tài khoản Google khác.', 'LEGACY_OWNER_MISMATCH');
  }
  if (!existing) {
    await chrome.storage.local.set({
      [LEGACY_OWNER_CLAIM_KEY]: {
        version: 1,
        googleSub,
        claimedAt: new Date().toISOString()
      }
    });
  }
}

async function readEnvelopeRecord(key, { migrate = true } = {}) {
  await ensureTrustedStorageAccess();
  const local = await chrome.storage.local.get(key);
  if (own(local, key) && local[key] != null) {
    validateEnvelope(local[key]);
    return { envelope: local[key], source: 'local' };
  }
  const legacy = await readLegacySyncEnvelope(key);
  if (!legacy) return null;
  if (migrate) await chrome.storage.local.set({ [key]: legacy });
  return { envelope: legacy, source: 'legacy-sync' };
}

async function readLastGoodEnvelope(key) {
  const keyName = lastGoodKey(key);
  const stored = await chrome.storage.local.get(keyName);
  if (!own(stored, keyName) || stored[keyName] == null) return null;
  validateEnvelope(stored[keyName]);
  return stored[keyName];
}

async function replaceWithKnownGood(key, envelope) {
  validateEnvelope(envelope);
  if (unlockedVaultCache?.key === key) clearVaultMemoryCache();
  await chrome.storage.local.set({
    [key]: envelope,
    [lastGoodKey(key)]: envelope
  });
}

async function decryptStoredVault(key, password, expectedGoogleSub) {
  if (unlockedVaultCache && unlockedVaultCache.key !== key) clearVaultMemoryCache();
  let primaryRecord;
  let primaryError;
  try {
    primaryRecord = await readEnvelopeRecord(key);
  } catch (error) {
    primaryError = error;
  }
  if (!primaryRecord) {
    if (primaryError) {
      const recovery = await readLastGoodEnvelope(key).catch(() => null);
      if (!recovery) throw primaryError;
      const recoveredData = validateVaultData(await openEnvelope(recovery, password), { expectedGoogleSub });
      vaultCacheStats.decryptions += 1;
      await replaceWithKnownGood(key, recovery);
      setVaultMemoryCache(key, password, recoveredData, recovery);
      return { data: recoveredData, envelope: recovery, recovered: true };
    }
    throw makeError('Vault chưa được tạo.', 'VAULT_NOT_FOUND');
  }

  try {
    if (
      unlockedVaultCache?.key === key
      && unlockedVaultCache.password === password
      && unlockedVaultCache.envelopeFingerprint === envelopeCacheFingerprint(primaryRecord.envelope)
    ) {
      vaultCacheStats.hits += 1;
      return {
        data: cloneVaultData(unlockedVaultCache.data),
        envelope: primaryRecord.envelope,
        recovered: false,
        cached: true
      };
    }
    vaultCacheStats.decryptions += 1;
    const data = validateVaultData(await openEnvelope(primaryRecord.envelope, password), { expectedGoogleSub });
    await chrome.storage.local.set({ [lastGoodKey(key)]: primaryRecord.envelope });
    setVaultMemoryCache(key, password, data, primaryRecord.envelope);
    return { data, envelope: primaryRecord.envelope, recovered: false };
  } catch (primaryDecryptError) {
    const recovery = await readLastGoodEnvelope(key).catch(() => null);
    if (!recovery || recovery.payload === primaryRecord.envelope.payload) throw primaryDecryptError;
    const recoveredData = validateVaultData(await openEnvelope(recovery, password), { expectedGoogleSub });
    await replaceWithKnownGood(key, recovery);
    setVaultMemoryCache(key, password, recoveredData, recovery);
    return { data: recoveredData, envelope: recovery, recovered: true };
  }
}

export async function hasVault(googleSub) {
  if (!googleSub) return false;
  await ensureTrustedStorageAccess();
  const accountKey = vaultStorageKey(googleSub);
  const stageKey = remoteStageKey(googleSub);
  const local = await chrome.storage.local.get([accountKey, stageKey]);
  if ((own(local, accountKey) && local[accountKey] != null) ||
      (own(local, stageKey) && local[stageKey] != null)) return true;

  const syncKeys = [
    accountKey,
    `${accountKey}_chunk_count`
  ];
  const legacy = await chrome.storage.sync.get(syncKeys);
  if (syncKeys.some(key => own(legacy, key) && legacy[key] != null)) return true;

  if (!await legacyCommonAllowedFor(googleSub)) return false;
  const commonLocal = await chrome.storage.local.get(VAULT_KEY);
  if (own(commonLocal, VAULT_KEY) && commonLocal[VAULT_KEY] != null) return true;
  const commonSyncKeys = [VAULT_KEY, `${VAULT_KEY}_chunk_count`];
  const commonLegacy = await chrome.storage.sync.get(commonSyncKeys);
  return commonSyncKeys.some(key => own(commonLegacy, key) && commonLegacy[key] != null);
}

function nextVaultMetadata(data, previousData) {
  const now = new Date().toISOString();
  const previousRevision = Number.isSafeInteger(previousData?._meta?.revision)
    ? previousData._meta.revision
    : 0;
  const suppliedRevision = Number.isSafeInteger(data?._meta?.revision) ? data._meta.revision : 0;
  const previousCommit = metadataCommitId(previousData?._meta);
  const ancestors = [];
  for (const commitId of [previousCommit, ...(previousData?._meta?.ancestors || [])]) {
    if (validCommitId(commitId) && !ancestors.includes(commitId)) ancestors.push(commitId);
    if (ancestors.length >= LINEAGE_LIMIT) break;
  }
  data._meta = {
    schemaVersion: 3,
    vaultId: previousData?._meta?.vaultId || data?._meta?.vaultId || crypto.randomUUID(),
    revision: Math.max(previousRevision, suppliedRevision) + 1,
    commitId: crypto.randomUUID(),
    ancestors,
    updatedAt: now
  };
  return data;
}

async function updateSyncStatus(googleSub, patch) {
  const key = syncStatusKey(googleSub);
  const previous = (await chrome.storage.local.get(key))[key] || {};
  const status = { ...previous, ...patch, googleSub };
  if (patch.state === 'syncing') status.lastAttemptAt = new Date().toISOString();
  if (patch.state === 'synced') {
    status.lastSuccessAt = new Date().toISOString();
    status.error = null;
    if (!own(patch, 'reason')) status.reason = null;
    if (!own(patch, 'retryable')) status.retryable = false;
  }
  await chrome.storage.local.set({ [key]: status });
  return status;
}

export async function getSyncStatus(googleSub) {
  requireGoogleSub(googleSub);
  await ensureTrustedStorageAccess();
  const status = (await chrome.storage.local.get(syncStatusKey(googleSub)))[syncStatusKey(googleSub)];
  return status || { state: 'idle', googleSub, error: null };
}

function serializeDriveUpload(operation) {
  const run = driveUploadTail.then(operation, operation);
  driveUploadTail = run.catch(() => undefined);
  return run;
}

function driveFilename(googleSub) {
  return `aegis_vault_${googleSub}.json`;
}

async function downloadRemoteEnvelope(googleSub) {
  return withGoogleAccessToken(async token => {
    const files = await findVaultFiles(token, driveFilename(googleSub));
    if (files.length > 1) {
      const error = makeError(
        'Phát hiện nhiều tệp vault cùng tên trên Google Drive; đã dừng để bảo toàn tất cả bản.',
        'DRIVE_DUPLICATE_VAULT_FILES'
      );
      error.files = files.map(file => ({
        id: file.id,
        modifiedTime: file.modifiedTime || null,
        size: file.size || null
      }));
      throw error;
    }
    const file = files[0] || null;
    if (!file) return { file: null, envelope: null };
    const snapshot = await readVaultFileSnapshot(token, file.id);
    validateEnvelope(snapshot.envelope);
    return {
      file: { ...file, etag: snapshot.etag },
      envelope: snapshot.envelope
    };
  });
}

async function uploadRemoteEnvelope(googleSub, envelope, remote) {
  return withGoogleAccessToken(token => writeVaultFile(
    token,
    driveFilename(googleSub),
    envelope,
    remote?.file
      ? {
          file: remote.file,
          expectedEtag: remote.file.etag
        }
      : {
          file: null,
          expectedAbsent: true
        }
  ));
}

function normalizeStagedRemote(value) {
  if (!value) return null;
  if (value.version === STAGE_VERSION && value.envelope) {
    validateEnvelope(value.envelope);
    return value;
  }
  // Backward compatibility with the previous staging format, which stored
  // only the encrypted envelope.
  validateEnvelope(value);
  return {
    version: STAGE_VERSION,
    envelope: value,
    file: null,
    reason: 'legacy-stage',
    stagedAt: null
  };
}

async function getStagedRemote(googleSub) {
  const key = remoteStageKey(googleSub);
  return normalizeStagedRemote((await chrome.storage.local.get(key))[key]);
}

async function stageRemoteSnapshot(googleSub, remote, reason) {
  if (!remote?.envelope) return null;
  const staged = {
    version: STAGE_VERSION,
    envelope: remote.envelope,
    file: remote.file
      ? {
          id: remote.file.id,
          etag: remote.file.etag || null,
          modifiedTime: remote.file.modifiedTime || null
        }
      : null,
    reason,
    stagedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [remoteStageKey(googleSub)]: staged });
  return staged;
}

function commitIsSameOrDescendant(meta, ancestorCommitId) {
  const commitId = metadataCommitId(meta);
  return Boolean(
    ancestorCommitId
    && (commitId === ancestorCommitId || meta?.ancestors?.includes(ancestorCommitId))
  );
}

async function getPendingUpload(googleSub) {
  const key = pendingUploadKey(googleSub);
  const pending = (await chrome.storage.local.get(key))[key];
  if (!isPlainObject(pending) || pending.version !== PENDING_UPLOAD_VERSION) return null;
  return pending;
}

async function persistPendingUpload(googleSub, localData, remote) {
  const commitId = metadataCommitId(localData?._meta);
  if (!commitId) return null;
  const pending = {
    version: PENDING_UPLOAD_VERSION,
    localCommitId: commitId,
    baseRemoteCommitId: remote?.data ? metadataCommitId(remote.data._meta) : null,
    remoteFileId: remote?.file?.id || null,
    remoteEtag: remote?.file?.etag || null,
    expectedAbsent: !remote?.file,
    preparedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [pendingUploadKey(googleSub)]: pending });
  return pending;
}

async function clearSyncWork(googleSub) {
  await chrome.storage.local.remove([remoteStageKey(googleSub), pendingUploadKey(googleSub)]);
}

async function conflictResult(googleSub, remote, reason, message, direction = 'upload') {
  if (remote?.envelope) await stageRemoteSnapshot(googleSub, remote, reason);
  if (reason !== 'duplicate-remote-files') {
    await chrome.storage.local.remove(pendingUploadKey(googleSub));
  }
  const state = reason === 'local-password-mismatch'
    ? 'staged'
    : reason === 'duplicate-remote-files'
      ? 'error'
      : 'conflict';
  const status = await updateSyncStatus(googleSub, {
    state,
    direction,
    reason,
    remoteFileId: remote?.file?.id || null,
    retryable: false,
    error: message
  });
  return {
    ok: false,
    remoteFound: Boolean(remote?.envelope),
    action: reason,
    reason,
    status
  };
}

async function etagRefreshFailure(googleSub, error, direction = 'upload') {
  await chrome.storage.local.remove(pendingUploadKey(googleSub));
  const status = await updateSyncStatus(googleSub, {
    state: 'error',
    direction,
    reason: 'etag-refresh-failed',
    retryable: true,
    error: error?.message || 'Không thể đọc lại Drive sau khi ETag thay đổi.'
  });
  return {
    ok: false,
    action: 'etag-refresh-failed',
    reason: 'etag-refresh-failed',
    status,
    error: status.error
  };
}

function canUsePendingProof(pending, localData, remote) {
  if (!pending || !remote?.file?.etag || !pending.remoteEtag) return false;
  return pending.remoteFileId === remote.file.id
    && pending.remoteEtag === remote.file.etag
    && commitIsSameOrDescendant(localData?._meta, pending.localCommitId)
    && (
      !pending.baseRemoteCommitId
      || commitIsSameOrDescendant(localData?._meta, pending.baseRemoteCommitId)
    );
}

async function decryptRemoteForSync(remote, passwords, googleSub) {
  let lastError;
  for (const password of [...new Set(passwords.filter(value => typeof value === 'string' && value))]) {
    try {
      const data = validateVaultData(await openEnvelope(remote.envelope, password), {
        expectedGoogleSub: googleSub,
        requireOwner: true
      });
      return { data, password };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || makeError('Cần mật khẩu chính để xác thực vault trên Drive.', 'SYNC_PASSWORD_REQUIRED');
}

async function uploadWithPrecondition(googleSub, envelope, localData, remote) {
  if (remote?.file && !remote.file.etag) {
    throw makeError('Google Drive không trả về ETag; đã dừng để tránh ghi đè mù.', 'DRIVE_ETAG_MISSING');
  }
  await persistPendingUpload(googleSub, localData, remote);
  return serializeDriveUpload(() => uploadRemoteEnvelope(googleSub, envelope, remote));
}

export async function syncToGDrive(
  googleSub,
  envelope,
  {
    throwOnError = false,
    password = null,
    remotePassword = password,
    allowStaged = false,
    preflight = null
  } = {}
) {
  requireGoogleSub(googleSub);
  validateEnvelope(envelope);
  await updateSyncStatus(googleSub, { state: 'syncing', direction: 'upload', error: null });
  let localData;
  try {
    if (!password) throw makeError('Cần mật khẩu chính để đồng bộ vault.', 'SYNC_PASSWORD_REQUIRED');
    localData = validateVaultData(await openEnvelope(envelope, password), {
      expectedGoogleSub: googleSub,
      requireOwner: true
    });

    const staged = await getStagedRemote(googleSub);
    if (staged && !allowStaged) {
      return conflictResult(
        googleSub,
        { envelope: staged.envelope, file: staged.file },
        staged.reason || 'conflict-pending',
        'Cần xử lý bản Drive đang chờ trước khi tải lên.'
      );
    }

    // Persist the first authenticated base before re-reading Drive. This is
    // essential during password rotation: a crash/network failure after the
    // local re-encryption remains retryable without persisting the old password.
    if (preflight) await persistPendingUpload(googleSub, localData, preflight);

    const remote = await downloadRemoteEnvelope(googleSub);
    let remoteData = null;
    let pending = await getPendingUpload(googleSub);
    if (remote.envelope) {
      try {
        remoteData = (await decryptRemoteForSync(
          remote,
          [remotePassword, password],
          googleSub
        )).data;
      } catch (passwordError) {
        if (!canUsePendingProof(pending, localData, remote)) {
          return conflictResult(
            googleSub,
            remote,
            'remote-password-mismatch',
            'Bản Drive không mở được bằng mật khẩu hiện tại; đã giữ nguyên cả hai bản.'
          );
        }
      }
    }

    if (remoteData) {
      const comparison = compareVaultSnapshots(
        { data: localData, envelope },
        { data: remoteData, envelope: remote.envelope }
      );
      if (comparison === 0) {
        await clearSyncWork(googleSub);
        const status = await updateSyncStatus(googleSub, {
          state: 'synced',
          direction: 'none',
          reason: null,
          retryable: false,
          remoteFileId: remote.file.id
        });
        return { ok: true, action: 'unchanged', status, file: remote.file };
      }
      if (comparison !== 1) {
        // Auto-merge: local and remote have diverged or remote is newer.
        // Merge both sides and upload the union.
        const mergedData = mergeVaultData(localData, remoteData);
        let mergedEnvelope = envelope;
        let mergedFinal = localData;
        if (!snapshotDataEqual({ data: mergedData }, { data: localData })) {
          mergedFinal = mergedData;
          mergedEnvelope = await createEnvelope(mergedData, password);
        }
        const file = await uploadWithPrecondition(
          googleSub, mergedEnvelope, mergedFinal,
          remote.envelope ? { ...remote, data: remoteData } : remote
        );

        // Update local vault to the merged version
        const key = vaultStorageKey(googleSub);
        await replaceWithKnownGood(key, mergedEnvelope);
        setVaultMemoryCache(key, password, mergedFinal, mergedEnvelope);
        await clearSyncWork(googleSub);

        const status = await updateSyncStatus(googleSub, {
          state: 'synced',
          direction: 'upload',
          reason: null,
          retryable: false,
          remoteFileId: file.id
        });
        return { ok: true, action: 'merged', status, file };
      }
    }

    const file = await uploadWithPrecondition(
      googleSub,
      envelope,
      localData,
      remote.envelope ? { ...remote, data: remoteData } : remote
    );
    await clearSyncWork(googleSub);
    const status = await updateSyncStatus(googleSub, {
      state: 'synced',
      direction: 'upload',
      reason: null,
      retryable: false,
      remoteFileId: file?.id || null
    });
    return { ok: true, action: 'uploaded', status, file };
  } catch (error) {
    if (
      error?.code === 'DRIVE_DUPLICATE_VAULT_FILES'
      || error?.details?.reason === 'duplicate-vault-files'
    ) {
      return conflictResult(
        googleSub,
        null,
        'duplicate-remote-files',
        'Có nhiều tệp vault cùng tên trên Drive; đã dừng và không thay đổi tệp nào.'
      );
    }
    if (error?.status === 412 || error?.code === 412) {
      let latest = null;
      try {
        latest = await downloadRemoteEnvelope(googleSub);
      } catch (refreshError) {
        if (refreshError?.code === 'DRIVE_DUPLICATE_VAULT_FILES') {
          return conflictResult(
            googleSub,
            null,
            'duplicate-remote-files',
            'Có nhiều tệp vault cùng tên trên Drive; đã dừng và không thay đổi tệp nào.'
          );
        }
        return etagRefreshFailure(googleSub, refreshError, 'upload');
      }
      return conflictResult(
        googleSub,
        latest,
        'etag-mismatch',
        'Bản Drive đã thay đổi trong lúc tải lên; đã dừng và giữ nguyên cả hai bản.'
      );
    }
    const status = await updateSyncStatus(googleSub, {
      state: 'error',
      direction: 'upload',
      reason: 'upload-pending',
      retryable: Boolean(await getPendingUpload(googleSub)),
      error: error?.message || 'Đồng bộ Google Drive thất bại.'
    });
    if (throwOnError) throw error;
    return { ok: false, status, error: status.error };
  }
}

export async function syncFromGDrive(googleSub, password, { preferDrive = false } = {}) {
  requireGoogleSub(googleSub);
  await ensureTrustedStorageAccess();
  await updateSyncStatus(googleSub, { state: 'syncing', direction: 'download', error: null });
  let remote;
  try {
    remote = await downloadRemoteEnvelope(googleSub);
  } catch (error) {
    const duplicate = error?.code === 'DRIVE_DUPLICATE_VAULT_FILES';
    const status = await updateSyncStatus(googleSub, {
      state: 'error',
      direction: 'download',
      reason: duplicate ? 'duplicate-remote-files' : 'download-error',
      error: error?.message || 'Không thể kiểm tra Google Drive.'
    });
    error.syncStatus = status;
    throw error;
  }

  if (!remote.envelope) {
    if (password) {
      try {
        const local = await decryptStoredVault(
          vaultStorageKey(googleSub),
          password,
          googleSub
        );
        const pending = await getPendingUpload(googleSub);
        const upload = await syncToGDrive(googleSub, local.envelope, {
          password,
          allowStaged: Boolean(pending)
        });
        return {
          ...upload,
          remoteFound: upload.remoteFound ?? false,
          action: upload.action || (upload.ok ? 'uploaded' : 'upload-error')
        };
      } catch (error) {
        if (error.code !== 'VAULT_NOT_FOUND') throw error;
      }
    }
    await clearSyncWork(googleSub);
    const status = await updateSyncStatus(googleSub, {
      state: 'synced',
      direction: 'download',
      remoteFileId: null
    });
    return { ok: true, remoteFound: false, action: 'none', status };
  }

  // A downloaded envelope is staged first and never replaces the local copy
  // until its AEAD tag, schema, password and owner have all been verified.
  await stageRemoteSnapshot(googleSub, remote, 'download-pending');
  if (!password) {
    const status = await updateSyncStatus(googleSub, {
      state: 'staged',
      direction: 'download',
      remoteFileId: remote.file.id,
      reason: 'download-pending',
      error: null
    });
    return { ok: true, remoteFound: true, action: 'staged', status };
  }

  let remoteData = null;
  let remotePasswordError = null;
  try {
    remoteData = validateVaultData(await openEnvelope(remote.envelope, password), {
      expectedGoogleSub: googleSub,
      requireOwner: true
    });
  } catch (error) {
    remotePasswordError = error;
  }

  const key = vaultStorageKey(googleSub);
  let localSnapshot = null;
  let localError = null;
  try {
    const local = await decryptStoredVault(key, password, googleSub);
    localSnapshot = { data: local.data, envelope: local.envelope };
  } catch (error) {
    if (error.code !== 'VAULT_NOT_FOUND') localError = error;
  }

  if (!localSnapshot && await legacyCommonAllowedFor(googleSub)) {
    try {
      const local = await decryptStoredVault(vaultStorageKey(null), password, null);
      localSnapshot = { data: local.data, envelope: local.envelope };
    } catch (error) {
      if (error.code !== 'VAULT_NOT_FOUND') localError = localError || error;
    }
  }

  if (!remoteData) {
    if (localSnapshot) {
      const pending = await getPendingUpload(googleSub);
      if (canUsePendingProof(pending, localSnapshot.data, remote)) {
        const retry = await syncToGDrive(googleSub, localSnapshot.envelope, {
          password,
          allowStaged: true
        });
        return {
          ...retry,
          remoteFound: true,
          action: retry.action || (retry.ok ? 'uploaded' : 'upload-error')
        };
      }
      return conflictResult(
        googleSub,
        remote,
        'remote-password-mismatch',
        'Bản local mở được nhưng bản Drive không mở được bằng mật khẩu này; đã chặn tải lên.',
        'download'
      );
    }
    const status = await updateSyncStatus(googleSub, {
      state: 'error',
      direction: 'download',
      reason: 'password-mismatch',
      remoteFileId: remote.file.id,
      error: remotePasswordError?.message || 'Không thể mở vault trên Drive.'
    });
    const error = remotePasswordError || localError || makeError(status.error, 'VAULT_PASSWORD_MISMATCH');
    error.syncStatus = status;
    throw error;
  }

  if (localError) {
    if (preferDrive) return adoptStagedRemote(googleSub, password);
    return conflictResult(
      googleSub,
      remote,
      'local-password-mismatch',
      'Bản Drive mở được nhưng bản local không mở được bằng mật khẩu này; cần chọn bản muốn giữ.',
      'download'
    );
  }

  if (!localSnapshot) {
    await replaceWithKnownGood(key, remote.envelope);
    setVaultMemoryCache(key, password, remoteData, remote.envelope);
    await clearSyncWork(googleSub);
    const status = await updateSyncStatus(googleSub, {
      state: 'synced',
      direction: 'download',
      reason: null,
      remoteFileId: remote.file.id
    });
    return { ok: true, remoteFound: true, action: 'downloaded', status };
  }

  const comparison = compareVaultSnapshots(
    { data: remoteData, envelope: remote.envelope },
    localSnapshot
  );
  if (preferDrive && comparison !== 0) {
    return adoptStagedRemote(googleSub, password);
  }
  if (comparison === null) {
    // Automatic merge for background download conflicts
    const mergedData = mergeVaultData(localSnapshot.data, remoteData);
    let finalEnvelope = remote.envelope;
    let finalData = remoteData;
    if (!snapshotDataEqual({ data: mergedData }, { data: remoteData })) {
      finalData = mergedData;
      finalEnvelope = await createEnvelope(mergedData, password);
    }

    // Update local vault to the merged version
    await replaceWithKnownGood(key, finalEnvelope);
    setVaultMemoryCache(key, password, finalData, finalEnvelope);
    await clearSyncWork(googleSub);

    // Upload the merged version back to Drive so both are in sync
    if (finalEnvelope !== remote.envelope) {
      await uploadWithPrecondition(googleSub, finalEnvelope, finalData, remote).catch(() => null);
    }

    const status = await updateSyncStatus(googleSub, {
      state: 'synced',
      direction: 'none',
      reason: null,
      remoteFileId: remote.file.id
    });
    return { ok: true, remoteFound: true, action: 'merged', status };
  }
  if (comparison > 0) {
    await replaceWithKnownGood(key, remote.envelope);
    setVaultMemoryCache(key, password, remoteData, remote.envelope);
    await clearSyncWork(googleSub);
    const status = await updateSyncStatus(googleSub, {
      state: 'synced',
      direction: 'download',
      reason: null,
      remoteFileId: remote.file.id
    });
    return { ok: true, remoteFound: true, action: 'downloaded', status };
  }
  if (comparison < 0) {
    const upload = await syncToGDrive(googleSub, localSnapshot.envelope, {
      password,
      allowStaged: true
    });
    return {
      ok: upload.ok,
      remoteFound: true,
      action: upload.action || (upload.ok ? 'uploaded' : 'upload-error'),
      ...(upload.reason ? { reason: upload.reason } : {}),
      status: upload.status
    };
  }

  await clearSyncWork(googleSub);
  const status = await updateSyncStatus(googleSub, {
    state: 'synced',
    direction: 'none',
    reason: null,
    remoteFileId: remote.file.id
  });
  return { ok: true, remoteFound: true, action: 'unchanged', status };
}

async function preflightPasswordRotation(googleSub, localSnapshot, currentPassword) {
  const staged = await getStagedRemote(googleSub);
  if (staged) {
    const result = await conflictResult(
      googleSub,
      { envelope: staged.envelope, file: staged.file },
      staged.reason || 'conflict-pending',
      'Cần xử lý bản Drive đang chờ trước khi đổi mật khẩu.'
    );
    const error = makeError(result.status.error, 'SYNC_CONFLICT_PENDING');
    error.syncResult = result;
    throw error;
  }

  let remote;
  try {
    remote = await downloadRemoteEnvelope(googleSub);
  } catch (error) {
    if (error?.code === 'DRIVE_DUPLICATE_VAULT_FILES') {
      error.syncStatus = await updateSyncStatus(googleSub, {
        state: 'error',
        direction: 'upload',
        reason: 'duplicate-remote-files',
        retryable: false,
        error: error.message
      });
    }
    throw error;
  }
  if (!remote.envelope) return { ...remote, data: null };
  if (!remote.file?.etag) {
    const error = makeError(
      'Google Drive không trả về ETag; đã dừng đổi mật khẩu để tránh mất đường retry an toàn.',
      'DRIVE_ETAG_MISSING'
    );
    error.syncStatus = await updateSyncStatus(googleSub, {
      state: 'error',
      direction: 'upload',
      reason: 'rotation-preflight-failed',
      retryable: true,
      error: error.message
    });
    throw error;
  }

  let remoteData;
  try {
    remoteData = (await decryptRemoteForSync(remote, [currentPassword], googleSub)).data;
  } catch {
    const result = await conflictResult(
      googleSub,
      remote,
      'remote-password-mismatch',
      'Bản Drive không mở được bằng mật khẩu hiện tại; đã dừng đổi mật khẩu.'
    );
    const error = makeError(result.status.error, 'REMOTE_PASSWORD_MISMATCH');
    error.syncResult = result;
    throw error;
  }

  const comparison = compareVaultSnapshots(
    localSnapshot,
    { data: remoteData, envelope: remote.envelope }
  );
  if (comparison !== 0 && comparison !== 1) {
    const result = await conflictResult(
      googleSub,
      remote,
      comparison === -1 ? 'remote-newer' : 'divergent-lineage',
      'Bản Drive không còn là tổ tiên của bản local; đã dừng đổi mật khẩu.'
    );
    const error = makeError(result.status.error, 'SYNC_CONFLICT_PENDING');
    error.syncResult = result;
    throw error;
  }
  return { ...remote, data: remoteData };
}

async function writeVaultInternal(data, password, googleSub, { previousPassword = password, upload = true } = {}) {
  await ensureTrustedStorageAccess();
  const key = vaultStorageKey(googleSub);
  let previousData = null;
  let existingSalt;
  let existingSnapshot = null;
  const existing = await readEnvelopeRecord(key);
  if (existing) {
    existingSnapshot = await decryptStoredVault(key, previousPassword, googleSub);
    previousData = existingSnapshot.data;
    existingSalt = base64ToBytes(existingSnapshot.envelope.kdf.salt, 64);
  }

  if (googleSub && upload && await getStagedRemote(googleSub)) {
    throw makeError(
      'Cần xử lý bản Drive đang chờ trước khi thay đổi vault.',
      'SYNC_CONFLICT_PENDING'
    );
  }

  validateVaultData(data, { expectedGoogleSub: googleSub });
  const lineageBase = previousData || (data?._meta ? cloneVaultData(data) : null);
  let preflight = null;
  const rotatingPassword = Boolean(existingSnapshot && password !== previousPassword);
  if (googleSub && upload && rotatingPassword) {
    try {
      preflight = await preflightPasswordRotation(
        googleSub,
        { data: previousData, envelope: existingSnapshot.envelope },
        previousPassword
      );
    } catch (error) {
      if (!error.syncResult && !error.syncStatus) {
        await updateSyncStatus(googleSub, {
          state: 'error',
          direction: 'upload',
          reason: 'rotation-preflight-failed',
          retryable: true,
          error: error?.message || 'Không thể kiểm tra Drive trước khi đổi mật khẩu.'
        });
      }
      throw error;
    }
  }

  nextVaultMetadata(data, lineageBase);
  const envelope = await createEnvelope(data, password, existingSalt);
  if (preflight) await persistPendingUpload(googleSub, data, preflight);
  await replaceWithKnownGood(key, envelope);
  setVaultMemoryCache(key, password, data, envelope);

  const sync = googleSub && upload
    ? await syncToGDrive(googleSub, envelope, {
        password,
        remotePassword: previousPassword,
        preflight
      })
    : { ok: true, status: googleSub ? await getSyncStatus(googleSub) : null };
  return { data, envelope, sync };
}

export async function writeVault(data, password, googleSub) {
  return writeVaultInternal(data, password, googleSub);
}

export async function writeVaultLocal(data, password, googleSub) {
  return writeVaultInternal(data, password, googleSub, { upload: false });
}

export async function createVault(password, user) {
  validateNewMasterPassword(password);
  if (!user?.sub || !user?.email) throw new Error('Tài khoản Google không hợp lệ.');

  // Never create an empty vault until Drive has been checked successfully.
  // This closes the old "download failed -> empty vault -> overwrite backup"
  // failure mode.
  if (await hasVault(user.sub)) throw new Error('Vault đã tồn tại. Hãy mở khóa thay vì tạo mới.');
  const remoteCheck = await syncFromGDrive(user.sub);
  if (remoteCheck.remoteFound || await hasVault(user.sub)) {
    throw new Error('Đã tìm thấy vault trên Google Drive. Hãy mở khóa vault hiện có.');
  }

  const data = {
    owner: { googleSub: user.sub, email: user.email },
    credentials: [],
    otpAccounts: [],
    notes: [],
    cards: [],
    identities: [],
    trash: [],
    excludedOrigins: [],
    settings: {}
  };
  await writeVaultInternal(data, password, user.sub);
  await setSessionPassword(password);
  return data;
}

export async function unlockVault(password, user) {
  if (!user?.sub) throw new Error('Tài khoản Google không hợp lệ.');
  let syncError = null;
  let syncResult = null;
  try {
    syncResult = await syncFromGDrive(user.sub, password, { preferDrive: true });
  } catch (error) {
    // Offline/Drive failures must not make a valid local vault unavailable.
    syncError = error;
  }
  if (syncResult?.status?.state === 'conflict') {
    const error = makeError(
      syncResult.reason === 'remote-password-mismatch'
        ? 'Mật khẩu này chỉ mở được bản trên máy. Hãy nhập mật khẩu của Vault trên Drive.'
        : 'Chưa thể tự lấy Vault từ Drive. Hãy thử mở khóa lại.',
      syncResult.reason === 'remote-password-mismatch'
        ? 'DRIVE_PASSWORD_MISMATCH'
        : 'DRIVE_AUTO_RESTORE_PENDING'
    );
    error.syncStatus = syncResult.status;
    throw error;
  }
  if (syncError?.syncStatus?.state === 'conflict') throw syncError;

  let data;
  let sourceWasLegacyCommon = false;
  try {
    data = await readVault(password, user.sub);
  } catch (error) {
    if (error.code !== 'VAULT_NOT_FOUND') throw error;
    if (!await legacyCommonAllowedFor(user.sub)) {
      throw makeError(
        'Vault cũ đã được liên kết với một tài khoản Google khác.',
        'LEGACY_OWNER_MISMATCH'
      );
    }
    try {
      data = await readVault(password, null);
      sourceWasLegacyCommon = true;
    } catch (legacyError) {
      if (legacyError.code === 'VAULT_NOT_FOUND' && syncError) throw syncError;
      throw legacyError;
    }
  }

  if (data.owner?.googleSub && data.owner.googleSub !== user.sub) {
    throw new Error('Vault thuộc một tài khoản Google khác.');
  }
  let needsWrite = sourceWasLegacyCommon || !data.owner || !Array.isArray(data.otpAccounts) || !data._meta;
  if (!data.owner) data.owner = { googleSub: user.sub, email: user.email };
  if (!Array.isArray(data.otpAccounts)) data.otpAccounts = [];
  if (!Array.isArray(data.notes)) data.notes = [];
  if (!Array.isArray(data.cards)) data.cards = [];
  if (!Array.isArray(data.identities)) data.identities = [];
  if (!Array.isArray(data.trash)) data.trash = [];
  if (!Array.isArray(data.excludedOrigins)) {
    data.excludedOrigins = [];
    needsWrite = true;
  }
  if (!isPlainObject(data.settings)) {
    data.settings = {};
    needsWrite = true;
  }

  // Clean up trash entries older than 30 days
  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const initialTrashLength = data.trash.length;
  data.trash = data.trash.filter(item => {
    const deletedMs = Date.parse(item.deletedAt || 0);
    return Number.isFinite(deletedMs) && (nowMs - deletedMs) <= thirtyDaysMs;
  });
  if (data.trash.length !== initialTrashLength) {
    needsWrite = true;
  }

  if (needsWrite) {
    await writeVaultInternal(data, password, user.sub);
    if (sourceWasLegacyCommon) await persistLegacyOwnerClaim(user.sub);
  }
  await setSessionPassword(password);
  return data;
}

export async function readVault(password, googleSub) {
  await ensureTrustedStorageAccess();
  const key = vaultStorageKey(googleSub);
  if (
    !vaultReadInFlight
    || vaultReadInFlight.key !== key
    || vaultReadInFlight.password !== password
  ) {
    const promise = decryptStoredVault(key, password, googleSub || undefined);
    vaultReadInFlight = { key, password, promise };
  }
  const activeRead = vaultReadInFlight;
  try {
    const snapshot = await activeRead.promise;
    return cloneVaultData(snapshot.data);
  } finally {
    if (vaultReadInFlight === activeRead) vaultReadInFlight = null;
  }
}

let sessionFallback = {};

export async function setSessionPassword(password) {
  if (typeof chrome?.storage?.session?.set === 'function') {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => null);
    await chrome.storage.session.set({ [SESSION_KEY]: password }).catch(() => null);
  } else {
    sessionFallback[SESSION_KEY] = password;
  }
}

export async function getSessionPassword() {
  if (typeof chrome?.storage?.session?.get === 'function') {
    try {
      const stored = await chrome.storage.session.get(SESSION_KEY);
      return stored?.[SESSION_KEY] ?? sessionFallback[SESSION_KEY];
    } catch {
      return sessionFallback[SESSION_KEY];
    }
  }
  return sessionFallback[SESSION_KEY];
}

export async function lockVault() {
  clearVaultMemoryCache();
  if (typeof chrome?.storage?.session?.remove === 'function') {
    await chrome.storage.session.remove(SESSION_KEY).catch(() => null);
  }
  delete sessionFallback[SESSION_KEY];
  try {
    if (typeof chrome?.runtime?.sendMessage === 'function') {
      chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => null);
    }
  } catch {}
}

export async function changeMasterPassword(currentPassword, newPassword, user) {
  validateNewMasterPassword(newPassword);
  let data;
  try {
    data = await readVault(currentPassword, user.sub);
  } catch {
    throw new Error('Mật khẩu chính hiện tại không chính xác.');
  }
  const result = await writeVaultInternal(data, newPassword, user.sub, {
    previousPassword: currentPassword
  });
  await setSessionPassword(newPassword);
  return { data, sync: result.sync };
}

function parseBackupDocument(input) {
  let serialized;
  try {
    serialized = typeof input === 'string' ? input : JSON.stringify(input);
  } catch {
    throw new Error('Tệp backup không phải JSON hợp lệ.');
  }
  if (!serialized || serialized.length > BACKUP_MAX_JSON_BYTES) {
    throw new Error('Tệp backup vượt quá dung lượng cho phép.');
  }
  let document;
  try {
    document = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new Error('Tệp backup không phải JSON hợp lệ.');
  }
  if (!isPlainObject(document) || document.format !== BACKUP_FORMAT || document.version !== BACKUP_VERSION) {
    throw new Error('Định dạng backup mã hóa không được hỗ trợ.');
  }
  if (!Number.isFinite(Date.parse(document.exportedAt))) {
    throw new Error('Thời gian tạo backup không hợp lệ.');
  }
  validateEnvelope(document.envelope, { maxPayloadBytes: MAX_ENVELOPE_PAYLOAD_BYTES });
  return document;
}

export async function inspectEncryptedBackup(backup, password, user) {
  const document = parseBackupDocument(backup);
  const data = validateVaultData(await openEnvelope(document.envelope, password), {
    expectedGoogleSub: user?.sub,
    requireOwner: true,
    strictOtp: true
  });
  return {
    document,
    data,
    counts: {
      credentials: data.credentials.length,
      otp: data.otpAccounts?.length || 0
    }
  };
}

export async function exportEncryptedBackup(password, user) {
  const data = await readVault(password, user.sub);
  validateVaultData(data, { expectedGoogleSub: user.sub, requireOwner: true });
  const record = await readEnvelopeRecord(vaultStorageKey(user.sub));
  const document = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    envelope: record.envelope
  };
  return {
    backup: JSON.stringify(document, null, 2),
    counts: {
      credentials: data.credentials.length,
      otp: data.otpAccounts?.length || 0
    }
  };
}

export async function exportPreCloudRecovery(googleSub) {
  requireGoogleSub(googleSub);
  await ensureTrustedStorageAccess();
  const key = preCloudRecoveryKey(googleSub);
  const recovery = (await chrome.storage.local.get(key))[key];
  if (!isPlainObject(recovery) || recovery.version !== 1 || !recovery.envelope) {
    throw makeError('Không có bản local cũ để xuất phục hồi.', 'RECOVERY_NOT_FOUND');
  }
  validateEnvelope(recovery.envelope);
  const exportedAt = Number.isFinite(Date.parse(recovery.savedAt))
    ? recovery.savedAt
    : new Date().toISOString();
  return {
    backup: JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      envelope: recovery.envelope
    }, null, 2),
    savedAt: recovery.savedAt || null,
    reason: recovery.reason || null
  };
}

export async function importEncryptedBackup(
  backup,
  backupPassword,
  user,
  { currentPassword = backupPassword, upload = true } = {}
) {
  const inspected = await inspectEncryptedBackup(backup, backupPassword, user);
  const result = await writeVaultInternal(inspected.data, backupPassword, user.sub, {
    previousPassword: currentPassword,
    upload
  });
  await setSessionPassword(backupPassword);
  return { data: inspected.data, counts: inspected.counts, sync: result.sync };
}

export async function manualSyncVault(password, userOrGoogleSub) {
  const googleSub = typeof userOrGoogleSub === 'string' ? userOrGoogleSub : userOrGoogleSub?.sub;
  requireGoogleSub(googleSub);
  const local = await decryptStoredVault(vaultStorageKey(googleSub), password, googleSub);
  if (await getPendingUpload(googleSub)) {
    return syncToGDrive(googleSub, local.envelope, {
      password,
      allowStaged: true
    });
  }
  return syncFromGDrive(googleSub, password);
}

async function downloadRemoteForResolution(googleSub, direction) {
  try {
    return await downloadRemoteEnvelope(googleSub);
  } catch (error) {
    if (error?.code === 'DRIVE_DUPLICATE_VAULT_FILES') {
      error.syncStatus = await updateSyncStatus(googleSub, {
        state: 'error',
        direction,
        reason: 'duplicate-remote-files',
        retryable: false,
        error: error.message
      });
    }
    throw error;
  }
}

function stagedRemoteMatchesLatest(staged, latest) {
  if (!latest?.envelope) return false;
  if (staged.file?.etag) {
    return staged.file.id === latest.file?.id
      && staged.file.etag === latest.file?.etag;
  }
  return staged.envelope.payload === latest.envelope.payload;
}

/**
 * Adopt the staged Drive copy even when no unlock session exists yet. The
 * previous encrypted local envelope is retained under a separate recovery key
 * and is never exposed as plaintext.
 */
export async function adoptStagedRemote(googleSub, password) {
  requireGoogleSub(googleSub);
  const key = vaultStorageKey(googleSub);
  const staged = await getStagedRemote(googleSub);
  if (!staged) throw new Error('Không còn bản cloud đang chờ xử lý.');
  const latest = await downloadRemoteForResolution(googleSub, 'download');
  if (!stagedRemoteMatchesLatest(staged, latest)) {
    const result = await conflictResult(
      googleSub,
      latest,
      'etag-mismatch',
      'Bản Drive đã đổi sau khi hiển thị xung đột; vui lòng xác nhận lại.',
      'download'
    );
    const error = makeError(result.status.error, 'DRIVE_CHANGED_DURING_RESOLUTION');
    error.syncStatus = result.status;
    throw error;
  }
  const remoteData = validateVaultData(await openEnvelope(latest.envelope, password), {
    expectedGoogleSub: googleSub,
    requireOwner: true
  });

  let local = await readEnvelopeRecord(key, { migrate: false }).catch(() => null);
  let usedLegacy = false;
  if (!local && await legacyCommonAllowedFor(googleSub)) {
    local = await readEnvelopeRecord(vaultStorageKey(null), { migrate: false }).catch(() => null);
    if (local?.envelope) usedLegacy = true;
  }
  let finalData = remoteData;
  let finalEnvelope = latest.envelope;

  // Auto-merge: if local has items not in remote, merge them so nothing is lost
  if (local?.envelope && password) {
    try {
      const localData = validateVaultData(await openEnvelope(local.envelope, password), {
        expectedGoogleSub: googleSub
      });
      const merged = mergeVaultData(localData, remoteData);
      if (!snapshotDataEqual({ data: merged }, { data: remoteData })) {
        finalData = merged;
        finalEnvelope = await createEnvelope(merged, password);
      }
    } catch {
      // Local envelope can't be decrypted (different password) — keep remote only
    }
  }

  const recoveryKey = preCloudRecoveryKey(googleSub);
  if (local?.envelope) {
    await chrome.storage.local.set({
      [recoveryKey]: {
        version: 1,
        envelope: local.envelope,
        savedAt: new Date().toISOString(),
        reason: staged.reason || 'use-cloud'
      }
    });
  }
  const recoveryAvailable = Boolean(
    local?.envelope
    || (await chrome.storage.local.get(recoveryKey))[recoveryKey]?.envelope
  );

  await replaceWithKnownGood(key, finalEnvelope);
  setVaultMemoryCache(key, password, finalData, finalEnvelope);
  if (usedLegacy) await persistLegacyOwnerClaim(googleSub).catch(() => null);
  await clearSyncWork(googleSub);
  await setSessionPassword(password);
  const status = await updateSyncStatus(googleSub, {
    state: 'synced',
    direction: 'download',
    reason: null,
    retryable: false,
    recoveryAvailable,
    remoteFileId: latest.file?.id || null,
    error: null
  });
  return {
    ok: true,
    action: 'downloaded',
    data: finalData,
    recoveryKey: recoveryAvailable ? recoveryKey : null,
    status
  };
}

export async function adoptStagedRemoteIfPresent(googleSub, password) {
  requireGoogleSub(googleSub);
  if (!await getStagedRemote(googleSub)) return null;
  return adoptStagedRemote(googleSub, password);
}

/**
 * Resolve a divergent-lineage conflict by adopting the authenticated Drive
 * copy. Drive is the only source of truth; a device copy must never overwrite
 * it from the conflict-resolution path.
 */
export async function resolveSyncConflict(googleSub, password, choice) {
  requireGoogleSub(googleSub);
  if (choice !== 'use-cloud') {
    throw new Error('Google Drive là nguồn dữ liệu chính; không thể dùng bản trên máy để ghi đè Drive.');
  }
  return adoptStagedRemote(googleSub, password);
}

if (globalThis.chrome?.storage) {
  ensureTrustedStorageAccess().catch(error => console.error('Không thể bảo vệ storage của vault:', error));
}
