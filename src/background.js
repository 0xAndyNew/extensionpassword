import {
  hasVault,
  createVault,
  unlockVault,
  readVault,
  writeVault,
  writeVaultLocal,
  getSessionPassword,
  lockVault,
  changeMasterPassword,
  syncFromGDrive,
  getSyncStatus,
  manualSyncVault,
  exportEncryptedBackup,
  importEncryptedBackup,
  resolveSyncConflict,
  adoptStagedRemote,
  adoptStagedRemoteIfPresent,
  exportPreCloudRecovery
} from './vault/repository.js';
import { matchesOrigin, normalizeOrigin } from './vault/domain-policy.js';
import { parseLastPassCsv, serializeLastPassCsv } from './vault/csv.js';
import {
  getFirebaseUser as getGoogleUser,
  signInWithFirebase as signInWithGoogle,
  signOutFirebase as signOutGoogle,
  ensureTrustedStorageAccess
} from './auth/firebase-auth.js';
import {
  parseAuthenticatorText,
  serializeAuthenticatorText,
  parseOtpAuthUri,
  normalizeSecret,
  reorderOtpAccounts
} from './vault/totp.js';
import { authorizeMessage } from './message-policy.js';
import { abortActiveSyncRequests as abortActiveDriveRequests } from './vault/firebase-sync.js';
import {
  PENDING_MUTATIONS_VERSION,
  MAX_PENDING_MUTATIONS,
  coalescePendingMutations,
  replayPendingMutations
} from './vault/pending-mutations.js';

const MAX_CSV_BYTES = 8 * 1024 * 1024;
const MAX_OTP_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_BACKUP_MESSAGE_BYTES = 11 * 1024 * 1024;
const MAX_USERNAME_LENGTH = 4096;
const MAX_PASSWORD_LENGTH = 32768;
const MAX_NOTES_LENGTH = 256 * 1024;
const OPEN_OTP_TAB_SESSION_KEY = 'aegisOpenOtpOnNextPopup';
const LAST_QR_SAVED_SESSION_KEY = 'aegisLastQrSavedOtp';
const PENDING_QR_SYNC_SESSION_KEY = 'aegisPendingQrSyncIds';
const DEFERRED_QR_SYNC_ALARM = 'aegisDeferredQrSync';
const AUTO_SYNC_ALARM = 'aegisAutoSync';
const AUTO_SYNC_RETRY_ALARM = 'aegisAutoSyncRetry';

const MUTATING_ACTIONS = new Set([
  'GOOGLE_SIGN_IN',
  'CREATE',
  'UNLOCK',
  'ADOPT_STAGED_REMOTE',
  'SYNC_NOW',
  'SAVE',
  'DELETE',
  'UPDATE_ITEM',
  'IMPORT_COMMIT',
  'OTP_SAVE',
  'SAVE_QR_URI',
  'OTP_DELETE',
  'OTP_REORDER',
  'OTP_IMPORT_COMMIT',
  'IMPORT_ENCRYPTED_BACKUP',
  'RESOLVE_SYNC_CONFLICT',
  'CHANGE_PASSWORD',
  'SAVE_NOTE',
  'DELETE_NOTE',
  'SAVE_CARD',
  'DELETE_CARD',
  'SAVE_IDENTITY',
  'DELETE_IDENTITY',
  'RESTORE_TRASH',
  'DELETE_PERMANENTLY',
  'EMPTY_TRASH'
]);

const AUTO_DRIVE_ACTIONS = new Set([
  'IMPORT_ENCRYPTED_BACKUP'
]);

let mutationTail = Promise.resolve();
let automaticSyncInFlight = false;

function enqueueMutation(operation) {
  const run = mutationTail.then(operation, operation);
  mutationTail = run.catch(() => undefined);
  return run;
}

function asText(value, field, { required = false, max = MAX_NOTES_LENGTH } = {}) {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new Error(`${field} không hợp lệ.`);
  }
  if (required && !value) throw new Error(`${field} không được để trống.`);
  if (value.length > max) throw new Error(`${field} vượt quá dung lượng cho phép.`);
  return value;
}

function asId(value) {
  return asText(value, 'Mã mục', { required: true, max: 256 });
}

function serializedLength(value) {
  if (typeof value === 'string') return value.length;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') throw new Error();
    return serialized.length;
  } catch {
    throw new Error('Dữ liệu JSON không hợp lệ.');
  }
}

function normalizeUrl(value) {
  const raw = asText(value, 'Website', { required: true, max: 8192 }).trim();
  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('Website không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Website phải dùng HTTP hoặc HTTPS.');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase())) {
    throw new Error('Website công khai phải dùng HTTPS. HTTP chỉ được hỗ trợ cho localhost.');
  }
  return url;
}

function safeCredential(item) {
  return {
    id: item.id,
    title: item.title || '',
    url: item.url || '',
    origins: Array.isArray(item.origins) ? item.origins : [],
    username: item.username || '',
    otpId: typeof item.otpId === 'string' ? item.otpId : '',
    grouping: item.grouping || '',
    favorite: Boolean(item.favorite),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function setQrActionBadge({ success, title }) {
  try {
    const color = success ? '#168447' : '#d92d20';
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color }),
      chrome.action.setBadgeText({ text: success ? '✓' : '!' }),
      chrome.action.setTitle({ title })
    ]);
  } catch {
    // Saving the OTP must not fail only because the toolbar cannot show a badge.
  }
}

async function clearQrActionBadge() {
  try {
    await Promise.all([
      chrome.action.setBadgeText({ text: '' }),
      chrome.action.setTitle({ title: 'Aegis Vault' })
    ]);
  } catch {
    // Some browser variants may not expose every action method.
  }
}

async function getPendingQrSyncIds() {
  const stored = (await chrome.storage.session.get(PENDING_QR_SYNC_SESSION_KEY))[
    PENDING_QR_SYNC_SESSION_KEY
  ];
  return Array.isArray(stored)
    ? [...new Set(stored.filter(id => typeof id === 'string' && id))]
    : [];
}

async function rememberPendingQrSync(id) {
  const ids = await getPendingQrSyncIds();
  if (!ids.includes(id)) ids.push(id);
  await chrome.storage.session.set({ [PENDING_QR_SYNC_SESSION_KEY]: ids });
}

