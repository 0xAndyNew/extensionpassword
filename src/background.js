import { hasVault, createVault, unlockVault, readVault, writeVault, getSessionPassword, lockVault, changeMasterPassword, syncFromGDrive } from './vault/repository.js';
import { matchesOrigin, normalizeOrigin } from './vault/domain-policy.js';
import { parseLastPassCsv, serializeLastPassCsv } from './vault/csv.js';
import { getGoogleUser, signInWithGoogle, signOutGoogle } from './auth/google-auth.js';

chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'auto-lock') lockVault(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => { handle(message, sender).then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message })); return true; });
async function requireUser() { const user = await getGoogleUser(); if (!user) throw new Error('Hãy đăng nhập Google trước.'); return user; }
async function handle(message) {
  if (message.type === 'GOOGLE_STATUS') return { user: await getGoogleUser() };
  if (message.type === 'GOOGLE_SIGN_IN') {
    const user = await signInWithGoogle();
    await syncFromGDrive(user.sub).catch(err => console.error('Đồng bộ tải xuống từ Google Drive thất bại:', err));
    return { user };
  }
  if (message.type === 'GOOGLE_SIGN_OUT') { await lockVault(); await signOutGoogle(); return {}; }
  if (message.type === 'OPEN_OPTIONS') { chrome.runtime.openOptionsPage(); return {}; }
  const user = await requireUser();
  if (message.type === 'STATUS') return { exists: await hasVault(user.sub), unlocked: Boolean(await getSessionPassword()), user };
  if (message.type === 'CREATE') return { data: await createVault(message.password, user) };
  if (message.type === 'UNLOCK') return { data: await unlockVault(message.password, user) };
  if (message.type === 'LOCK') { await lockVault(); return {}; }
  const password = await getSessionPassword(); if (!password) throw new Error('Vault đang khóa.');
  const vault = await readVault(password, user.sub); if (vault.owner?.googleSub && vault.owner.googleSub !== user.sub) throw new Error('Vault thuộc một tài khoản Google khác.');
  if (message.type === 'LIST') return { credentials: vault.credentials.map(({ password: _, ...safe }) => safe) };
  if (message.type === 'LIST_DECRYPTED') return { credentials: vault.credentials };
  if (message.type === 'MATCH') return { credentials: vault.credentials.filter(c => matchesOrigin(c, message.origin)).map(({ password: _, ...safe }) => safe) };
  if (message.type === 'CHECK_EXISTS') { const exists = vault.credentials.some(c => matchesOrigin(c, message.origin) && c.username === message.username && c.password === message.password); return { exists }; }
  if (message.type === 'FILL') { const item = vault.credentials.find(c => c.id === message.id && matchesOrigin(c, message.origin)); if (!item) throw new Error('Tài khoản không khớp website.'); return { credential: { username: item.username, password: item.password } }; }
  if (message.type === 'SAVE') { upsert(vault, { origin: normalizeOrigin(message.origin), username: message.username, password: message.password, title: new URL(message.origin).hostname }); await writeVault(vault, password, user.sub); return {}; }
  if (message.type === 'DELETE') { vault.credentials = vault.credentials.filter(c => c.id !== message.id); await writeVault(vault, password, user.sub); return {}; }
  if (message.type === 'UPDATE_ITEM') {
    const origin = normalizeOrigin(message.url);
    const now = new Date().toISOString();
    if (message.id) {
      const item = vault.credentials.find(c => c.id === message.id);
      if (!item) throw new Error('Không tìm thấy tài khoản.');
      Object.assign(item, { title: message.title, url: message.url, origins: [origin], username: message.username, password: message.password, notes: message.notes, updatedAt: now });
    } else {
      vault.credentials.push({ id: crypto.randomUUID(), title: message.title || new URL(origin).hostname, origins: [origin], url: message.url, username: message.username, password: message.password, notes: message.notes || '', grouping: '', favorite: false, createdAt: now, updatedAt: now });
    }
    await writeVault(vault, password, user.sub); return {};
  }
  if (message.type === 'EXCLUDE_ORIGIN') { if (!vault.excludedOrigins) vault.excludedOrigins = []; if (!vault.excludedOrigins.includes(message.origin)) vault.excludedOrigins.push(message.origin); await writeVault(vault, password, user.sub); return {}; }
  if (message.type === 'INCLUDE_ORIGIN') { if (vault.excludedOrigins) vault.excludedOrigins = vault.excludedOrigins.filter(o => o !== message.origin); await writeVault(vault, password, user.sub); return {}; }
  if (message.type === 'IS_EXCLUDED') { return { excluded: Boolean(vault.excludedOrigins?.includes(message.origin)) }; }
  if (message.type === 'IMPORT_PREVIEW') {
    const preview = parseLastPassCsv(message.csv);
    return {
      preview: {
        total: preview.total,
        valid: preview.records.length,
        errors: preview.errors,
        duplicates: preview.records.filter(record => vault.credentials.some(item => item.username === record.username && matchesOrigin(item, record.origin))).length
      }
    };
  }
  if (message.type === 'IMPORT_COMMIT') {
    const parsed = parseLastPassCsv(message.csv);
    parsed.records.forEach(record => upsert(vault, record));
    await writeVault(vault, password, user.sub);
    return { imported: parsed.records.length, errors: parsed.errors };
  }
  if (message.type === 'EXPORT_CSV') {
    await readVault(message.masterPassword, user.sub);
    return { csv: serializeLastPassCsv(vault.credentials), count: vault.credentials.length };
  }
  if (message.type === 'UPDATE_LOCK_MINUTES') { 
    vault.settings = vault.settings || {}; 
    vault.settings.lockMinutes = message.minutes; 
    await writeVault(vault, password, user.sub); 
    await chrome.alarms.create('auto-lock', { delayInMinutes: Number(message.minutes) || 15 });
    return {}; 
  }
  if (message.type === 'CHANGE_PASSWORD') {
    await changeMasterPassword(message.currentPassword, message.newPassword, user);
    return {};
  }
  if (message.type === 'GET_SETTINGS') return { settings: vault.settings || { lockMinutes: 15 } };
  throw new Error('Hành động không hợp lệ.');
}
function upsert(vault, cred) {
  const origin = cred.origin || (cred.url ? normalizeOrigin(cred.url) : '');
  const existingIndex = vault.credentials.findIndex(c => matchesOrigin(c, origin) && c.username === cred.username);
  const now = new Date().toISOString();
  
  const updatedData = { 
    ...cred,
    origin,
    url: cred.url || origin,
    origins: cred.origins || (origin ? [origin] : [])
  };

  if (existingIndex > -1) {
    vault.credentials[existingIndex] = { 
      ...vault.credentials[existingIndex], 
      ...updatedData, 
      id: vault.credentials[existingIndex].id, 
      updatedAt: now 
    };
  } else {
    vault.credentials.push({ 
      ...updatedData, 
      id: crypto.randomUUID(), 
      createdAt: now, 
      updatedAt: now 
    });
  }
}
