import { createEnvelope, openEnvelope, base64ToBytes } from './crypto.js';
import { findVaultFile, readVaultFile, writeVaultFile } from './gdrive.js';

const VAULT_KEY = 'aegisVault'; 
const SESSION_KEY = 'aegisSessionPassword';
const TOKEN_KEY = 'aegisGoogleToken';
const CHUNK_SIZE = 7500; // An toàn dưới giới hạn 8192 bytes của chrome.storage.sync

// Hàm hỗ trợ chia nhỏ dữ liệu để lưu vào chrome.storage.sync
async function saveToSyncStorage(key, valueObj) {
  const value = JSON.stringify(valueObj);
  const chunks = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.substring(i, i + CHUNK_SIZE));
  }
  
  const dataToSet = {
    [`${key}_chunk_count`]: chunks.length
  };
  chunks.forEach((chunk, index) => {
    dataToSet[`${key}_chunk_${index}`] = chunk;
  });
  
  // Dọn các chunk thừa cũ
  const oldInfo = await chrome.storage.sync.get(`${key}_chunk_count`);
  const oldCount = oldInfo[`${key}_chunk_count`] || 0;
  const keysToRemove = [];
  for (let i = chunks.length; i < oldCount; i++) {
    keysToRemove.push(`${key}_chunk_${i}`);
  }
  if (keysToRemove.length) {
    await chrome.storage.sync.remove(keysToRemove);
  }
  
  await chrome.storage.sync.set(dataToSet);
}

// Hàm hỗ trợ đọc dữ liệu đã chia nhỏ từ chrome.storage.sync
async function readFromSyncStorage(key) {
  const info = await chrome.storage.sync.get(`${key}_chunk_count`);
  const count = info[`${key}_chunk_count`];
  if (count === undefined) return null;
  
  const chunkKeys = [];
  for (let i = 0; i < count; i++) {
    chunkKeys.push(`${key}_chunk_${i}`);
  }
  
  const chunksData = await chrome.storage.sync.get(chunkKeys);
  let fullValue = '';
  for (let i = 0; i < count; i++) {
    const chunk = chunksData[`${key}_chunk_${i}`];
    if (chunk === undefined) return null;
    fullValue += chunk;
  }
  
  return JSON.parse(fullValue);
}

export async function hasVault(googleSub) { 
  if (!googleSub) return false;
  // 1. Kiểm tra xem vault của tài khoản này đã tồn tại chưa
  const infoSpecific = await chrome.storage.sync.get(`${VAULT_KEY}_${googleSub}_chunk_count`);
  if (infoSpecific[`${VAULT_KEY}_${googleSub}_chunk_count`] !== undefined) {
    return true;
  }
  // 2. Nếu chưa, kiểm tra xem có vault cũ (chưa chia theo tài khoản) không
  const infoOld = await chrome.storage.sync.get(`${VAULT_KEY}_chunk_count`);
  return infoOld[`${VAULT_KEY}_chunk_count`] !== undefined;
}

async function deleteOldVault() {
  const oldInfo = await chrome.storage.sync.get(`${VAULT_KEY}_chunk_count`);
  const oldCount = oldInfo[`${VAULT_KEY}_chunk_count`] || 0;
  const keysToRemove = [`${VAULT_KEY}_chunk_count`];
  for (let i = 0; i < oldCount; i++) {
    keysToRemove.push(`${VAULT_KEY}_chunk_${i}`);
  }
  await chrome.storage.sync.remove(keysToRemove);
}

export async function createVault(password, user) { 
  if (password.length < 10) throw new Error('Mật khẩu chính phải có ít nhất 10 ký tự.'); 
  const data = { 
    owner: { googleSub: user.sub, email: user.email }, 
    credentials: [], 
    excludedOrigins: [], 
    settings: { lockMinutes: 15 } 
  }; 
  await writeVault(data, password, user.sub); 
  await setSessionPassword(password, data.settings?.lockMinutes); 
  return data; 
}