async function clearPendingQrSync(ids) {
  const completed = new Set(ids);
  const remaining = (await getPendingQrSyncIds()).filter(id => !completed.has(id));
  if (remaining.length) {
    await chrome.storage.session.set({ [PENDING_QR_SYNC_SESSION_KEY]: remaining });
  } else {
    await chrome.storage.session.remove(PENDING_QR_SYNC_SESSION_KEY);
  }
}

function pendingMutationsKey(googleSub) {
  return `aegisPendingMutations_${String(googleSub)}`;
}

async function getPendingMutations(googleSub) {
  const key = pendingMutationsKey(googleSub);
  const stored = (await chrome.storage.local.get(key))[key];
  if (!stored || stored.version !== PENDING_MUTATIONS_VERSION || !Array.isArray(stored.operations)) {
    return [];
  }
  const operations = stored.operations.filter(operation => (
    operation
    && typeof operation === 'object'
    && typeof operation.kind === 'string'
  ));
  return operations.length > MAX_PENDING_MUTATIONS
    ? [{ kind: 'replace-vault' }]
    : operations;
}

async function appendPendingMutations(googleSub, operations) {
  const key = pendingMutationsKey(googleSub);
  const next = coalescePendingMutations(await getPendingMutations(googleSub), operations);
  await chrome.storage.local.set({
    [key]: {
      version: PENDING_MUTATIONS_VERSION,
      updatedAt: new Date().toISOString(),
      operations: next
    }
  });
  await scheduleAutomaticSyncRetry(1000);
}

async function clearPendingMutations(googleSub) {
  await chrome.storage.local.remove(pendingMutationsKey(googleSub));
}

async function clearQrSyncCoveredBy(operations) {
  const pendingIds = await getPendingQrSyncIds();
  if (!pendingIds.length) return;
  if (operations.some(operation => operation.kind === 'replace-vault')) {
    await clearPendingQrSync(pendingIds);
    return;
  }
  const uploadedIds = new Set(
    operations
      .filter(operation => operation.kind === 'otp-upsert')
      .map(operation => operation.id)
  );
  const completedIds = pendingIds.filter(id => uploadedIds.has(id));
  if (completedIds.length) await clearPendingQrSync(completedIds);
}

async function promotePendingQrSync(user, password) {
  const pendingIds = await getPendingQrSyncIds();
  if (!pendingIds.length) return;
  const [vault, queuedOperations] = await Promise.all([
    readVault(password, user.sub),
    getPendingMutations(user.sub)
  ]);
  if (queuedOperations.some(operation => operation.kind === 'replace-vault')) return;

  const localOtpIds = new Set(
    (Array.isArray(vault.otpAccounts) ? vault.otpAccounts : []).map(item => item.id)
  );
  const explicitlyDeletedIds = new Set(
    queuedOperations
      .filter(operation => operation.kind === 'otp-delete')
      .map(operation => operation.id)
  );
  const staleIds = pendingIds.filter(id => !localOtpIds.has(id) || explicitlyDeletedIds.has(id));
  if (staleIds.length) await clearPendingQrSync(staleIds);

  const existingUpsertIds = new Set(
    queuedOperations
      .filter(operation => operation.kind === 'otp-upsert')
      .map(operation => operation.id)
  );
  const upsertIds = pendingIds.filter(id =>
    localOtpIds.has(id)
    && !explicitlyDeletedIds.has(id)
    && !existingUpsertIds.has(id)
  );
  if (upsertIds.length) {
    await appendPendingMutations(
      user.sub,
      upsertIds.map(id => ({ kind: 'otp-upsert', id }))
    );
  }
}

async function writeVaultLocalFirst(vault, password, googleSub, operations) {
  await writeVaultLocal(vault, password, googleSub);
  await appendPendingMutations(googleSub, operations);
  return {
    syncStatus: {
      state: 'pending',
      direction: 'upload',
      message: 'Đã lưu an toàn trên máy và đang tự đồng bộ Drive.'
    },
    queueAutomaticSync: true
  };
}

async function scheduleDeferredQrSync(delayMs = 5000) {
  try {
    await chrome.alarms.create(DEFERRED_QR_SYNC_ALARM, { when: Date.now() + delayMs });
  } catch {
    // The OTP is already encrypted locally. A later normal sync can retry Drive.
  }
}

async function ensureAutomaticSyncAlarm() {
  try {
    const existing = typeof chrome.alarms.get === 'function'
      ? await chrome.alarms.get(AUTO_SYNC_ALARM)
      : null;
    if (!existing) {
      await chrome.alarms.create(AUTO_SYNC_ALARM, {
        delayInMinutes: 1,
        periodInMinutes: 1
      });
    }
  } catch {
    // Local writes remain usable; the next startup or foreground action can retry this alarm.
  }
}

async function scheduleAutomaticSyncRetry(delayMs = 30_000) {
  try {
    await chrome.alarms.create(AUTO_SYNC_RETRY_ALARM, { when: Date.now() + delayMs });
  } catch {
    // The periodic alarm remains as a fallback.
  }
}

async function requireUser() {
  const user = await getGoogleUser();
  if (!user) throw new Error('Hãy đăng nhập Google trước.');
  return user;
}

async function getStatus(user, { checkRemote = true } = {}) {
  let hasLocal = await hasVault(user.sub);
  let syncStatus = await getSyncStatus(user.sub);

  if (!hasLocal && checkRemote && ['idle', 'error'].includes(syncStatus.state)) {
    try {
      await syncFromGDrive(user.sub);
    } catch {
      // The persisted sync status contains the actionable error.
    }
    hasLocal = await hasVault(user.sub);
    syncStatus = await getSyncStatus(user.sub);
  }

  const hasRemote = Boolean(syncStatus.remoteFileId);
  const exists = hasLocal || hasRemote;
  const unlocked = Boolean(await getSessionPassword());
  const [pendingMutations, pendingQrIds] = await Promise.all([
    getPendingMutations(user.sub),
    getPendingQrSyncIds()
  ]);
  if ((pendingMutations.length || pendingQrIds.length) && !['conflict', 'staged'].includes(syncStatus.state)) {
    syncStatus = {
      ...syncStatus,
      state: 'pending',
      direction: 'upload',
      retryable: true,
      message: 'Dữ liệu đã lưu trên máy và đang tự đồng bộ Firebase.'
    };
  }
  const remoteCheckSucceeded = syncStatus.state === 'synced';
  return {
    exists,
    unlocked,
    user,
    canCreate: !exists && remoteCheckSucceeded,
    syncStatus
  };
}

async function resolveExtensionFillOrigin(message, context) {
  if (context.kind === 'content') return context.origin;
  if (!Number.isInteger(message.tabId)) throw new Error('Tab cần điền không hợp lệ.');
  const tab = await chrome.tabs.get(message.tabId);
  if (!tab?.url) throw new Error('Không tìm thấy trang cần điền.');
  const tabUrl = new URL(tab.url);
  if (
    tabUrl.protocol !== 'https:'
    && !(tabUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(tabUrl.hostname.toLowerCase()))
  ) {
    throw new Error('Aegis Vault chỉ điền mật khẩu trên HTTPS hoặc localhost.');
  }
  const tabOrigin = normalizeOrigin(tab.url);
  if (normalizeOrigin(message.origin) !== tabOrigin) {
    throw new Error('Trang đang mở đã thay đổi. Hãy thử lại.');
  }
  return tabOrigin;
}

async function handle(rawMessage, context) {
  const message = rawMessage;

  if (message.type === 'GOOGLE_STATUS') return { user: await getGoogleUser() };
  if (message.type === 'GOOGLE_SIGN_IN') {
    const previousUser = await getGoogleUser();
    const user = await signInWithGoogle();
    if (!previousUser || previousUser.sub !== user.sub) await lockVault();
    const sessionPassword = await getSessionPassword();
    try {
      await syncFromGDrive(
        user.sub,
        sessionPassword,
        { preferDrive: Boolean(sessionPassword) }
      );
    } catch {
      // Sign-in remains valid; the UI receives the persisted sync error.
    }
    return { user, syncStatus: await getSyncStatus(user.sub) };
  }
  if (message.type === 'GOOGLE_SIGN_OUT') {
    await lockVault();
    await signOutGoogle();
    return {};
  }
  if (message.type === 'OPEN_OPTIONS') {
    await chrome.runtime.openOptionsPage();
    return {};
  }
  if (message.type === 'CAPTURE_QR_SELECTION') {
    if (context.kind !== 'content' || !Number.isInteger(context.tabId)) {
      throw new Error('Nguồn chọn vùng QR không hợp lệ.');
    }
    const tab = await chrome.tabs.get(context.tabId);
    if (!tab?.active || tab.windowId !== context.windowId) {
      throw new Error('Trang cần quét không còn là tab đang hoạt động.');
    }
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return { screenshot };
  }
  const user = await requireUser();

  if (message.type === 'STATUS') {
    await clearQrActionBadge();
    const status = await getStatus(user);
    if (
      status.unlocked
      && ['error', 'pending'].includes(String(status.syncStatus?.state || '').toLowerCase())
    ) {
      void scheduleAutomaticSyncRetry(1000);
    }
    return status;
  }
  if (message.type === 'SYNC_STATUS') return { status: await getSyncStatus(user.sub) };
  if (message.type === 'SYNC_NOW') {
    const password = await getSessionPassword();
    const exists = await hasVault(user.sub);
    let result;
    if (password && exists) {
      await runAutomaticSync();
      result = { ok: true, status: await getSyncStatus(user.sub) };
    } else {
      result = await syncFromGDrive(user.sub);
    }
    let status = result.status || await getSyncStatus(user.sub);
    if (exists && !password && result.remoteFound === false) {
      status = {
        ...status,
        state: 'locked',
        message: 'Mở khóa Vault để tải bản local lên Google Drive.'
      };
    }
    return { status, syncResult: result };
  }

  if (message.type === 'CREATE') {
    const data = await createVault(asText(message.password, 'Mật khẩu chính', { required: true, max: 4096 }), user);
    return { data, syncStatus: await getSyncStatus(user.sub) };
  }
  if (message.type === 'UNLOCK') {
    const data = await unlockVault(asText(message.password, 'Mật khẩu chính', { required: true, max: 4096 }), user);
    return { data, syncStatus: await getSyncStatus(user.sub) };
  }
  if (message.type === 'ADOPT_STAGED_REMOTE') {
    const result = await adoptStagedRemote(
      user.sub,
      asText(message.password, 'Mật khẩu chính', { required: true, max: 4096 })
    );
    return {
      data: result.data,
      action: result.action,
      recoveryKey: result.recoveryKey,
      syncStatus: result.status
    };
  }
  if (message.type === 'LOCK') {
    await lockVault();
    return {};
  }

  const password = await getSessionPassword();
  if (!password) throw new Error('Vault đang khóa.');
  let vault = await readVault(password, user.sub);
  if (vault.owner?.googleSub && vault.owner.googleSub !== user.sub) {
    throw new Error('Vault thuộc một tài khoản Google khác.');
  }

  if (message.type === 'SAVE_QR_URI') {
    if (context.kind === 'content') {
      if (!Number.isInteger(context.tabId)) throw new Error('Nguồn mã QR không hợp lệ.');
      const tab = await chrome.tabs.get(context.tabId);
      if (!tab?.active || tab.windowId !== context.windowId) {
        throw new Error('Trang cần quét không còn là tab đang hoạt động.');
      }
    }
    const parsed = parseOtpAuthUri(
      asText(message.uri, 'URI OTP', { required: true, max: 16384 })
    );
    if (!parsed.issuer && !parsed.account) {
      throw new Error('Mã QR không có tên dịch vụ hoặc tài khoản.');
    }

    const otpAccounts = Array.isArray(vault.otpAccounts) ? vault.otpAccounts : [];
    const existing = otpAccounts.find(item => otpIdentity(item) === otpIdentity(parsed));
    if (existing) {
      await chrome.storage.session.set({
        [OPEN_OTP_TAB_SESSION_KEY]: true,
        [LAST_QR_SAVED_SESSION_KEY]: {
          id: existing.id,
          issuer: existing.issuer || '',
          account: existing.account || '',
          duplicate: true
        }
      });
      await setQrActionBadge({
        success: true,
        title: 'Mã OTP này đã có trong Aegis Vault'
      });
      return {
        savedId: existing.id,
        duplicate: true,
        otp: { issuer: existing.issuer || '', account: existing.account || '' }
      };
    }

    const now = new Date().toISOString();
    const savedItem = {
      id: crypto.randomUUID(),
      ...parsed,
      createdAt: now,
      updatedAt: now
    };
    otpAccounts.push(savedItem);
    vault.otpAccounts = otpAccounts;
    await writeVaultLocal(vault, password, user.sub);
    await appendPendingMutations(user.sub, [{ kind: 'otp-upsert', id: savedItem.id }]);
    await rememberPendingQrSync(savedItem.id);
    await scheduleDeferredQrSync();
    await chrome.storage.session.set({
      [OPEN_OTP_TAB_SESSION_KEY]: true,
      [LAST_QR_SAVED_SESSION_KEY]: {
        id: savedItem.id,
        issuer: savedItem.issuer || '',
        account: savedItem.account || '',
        duplicate: false
      }
    });
    await setQrActionBadge({
      success: true,
      title: 'Đã lưu mã OTP vào Aegis Vault'
    });
    return {
      savedId: savedItem.id,
      otpAccounts,
      otp: { issuer: savedItem.issuer || '', account: savedItem.account || '' },
      syncStatus: { state: 'pending', direction: 'upload' },
      queueAutomaticSync: true
    };
  }

  if (message.type === 'LIST') {
    return { credentials: vault.credentials.map(safeCredential) };
  }
  if (message.type === 'LIST_DECRYPTED') return { credentials: vault.credentials };
  if (message.type === 'GET_CREDENTIAL_DETAIL') {
    const id = asId(message.id);
    const credential = vault.credentials.find(item => item.id === id);
    if (!credential) throw new Error('Không tìm thấy tài khoản.');
    return { credential };
  }

  if (message.type === 'MATCH') {
    return {
      credentials: vault.credentials
        .filter(item => matchesOrigin(item, message.origin))
        .map(safeCredential)
    };
  }
  if (message.type === 'CHECK_EXISTS') {
    const username = asText(message.username, 'Tên đăng nhập', { required: true, max: MAX_USERNAME_LENGTH });
    const candidatePassword = asText(message.password, 'Mật khẩu', { required: true, max: MAX_PASSWORD_LENGTH });
    const exists = vault.credentials.some(item => (
      matchesOrigin(item, message.origin)
      && item.username === username
      && item.password === candidatePassword
    ));
    return { exists };
  }
  if (message.type === 'FILL') {
    const origin = await resolveExtensionFillOrigin(message, context);
    const id = asId(message.id);
    const item = vault.credentials.find(credential => credential.id === id && matchesOrigin(credential, origin));
    if (!item) throw new Error('Tài khoản không khớp chính xác website hiện tại.');
    return { credential: { username: item.username, password: item.password } };
  }

  if (message.type === 'SAVE') {
    const origin = normalizeOrigin(message.origin);
    const savedItem = upsert(vault, {
      origin,
      username: asText(message.username, 'Tên đăng nhập', { required: true, max: MAX_USERNAME_LENGTH }).trim(),
      password: asText(message.password, 'Mật khẩu', { required: true, max: MAX_PASSWORD_LENGTH }),
      title: new URL(origin).hostname
    });
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'credential-upsert', id: savedItem.id }
    ]);
  }
  if (message.type === 'LIST_ALL') {
    return {
      credentials: vault.credentials || [],
      otpAccounts: vault.otpAccounts || [],
      notes: vault.notes || [],
      cards: vault.cards || [],
      identities: vault.identities || [],
      trash: vault.trash || []
    };
  }

  if (message.type === 'SAVE') {
    const origin = normalizeOrigin(message.origin);
    const savedItem = upsert(vault, {
      origin,
      username: asText(message.username, 'Tên đăng nhập', { required: true, max: MAX_USERNAME_LENGTH }).trim(),
      password: asText(message.password, 'Mật khẩu', { required: true, max: MAX_PASSWORD_LENGTH }),
      title: new URL(origin).hostname
    });
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'credential-upsert', id: savedItem.id }
    ]);
  }
  if (message.type === 'DELETE') {
    const id = asId(message.id);
    const target = vault.credentials.find(item => item.id === id);
    if (target) {
      vault.credentials = vault.credentials.filter(item => item.id !== id);
      if (!Array.isArray(vault.trash)) vault.trash = [];
      vault.trash.push({
        id: crypto.randomUUID(),
        itemType: 'credential',
        originalItem: target,
        deletedAt: new Date().toISOString()
      });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'credential-delete', id }
    ]);
  }
  if (message.type === 'UPDATE_ITEM') {
    const url = normalizeUrl(message.url);
    const origin = url.origin;
    const id = message.id ? asId(message.id) : '';
    const now = new Date().toISOString();
    const newPassword = asText(message.password, 'Mật khẩu', { required: true, max: MAX_PASSWORD_LENGTH });
    const rawOtpSecret = asText(message.otpSecret, 'Mã bí mật OTP', { max: 16384 }).trim();
    const otpIssuer = asText(message.otpIssuer, 'Dịch vụ OTP', { max: 512 }).trim();
    const otpAccount = asText(message.otpAccount, 'Tài khoản OTP', { max: MAX_USERNAME_LENGTH }).trim();
    const linkedOtp = id
      ? (vault.otpAccounts || []).find(otp => otp.id === vault.credentials.find(item => item.id === id)?.otpId)
      : null;
    let savedOtp = null;
    if (rawOtpSecret) {
      const parsedOtp = rawOtpSecret.toLowerCase().startsWith('otpauth://')
        ? parseOtpAuthUri(rawOtpSecret)
        : {
            issuer: asText(otpIssuer, 'Dịch vụ OTP', { required: true, max: 512 }),
            account: asText(otpAccount, 'Tài khoản OTP', { required: true, max: MAX_USERNAME_LENGTH }),
            secret: normalizeSecret(rawOtpSecret),
            algorithm: linkedOtp?.algorithm || 'SHA1',
            digits: linkedOtp?.digits || 6,
            period: linkedOtp?.period || 30
          };
      if (linkedOtp) {
        Object.assign(linkedOtp, parsedOtp, {
          issuer: parsedOtp.issuer || otpIssuer,
          account: parsedOtp.account || otpAccount,
          updatedAt: now
        });
        savedOtp = linkedOtp;
      } else {
        savedOtp = {
          id: crypto.randomUUID(),
          ...parsedOtp,
          issuer: parsedOtp.issuer || otpIssuer,
          account: parsedOtp.account || otpAccount,
          createdAt: now,
          updatedAt: now
        };
        if (!Array.isArray(vault.otpAccounts)) vault.otpAccounts = [];
        vault.otpAccounts.push(savedOtp);
      }
    }
    const updated = {
      title: asText(message.title, 'Tên mục', { max: 512 }).trim() || url.hostname,
      url: url.href,
      origins: [origin],
      origin,
      username: asText(message.username, 'Tên đăng nhập', { required: true, max: MAX_USERNAME_LENGTH }).trim(),
      password: newPassword,
      notes: asText(message.notes, 'Ghi chú', { max: MAX_NOTES_LENGTH }),
      otpId: savedOtp?.id || '',
      favorite: Boolean(message.favorite),
      updatedAt: now
    };
    if (id) {
      const item = vault.credentials.find(value => value.id === id);
      if (!item) throw new Error('Không tìm thấy tài khoản.');
      if (item.password && item.password !== newPassword) {
        if (!Array.isArray(item.passwordHistory)) item.passwordHistory = [];
        item.passwordHistory.unshift({
          password: item.password,
          changedAt: now
        });
        if (item.passwordHistory.length > 5) {
          item.passwordHistory = item.passwordHistory.slice(0, 5);
        }
      }
      Object.assign(item, updated);
    } else {
      vault.credentials.push({
        id: crypto.randomUUID(),
        ...updated,
        grouping: '',
        createdAt: now
      });
    }
    const savedId = id || vault.credentials[vault.credentials.length - 1].id;
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'credential-upsert', id: savedId },
      ...(savedOtp ? [{ kind: 'otp-upsert', id: savedOtp.id }] : [])
    ]);
  }

  // --- Secure Notes Handlers ---
  if (message.type === 'SAVE_NOTE') {
    if (!Array.isArray(vault.notes)) vault.notes = [];
    const id = message.id ? asId(message.id) : '';
    const now = new Date().toISOString();
    const noteData = {
      title: asText(message.title, 'Tiêu đề ghi chú', { required: true, max: 512 }).trim(),
      notes: asText(message.notes, 'Nội dung ghi chú', { required: true, max: MAX_NOTES_LENGTH }),
      favorite: Boolean(message.favorite),
      updatedAt: now
    };
    let savedId;
    if (id) {
      const existing = vault.notes.find(n => n.id === id);
      if (!existing) throw new Error('Không tìm thấy ghi chú.');
      Object.assign(existing, noteData);
      savedId = id;
    } else {
      savedId = crypto.randomUUID();
      vault.notes.push({ id: savedId, ...noteData, createdAt: now });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'note-upsert', id: savedId }
    ]);
  }
  if (message.type === 'DELETE_NOTE') {
    const id = asId(message.id);
    if (!Array.isArray(vault.notes)) vault.notes = [];
    const target = vault.notes.find(n => n.id === id);
    if (target) {
      vault.notes = vault.notes.filter(n => n.id !== id);
      if (!Array.isArray(vault.trash)) vault.trash = [];
      vault.trash.push({
        id: crypto.randomUUID(),
        itemType: 'note',
        originalItem: target,
        deletedAt: new Date().toISOString()
      });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'note-delete', id }
    ]);
  }

  // --- Payment Cards Handlers ---
  if (message.type === 'SAVE_CARD') {
    if (!Array.isArray(vault.cards)) vault.cards = [];
    const id = message.id ? asId(message.id) : '';
    const now = new Date().toISOString();
    const cardData = {
      title: asText(message.title, 'Tên thẻ / Ngân hàng', { required: true, max: 512 }).trim(),
      cardholderName: asText(message.cardholderName, 'Tên chủ thẻ', { max: 512 }).trim(),
      cardNumber: asText(message.cardNumber, 'Số thẻ', { max: 64 }).trim(),
      expMonth: asText(message.expMonth, 'Tháng hết hạn', { max: 8 }).trim(),
      expYear: asText(message.expYear, 'Năm hết hạn', { max: 8 }).trim(),
      cvv: asText(message.cvv, 'Mã CVV', { max: 16 }).trim(),
      notes: asText(message.notes, 'Ghi chú', { max: MAX_NOTES_LENGTH }),
      favorite: Boolean(message.favorite),
      updatedAt: now
    };
    let savedId;
    if (id) {
      const existing = vault.cards.find(c => c.id === id);
      if (!existing) throw new Error('Không tìm thấy thẻ.');
      Object.assign(existing, cardData);
      savedId = id;
    } else {
      savedId = crypto.randomUUID();
      vault.cards.push({ id: savedId, ...cardData, createdAt: now });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'card-upsert', id: savedId }
    ]);
  }
  if (message.type === 'DELETE_CARD') {
    const id = asId(message.id);
    if (!Array.isArray(vault.cards)) vault.cards = [];
    const target = vault.cards.find(c => c.id === id);
    if (target) {
      vault.cards = vault.cards.filter(c => c.id !== id);
      if (!Array.isArray(vault.trash)) vault.trash = [];
      vault.trash.push({
        id: crypto.randomUUID(),
        itemType: 'card',
        originalItem: target,
        deletedAt: new Date().toISOString()
      });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'card-delete', id }
    ]);
  }

  // --- Personal Identity Handlers ---
  if (message.type === 'SAVE_IDENTITY') {
    if (!Array.isArray(vault.identities)) vault.identities = [];
    const id = message.id ? asId(message.id) : '';
    const now = new Date().toISOString();
    const identityData = {
      title: asText(message.title, 'Tên hồ sơ', { required: true, max: 512 }).trim(),
      fullName: asText(message.fullName, 'Họ và tên', { max: 512 }).trim(),
      email: asText(message.email, 'Email', { max: 320 }).trim(),
      phone: asText(message.phone, 'Số điện thoại', { max: 64 }).trim(),
      address: asText(message.address, 'Địa chỉ', { max: 1024 }).trim(),
      city: asText(message.city, 'Thành phố', { max: 256 }).trim(),
      zipCode: asText(message.zipCode, 'Mã Bưu điện / Zip', { max: 32 }).trim(),
      country: asText(message.country, 'Quốc gia', { max: 128 }).trim(),
      notes: asText(message.notes, 'Ghi chú', { max: MAX_NOTES_LENGTH }),
      favorite: Boolean(message.favorite),
      updatedAt: now
    };
    let savedId;
    if (id) {
      const existing = vault.identities.find(i => i.id === id);
      if (!existing) throw new Error('Không tìm thấy hồ sơ định danh.');
      Object.assign(existing, identityData);
      savedId = id;
    } else {
      savedId = crypto.randomUUID();
      vault.identities.push({ id: savedId, ...identityData, createdAt: now });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'identity-upsert', id: savedId }
    ]);
  }
  if (message.type === 'DELETE_IDENTITY') {
    const id = asId(message.id);
    if (!Array.isArray(vault.identities)) vault.identities = [];
    const target = vault.identities.find(i => i.id === id);
    if (target) {
      vault.identities = vault.identities.filter(i => i.id !== id);
      if (!Array.isArray(vault.trash)) vault.trash = [];
      vault.trash.push({
        id: crypto.randomUUID(),
        itemType: 'identity',
        originalItem: target,
        deletedAt: new Date().toISOString()
      });
    }
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'identity-delete', id }
    ]);
  }

  // --- Trash / Recycle Bin Handlers ---
  if (message.type === 'RESTORE_TRASH') {
    const id = asId(message.id);
    if (!Array.isArray(vault.trash)) vault.trash = [];
    const trashIndex = vault.trash.findIndex(t => t.id === id);
    if (trashIndex === -1) throw new Error('Không tìm thấy mục trong thùng rác.');
    const trashEntry = vault.trash[trashIndex];
    const { itemType, originalItem } = trashEntry;

    if (itemType === 'credential') {
      if (!Array.isArray(vault.credentials)) vault.credentials = [];
      vault.credentials.push(originalItem);
    } else if (itemType === 'otp') {
      if (!Array.isArray(vault.otpAccounts)) vault.otpAccounts = [];
      vault.otpAccounts.push(originalItem);
    } else if (itemType === 'note') {
      if (!Array.isArray(vault.notes)) vault.notes = [];
      vault.notes.push(originalItem);
    } else if (itemType === 'card') {
      if (!Array.isArray(vault.cards)) vault.cards = [];
      vault.cards.push(originalItem);
    } else if (itemType === 'identity') {
      if (!Array.isArray(vault.identities)) vault.identities = [];
      vault.identities.push(originalItem);
    }
    vault.trash.splice(trashIndex, 1);

    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: `${itemType}-restore`, id: originalItem.id }
    ]);
  }
  if (message.type === 'DELETE_PERMANENTLY') {
    const id = asId(message.id);
    if (!Array.isArray(vault.trash)) vault.trash = [];
    vault.trash = vault.trash.filter(t => t.id !== id);
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'trash-delete', id }
    ]);
  }
  if (message.type === 'EMPTY_TRASH') {
    vault.trash = [];
    return writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'trash-empty', id: 'all' }
    ]);
  }
  if (message.type === 'IMPORT_PREVIEW' || message.type === 'IMPORT_COMMIT') {
    const csv = asText(message.csv, 'CSV', { required: true, max: MAX_CSV_BYTES });
    const parsed = parseLastPassCsv(csv);
    if (message.type === 'IMPORT_PREVIEW') {
      return {
        preview: {
          total: parsed.total,
          valid: parsed.records.length,
          errors: parsed.errors,
          duplicates: parsed.records.filter(record => (
            vault.credentials.some(item => item.username === record.username && matchesOrigin(item, record.origin))
          )).length
        }
      };
    }
    const importedIds = parsed.records.map(record => upsert(vault, record).id);
    const localWrite = await writeVaultLocalFirst(
      vault,
      password,
      user.sub,
      importedIds.map(id => ({ kind: 'credential-upsert', id }))
    );
    return {
      imported: parsed.records.length,
      errors: parsed.errors,
      ...localWrite
    };
  }
  if (message.type === 'EXPORT_CSV') {
    await readVault(asText(message.masterPassword, 'Mật khẩu chính', { required: true, max: 4096 }), user.sub);
    return { csv: serializeLastPassCsv(vault.credentials), count: vault.credentials.length };
  }

  const otpAccounts = Array.isArray(vault.otpAccounts) ? vault.otpAccounts : [];
  if (message.type === 'OTP_LIST') return { otpAccounts };
  if (message.type === 'OTP_SAVE') {
    const parsed = message.uri
      ? parseOtpAuthUri(asText(message.uri, 'URI OTP', { required: true, max: 16384 }))
      : normalizeOtpFields(message);
    if (!parsed.issuer && !parsed.account) throw new Error('Hãy nhập dịch vụ hoặc tài khoản.');
    const now = new Date().toISOString();
    let savedItem;
    if (message.id) {
      const item = otpAccounts.find(value => value.id === asId(message.id));
      if (!item) throw new Error('Không tìm thấy mã OTP.');
      Object.assign(item, parsed, { updatedAt: now });
      savedItem = item;
    } else {
      savedItem = { id: crypto.randomUUID(), ...parsed, createdAt: now, updatedAt: now };
      otpAccounts.push(savedItem);
    }
    vault.otpAccounts = otpAccounts;
    const localWrite = await writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'otp-upsert', id: savedItem.id }
    ]);
    return {
      savedId: savedItem.id,
      otpAccounts,
      ...localWrite
    };
  }
  if (message.type === 'OTP_DELETE') {
    const id = asId(message.id);
    const target = otpAccounts.find(item => item.id === id);
    const linkedCredentialIds = [];
    if (target) {
      vault.otpAccounts = otpAccounts.filter(item => item.id !== id);
      for (const credential of vault.credentials || []) {
        if (credential.otpId === id) {
          credential.otpId = '';
          credential.updatedAt = new Date().toISOString();
          linkedCredentialIds.push(credential.id);
        }
      }
      if (!Array.isArray(vault.trash)) vault.trash = [];
      vault.trash.push({
        id: crypto.randomUUID(),
        itemType: 'otp',
        originalItem: target,
        deletedAt: new Date().toISOString()
      });
    }
    const localWrite = await writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'otp-delete', id },
      ...linkedCredentialIds.map(credentialId => ({ kind: 'credential-upsert', id: credentialId }))
    ]);
    return {
      otpAccounts: vault.otpAccounts,
      ...localWrite
    };
  }
  if (message.type === 'OTP_REORDER') {
    const ids = Array.isArray(message.ids) ? message.ids.map(asId) : [];
    vault.otpAccounts = reorderOtpAccounts(otpAccounts, ids);
    const localWrite = await writeVaultLocalFirst(vault, password, user.sub, [
      { kind: 'otp-reorder', ids }
    ]);
    return {
      otpAccounts: vault.otpAccounts,
      ...localWrite
    };
  }
  if (message.type === 'OTP_IMPORT_PREVIEW' || message.type === 'OTP_IMPORT_COMMIT') {
    const text = asText(message.text, 'Dữ liệu OTP', { required: true, max: MAX_OTP_IMPORT_BYTES });
    const parsed = parseAuthenticatorText(text);
    const seen = new Set(otpAccounts.map(otpIdentity));
    let duplicates = 0;
    const uniqueRecords = [];
    for (const record of parsed.records) {
      const identity = otpIdentity(record);
      if (seen.has(identity)) {
        duplicates += 1;
      } else {
        seen.add(identity);
        uniqueRecords.push(record);
      }
    }
    if (message.type === 'OTP_IMPORT_PREVIEW') {
      return {
        preview: {
          total: parsed.total,
          valid: parsed.records.length,
          duplicates,
          errors: parsed.errors
        }
      };
    }
    const now = new Date().toISOString();
    const importedIds = uniqueRecords.map(record => {
      const item = { id: crypto.randomUUID(), ...record, createdAt: now, updatedAt: now };
      otpAccounts.push(item);
      return item.id;
    });
    vault.otpAccounts = otpAccounts;
    const localWrite = await writeVaultLocalFirst(
      vault,
      password,
      user.sub,
      importedIds.map(id => ({ kind: 'otp-upsert', id }))
    );
    return {
      imported: uniqueRecords.length,
      errors: parsed.errors,
      ...localWrite
    };
  }
  if (message.type === 'OTP_EXPORT_TXT') {
    await readVault(asText(message.masterPassword, 'Mật khẩu chính', { required: true, max: 4096 }), user.sub);
    return { text: serializeAuthenticatorText(otpAccounts), count: otpAccounts.length };
  }

  if (message.type === 'EXPORT_ENCRYPTED_BACKUP') {
    return exportEncryptedBackup(
      asText(message.masterPassword, 'Mật khẩu chính', { required: true, max: 4096 }),
      user
    );
  }
  if (message.type === 'EXPORT_PRE_CLOUD_RECOVERY') {
    return exportPreCloudRecovery(user.sub);
  }
  if (message.type === 'IMPORT_ENCRYPTED_BACKUP') {
    if (serializedLength(message.backup) > MAX_BACKUP_MESSAGE_BYTES) {
      throw new Error('Tệp backup vượt quá dung lượng cho phép.');
    }
    const result = await importEncryptedBackup(
      message.backup,
      asText(message.masterPassword, 'Mật khẩu backup', { required: true, max: 4096 }),
      user,
      { currentPassword: password, upload: false }
    );
    const localWrite = {
      syncStatus: {
        state: 'pending',
        direction: 'upload',
        message: 'Backup đã được khôi phục trên máy và đang tự đồng bộ Drive.'
      },
      queueAutomaticSync: true
    };
    await appendPendingMutations(user.sub, [{ kind: 'replace-vault' }]);
    return {
      counts: result.counts,
      ...localWrite
    };
  }
  if (message.type === 'RESOLVE_SYNC_CONFLICT') {
    if (!['remote', 'use-cloud'].includes(message.choice)) {
      throw new Error('Google Drive là nguồn dữ liệu chính; chỉ có thể lấy bản từ Drive.');
    }
    const resolutionPassword = message.password
      ? asText(message.password, 'Mật khẩu bản Drive', { required: true, max: 4096 })
      : password;
    const result = await resolveSyncConflict(user.sub, resolutionPassword, 'use-cloud');
    return { status: result.status, action: result.action };
  }
  if (message.type === 'CHANGE_PASSWORD') {
    const changeResult = await changeMasterPassword(
      asText(message.currentPassword, 'Mật khẩu hiện tại', { required: true, max: 4096 }),
      asText(message.newPassword, 'Mật khẩu mới', { required: true, max: 4096 }),
      user
    );
    const syncStatus = changeResult?.sync?.status || await getSyncStatus(user.sub);
    return {
      passwordChanged: true,
      syncOk: changeResult?.sync?.ok !== false,
      syncStatus
    };
  }
  if (message.type === 'GET_SETTINGS') return { settings: vault.settings || {} };

  throw new Error('Hành động không hợp lệ.');
}