export async function unlockVault(password, user) { 
  // Đồng bộ tải xuống bản mới nhất từ Google Drive nếu có trước khi giải mã
  await syncFromGDrive(user.sub).catch(err => console.error('Lỗi đồng bộ từ Google Drive:', err));

  let data;
  const specificExists = await chrome.storage.sync.get(`${VAULT_KEY}_${user.sub}_chunk_count`);
  if (specificExists[`${VAULT_KEY}_${user.sub}_chunk_count`] !== undefined) {
    data = await readVault(password, user.sub);
  } else {
    // Nếu không có vault riêng cho tài khoản, thử đọc từ vault chung cũ (và di chuyển nếu khớp)
    data = await readVault(password, null);
    if (data.owner?.googleSub && data.owner.googleSub !== user.sub) {
      throw new Error('Vault thuộc một tài khoản Google khác.'); 
    }
    // Di chuyển sang vault riêng mới và xóa vault chung cũ
    await writeVault(data, password, user.sub);
    await deleteOldVault().catch(() => null);
  }

  if (data.owner?.googleSub && data.owner.googleSub !== user.sub) {
    throw new Error('Vault thuộc một tài khoản Google khác.'); 
  }
  if (!data.owner) { 
    data.owner = { googleSub: user.sub, email: user.email }; 
    await writeVault(data, password, user.sub); 
  } 
  await setSessionPassword(password, data.settings?.lockMinutes); 
  return data; 
}

export async function readVault(password, googleSub) { 
  const key = googleSub ? `${VAULT_KEY}_${googleSub}` : VAULT_KEY;
  const envelope = await readFromSyncStorage(key); 
  if (!envelope) throw new Error('Vault chưa được tạo.'); 
  return openEnvelope(envelope, password); 
}

export async function writeVault(data, password, googleSub) { 
  const key = googleSub ? `${VAULT_KEY}_${googleSub}` : VAULT_KEY;
  const old = await readFromSyncStorage(key); 
  const salt = old ? base64ToBytes(old.kdf.salt) : undefined; 
  const envelope = await createEnvelope(data, password, salt);
  await saveToSyncStorage(key, envelope); 
  
  // Đồng bộ không đồng bộ (async) lên Google Drive
  if (googleSub) {
    syncToGDrive(googleSub, envelope).catch(err => console.error('Lỗi tải tệp lên Google Drive:', err));
  }
}

async function syncToGDrive(googleSub, envelope) {
  const tokenInfo = await chrome.storage.session.get(TOKEN_KEY);
  const token = tokenInfo[TOKEN_KEY];
  if (!token) return;

  const filename = `aegis_vault_${googleSub}.json`;
  await writeVaultFile(token, filename, envelope);
}

export async function syncFromGDrive(googleSub) {
  const tokenInfo = await chrome.storage.session.get(TOKEN_KEY);
  const token = tokenInfo[TOKEN_KEY];
  if (!token) return;

  const filename = `aegis_vault_${googleSub}.json`;
  const file = await findVaultFile(token, filename).catch(() => null);
  if (file) {
    const envelope = await readVaultFile(token, file.id).catch(() => null);
    if (envelope) {
      const localKey = `${VAULT_KEY}_${googleSub}`;
      const localEnvelope = await readFromSyncStorage(localKey);
      
      // Nếu local chưa có hoặc bản trên Drive mới hơn bản local
      if (!localEnvelope || new Date(envelope.updatedAt || 0) > new Date(localEnvelope.updatedAt || 0)) {
        await saveToSyncStorage(localKey, envelope);
      }
    }
  }
}

export async function setSessionPassword(password, lockMinutes = 15) { 
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); 
  await chrome.storage.session.set({ [SESSION_KEY]: password }); 
  await chrome.alarms.create('auto-lock', { delayInMinutes: Number(lockMinutes) || 15 }); 
}

export async function getSessionPassword() { 
  return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY]; 
}

export async function lockVault() { 
  await chrome.storage.session.remove(SESSION_KEY); 
}

export async function changeMasterPassword(currentPassword, newPassword, user) {
  if (newPassword.length < 10) throw new Error('Mật khẩu chính mới phải có ít nhất 10 ký tự.');
  let data;
  try {
    data = await readVault(currentPassword, user.sub);
  } catch (e) {
    throw new Error('Mật khẩu chính hiện tại không chính xác.');
  }
  await writeVault(data, newPassword, user.sub);
  await setSessionPassword(newPassword, data.settings?.lockMinutes);
  return data;
}