async function handleWithAutomaticDrive(message, context) {
  if (!AUTO_DRIVE_ACTIONS.has(message.type)) return handle(message, context);

  const user = await getGoogleUser();
  const password = await getSessionPassword();
  if (!user?.sub || !password) return handle(message, context);

  const pendingQrSyncIds = await getPendingQrSyncIds();
  if (
    pendingQrSyncIds.length
    && message.type === 'SAVE_QR_URI'
  ) {
    return handle(message, context);
  }

  try {
    await adoptStagedRemoteIfPresent(user.sub, password);
  } catch (error) {
    if (message.type !== 'STATUS') throw error;
    await lockVault();
    return handle(message, context);
  }

  let result;
  try {
    result = await handle(message, context);
  } catch (error) {
    if (error?.code !== 'SYNC_CONFLICT_PENDING') throw error;
    const adopted = await adoptStagedRemoteIfPresent(user.sub, password);
    if (!adopted) throw error;
    return handle(message, context);
  }

  const syncState = String(result?.syncStatus?.state || '').toLowerCase();
  if (!['conflict', 'staged'].includes(syncState)) return result;
  const adopted = await adoptStagedRemoteIfPresent(user.sub, password);
  return adopted ? handle(message, context) : result;
}

function normalizeOtpFields(message) {
  const issuer = asText(message.issuer, 'Dịch vụ OTP', { max: 512 }).trim();
  const account = asText(message.account, 'Tài khoản OTP', { max: 4096 }).trim();
  const secret = normalizeSecret(asText(message.secret, 'Secret OTP', { required: true, max: 16384 }));
  const algorithm = String(message.algorithm || 'SHA1').toUpperCase().replace('-', '');
  const digits = Number(message.digits ?? 6);
  const period = Number(message.period ?? 30);
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) throw new Error('Thuật toán OTP không được hỗ trợ.');
  if (![6, 7, 8].includes(digits)) throw new Error('OTP phải có từ 6 đến 8 chữ số.');
  if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error('Chu kỳ OTP không hợp lệ.');
  return { issuer, account, secret, algorithm, digits, period };
}

function otpIdentity(item) {
  return `${String(item.secret || '')}\u0000${String(item.account || '').toLowerCase()}\u0000${String(item.issuer || '').toLowerCase()}`;
}

function upsert(vault, credential) {
  const origin = credential.origin || (credential.url ? normalizeOrigin(credential.url) : '');
  const existingIndex = vault.credentials.findIndex(item => (
    matchesOrigin(item, origin) && item.username === credential.username
  ));
  const now = new Date().toISOString();
  const updated = {
    ...credential,
    origin,
    url: credential.url || origin,
    origins: credential.origins || (origin ? [origin] : [])
  };

  if (existingIndex >= 0) {
    vault.credentials[existingIndex] = {
      ...vault.credentials[existingIndex],
      ...updated,
      id: vault.credentials[existingIndex].id,
      updatedAt: now
    };
    return vault.credentials[existingIndex];
  } else {
    const created = {
      ...updated,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    vault.credentials.push(created);
    return created;
  }
}

chrome.runtime.onMessage.addListener((rawMessage, sender, respond) => {
  let authorized;
  try {
    authorized = authorizeMessage(rawMessage, sender, chrome.runtime.id);
  } catch (error) {
    respond({ ok: false, error: error.message });
    return false;
  }

  const operation = () => handleWithAutomaticDrive(authorized.message, authorized.context);
  const isForegroundMutation = MUTATING_ACTIONS.has(authorized.message.type);
  if (isForegroundMutation && automaticSyncInFlight) {
    abortActiveDriveRequests();
  }
  const execution = isForegroundMutation
    ? enqueueMutation(operation)
    : operation();

  execution
    .then(async result => {
      const queueAutomaticSync = Boolean(result?.queueAutomaticSync);
      const publicResult = result && typeof result === 'object' ? { ...result } : {};
      delete publicResult.queueAutomaticSync;
      
      if (queueAutomaticSync) {
        try {
          await enqueueMutation(runAutomaticSync);
        } catch (error) {
          await scheduleAutomaticSyncRetry();
          console.debug('Đồng bộ nền đang chờ thử lại:', error?.message || error);
        }
      }
      respond({ ok: true, ...publicResult });
    })
    .catch(async error => {
      if (authorized.message.type === 'SAVE_QR_URI') {
        await setQrActionBadge({
          success: false,
          title: error?.message || 'Không lưu được mã OTP'
        });
      }
      respond({
        ok: false,
        error: error?.message || 'Aegis Vault gặp lỗi không xác định.',
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.syncStatus ? { syncStatus: error.syncStatus } : {})
      });
    });
  return true;
});

async function syncPendingLocalMutations(user, password) {
  const operations = await getPendingMutations(user.sub);
  if (!operations.length) return false;

  const localBeforeSync = await readVault(password, user.sub);
  const maxMergeAttempts = 3;
  for (let attempt = 0; attempt < maxMergeAttempts; attempt += 1) {
    const sync = await manualSyncVault(password, user);
    const syncState = String(sync?.status?.state || '').toLowerCase();
    const syncAction = String(sync?.action || '').toLowerCase();

    if (sync?.ok && syncAction !== 'downloaded') {
      await clearPendingMutations(user.sub);
      await clearQrSyncCoveredBy(operations);
      return true;
    }

    if (['conflict', 'staged'].includes(syncState)) {
      const adopted = await adoptStagedRemoteIfPresent(user.sub, password);
      if (!adopted) throw new Error('Chưa thể hợp nhất thay đổi local với bản Drive.');
    } else if (!sync?.ok) {
      throw new Error(sync?.error || sync?.status?.error || 'Chưa thể đồng bộ thay đổi local.');
    }

    const driveVault = await readVault(password, user.sub);
    const mergedVault = replayPendingMutations(driveVault, localBeforeSync, operations);
    const write = await writeVault(mergedVault, password, user.sub);
    if (write?.sync?.ok !== false) {
      await clearPendingMutations(user.sub);
      await clearQrSyncCoveredBy(operations);
      return true;
    }

    const writeState = String(write?.sync?.status?.state || '').toLowerCase();
    if (!['conflict', 'staged'].includes(writeState)) {
      throw new Error(
        write.sync.error
        || write.sync.status?.error
        || 'Chưa thể tải thay đổi local lên Drive.'
      );
    }
  }
  throw new Error('Drive đang thay đổi liên tục; dữ liệu vẫn an toàn trên máy và sẽ tự thử lại.');
}

async function runAutomaticSync() {
  automaticSyncInFlight = true;
  try {
    const [user, password] = await Promise.all([
      getGoogleUser(),
      getSessionPassword()
    ]);
    if (!user?.sub || !password || !await hasVault(user.sub)) return;

    await promotePendingQrSync(user, password);
    const hadPendingMutations = await syncPendingLocalMutations(user, password);
    if (hadPendingMutations) return;

    const result = await manualSyncVault(password, user);
    const state = String(result?.status?.state || '').toLowerCase();
    if (['conflict', 'staged'].includes(state)) {
      await adoptStagedRemoteIfPresent(user.sub, password);
      return;
    }
    if (!result?.ok && !['conflict', 'staged'].includes(state)) {
      throw new Error(result?.error || result?.status?.error || 'Đồng bộ tự động chưa hoàn tất.');
    }
  } finally {
    automaticSyncInFlight = false;
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm?.name === DEFERRED_QR_SYNC_ALARM) {
    void enqueueMutation(runAutomaticSync).catch(async error => {
      await scheduleDeferredQrSync(30_000);
      console.debug('Đồng bộ QR đang chờ thử lại:', error?.message || error);
    });
    return;
  }

  if (![AUTO_SYNC_ALARM, AUTO_SYNC_RETRY_ALARM].includes(alarm?.name)) return;
  void enqueueMutation(runAutomaticSync).catch(async error => {
    await scheduleAutomaticSyncRetry();
    console.debug('Đồng bộ tự động đang chờ thử lại:', error?.message || error);
  });
});

if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => { void ensureAutomaticSyncAlarm(); });
}
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => { void ensureAutomaticSyncAlarm(); });
}
void ensureAutomaticSyncAlarm();
ensureTrustedStorageAccess().catch(error => console.error('Không thể bảo vệ storage:', error));

let lastFocusSyncTime = 0;
async function triggerQuickSyncOnFocus() {
  const now = Date.now();
  if (now - lastFocusSyncTime < 4000) return;
  lastFocusSyncTime = now;
  try {
    const user = await getGoogleUser();
    const password = await getSessionPassword();
    if (user?.sub && password) {
      void enqueueMutation(runAutomaticSync).catch(() => null);
    }
  } catch {
    // Silent background sync
  }
}

if (typeof chrome.windows?.onFocusChanged?.addListener === 'function') {
  chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      void triggerQuickSyncOnFocus();
    }
  });
}

if (typeof chrome.tabs?.onActivated?.addListener === 'function') {
  chrome.tabs.onActivated.addListener(() => {
    void triggerQuickSyncOnFocus();
  });
}
