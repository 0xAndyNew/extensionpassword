import { analyzeCredentials } from '../vault/password-security.js';
import { setSiteIcon } from './favicon.js';
import { i18nInit, setLanguage, translateDocument, t } from '../i18n.js';


const $ = id => document.getElementById(id);
let csvText = '';
let managerCredentials = [];
let managerNotes = [];
let managerCards = [];
let managerIdentities = [];
let managerTrash = [];
let activeSubTab = 'popular';
let importValidCount = 0;
let csvReadGeneration = 0;
let otpText = '';
let otpImportValidCount = 0;
let otpReadGeneration = 0;
let securityReport = analyzeCredentials([]);
let activeSecurityFilter = 'issues';
let backupImportPayload = null;
let isSignedIn = false;
let recoveryAvailable = false;
const MAX_CSV_FILE_BYTES = 8 * 1024 * 1024;
const MAX_OTP_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;

async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: error?.message || 'Không thể kết nối với Aegis Vault.' };
  }
}

function applyRecoveryStatus(value, signedIn = isSignedIn) {
  if (!signedIn) {
    recoveryAvailable = false;
    $('recoveryExportPane').classList.add('hidden');
    return;
  }
  const raw = value?.status ?? value ?? {};
  if (raw && typeof raw === 'object' && raw.recoveryAvailable !== undefined) {
    recoveryAvailable = Boolean(raw.recoveryAvailable);
  }
  $('recoveryExportPane').classList.toggle('hidden', !recoveryAvailable);
}

async function refreshSyncStatus(initialStatus) {
  if (initialStatus !== undefined) applyRecoveryStatus(initialStatus);
  if (!isSignedIn) return;
  const response = await send({ type: 'SYNC_STATUS' });
  if (response?.ok !== false) applyRecoveryStatus(response?.status ?? response);
}

function updateOptionsLangUI(lang) {
  const btn = $('optionsLangBtn');
  if (btn) btn.textContent = lang === 'en' ? '🇬🇧 EN' : '🇻🇳 VI';
  const viBtn = $('optLangViBtn');
  if (viBtn) viBtn.classList.toggle('active', lang === 'vi');
  const enBtn = $('optLangEnBtn');
  if (enBtn) enBtn.classList.toggle('active', lang === 'en');
  translateDocument();
  if (managerCredentials.length || managerNotes.length || managerCards.length || managerTrash.length) {
    renderManager();
    renderNotes();
    renderCards();
    renderTrash();
    renderSecurityCenter();
  }
}

function initOptionsLangUI() {
  const langBtn = $('optionsLangBtn');
  const langMenu = $('optionsLangMenu');
  if (langBtn && langMenu) {
    langBtn.onclick = (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('hidden');
    };

    const viBtn = $('optLangViBtn');
    if (viBtn) {
      viBtn.onclick = async (e) => {
        e.stopPropagation();
        langMenu.classList.add('hidden');
        const newLang = await setLanguage('vi');
        updateOptionsLangUI(newLang);
      };
    }

    const enBtn = $('optLangEnBtn');
    if (enBtn) {
      enBtn.onclick = async (e) => {
        e.stopPropagation();
        langMenu.classList.add('hidden');
        const newLang = await setLanguage('en');
        updateOptionsLangUI(newLang);
      };
    }

    document.addEventListener('click', () => {
      langMenu.classList.add('hidden');
    });
  }
}

async function init() {
  const currentLang = await i18nInit(updateOptionsLangUI);
  initOptionsLangUI();
  updateOptionsLangUI(currentLang);

  const status = await send({ type: 'STATUS' });
  if (status?.ok === false) {
    renderManagerError(status.error || 'Không thể kết nối tới Aegis Vault.');
    return;
  }
  isSignedIn = Boolean(status.user);
  $('topUserBtn').classList.toggle('hidden', !isSignedIn);
  applyRecoveryStatus(status.syncStatus, isSignedIn);

  if (isSignedIn) {
    updateProfileUI(status.user);
  } else {
    $('profileEmail').textContent = '';
    $('googleAvatar').textContent = '?';
  }

  if (status.unlocked) {
    await loadManager();
  } else {
    renderUnlockPrompt(status);
  }
  await refreshSyncStatus(status.syncStatus);
}

function renderUnlockPrompt(status) {
  const container = $('loginsGrid');
  if (!container) return;

  if (!isSignedIn) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; max-width: 440px; margin: 40px auto; padding: 36px; background: #ffffff; border-radius: 20px; border: 1px solid var(--apple-line); box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center;">
        <div style="font-size: 42px; margin-bottom: 12px;">🔑</div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--apple-text);">Đăng nhập để quản lý Vault</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: var(--apple-muted);">Vui lòng nhấp vào biểu tượng Aegis Vault ở thanh công cụ trình duyệt để đăng nhập Google trước khi quản lý.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="grid-column: 1/-1; max-width: 440px; margin: 40px auto; padding: 36px; background: #ffffff; border-radius: 20px; border: 1px solid var(--apple-line); box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center;">
      <div style="font-size: 42px; margin-bottom: 12px;">🔒</div>
      <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--apple-text);">Mở khóa Aegis Vault</h3>
      <p style="margin: 0 0 20px; font-size: 13px; color: var(--apple-muted);">Nhập mật khẩu chính của bạn để mở khóa tất cả tài khoản, ghi chú và thẻ thanh toán.</p>
      <div style="position: relative; margin-bottom: 16px;">
        <input id="optionsMasterPassword" type="password" placeholder="Nhập mật khẩu chính" style="width: 100%; box-sizing: border-box; padding: 12px 40px 12px 14px; border-radius: 10px; border: 1px solid var(--apple-line); outline: none; font-size: 14px;">
        <button id="toggleOptionsMasterPwd" type="button" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: 0; cursor: pointer; font-size: 16px; opacity: 0.7;">👁️</button>
      </div>
      <button id="optionsUnlockBtn" style="width: 100%; padding: 12px; border-radius: 10px; background: var(--apple-accent); color: #ffffff; border: 0; font-weight: 700; font-size: 14px; cursor: pointer;">Mở khóa Vault →</button>
      <p id="optionsUnlockError" style="margin: 12px 0 0; color: #e11d48; font-size: 12.5px; font-weight: 600;"></p>
    </div>
  `;

  const input = $('optionsMasterPassword');
  const toggleBtn = $('toggleOptionsMasterPwd');
  const unlockBtn = $('optionsUnlockBtn');
  const errorText = $('optionsUnlockError');

  if (toggleBtn && input) {
    toggleBtn.onclick = () => {
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      toggleBtn.textContent = isPwd ? '🙈' : '👁️';
    };
  }

  const handleUnlock = async () => {
    const password = input.value;
    if (!password) {
      errorText.textContent = 'Vui lòng nhập mật khẩu chính.';
      return;
    }
    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Đang mở khóa…';
    errorText.textContent = '';

    const res = await send({ type: 'UNLOCK', password });
    if (res.ok) {
      await loadManager();
      await refreshSyncStatus(res.syncStatus);
    } else {
      unlockBtn.disabled = false;
      unlockBtn.textContent = 'Mở khóa Vault →';
      errorText.textContent = res.error || 'Mật khẩu chính không đúng.';
    }
  };

  if (unlockBtn) unlockBtn.onclick = handleUnlock;
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') handleUnlock();
    };
    input.focus();
  }
}


function updateProfileUI(user) {
  const name = user.name || 'Google Account';
  const email = user.email || '';

  $('profileEmail').textContent = email || 'Google Account';
  $('identityName').textContent = name;
  $('identityEmail').textContent = email || 'Chưa có email';

  [$('googleAvatar'), $('identityAvatar')].forEach(container => {
    const fallback = name[0] || '?';
    container.textContent = fallback;
    if (!user.picture) return;
    const image = document.createElement('img');
    image.src = user.picture;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => container.textContent = fallback;
    container.replaceChildren(image);
  });
}

async function loadManager() {
  let res = await send({ type: 'LIST_ALL' });
  if (res.ok) {
    managerCredentials = res.credentials || [];
    managerNotes = res.notes || [];
    managerCards = res.cards || [];
    managerIdentities = res.identities || [];
    managerTrash = res.trash || [];
  } else {
    // Backward-compatible fallback: older service workers may not yet expose LIST_ALL.
    const legacy = await send({ type: 'LIST_DECRYPTED' });
    if (legacy.ok) {
      managerCredentials = legacy.credentials || [];
      managerNotes = [];
      managerCards = [];
      managerIdentities = [];
      managerTrash = [];
      res = legacy;
    } else {
      managerCredentials = [];
      managerNotes = [];
      managerCards = [];
      managerIdentities = [];
      managerTrash = [];
      renderManagerError(res.error || legacy.error || 'Không thể đọc dữ liệu Vault.');
      return;
    }
  }

  securityReport = analyzeCredentials(managerCredentials);
  renderManager();
  renderNotes();
  renderCards();
  renderIdentities();
  renderTrash();
  renderSecurityCenter();
}

function renderManagerError(message) {
  const container = $('loginsGrid');
  if (!container) return;
  container.innerHTML = `<div style="grid-column:1/-1; max-width:560px; margin:40px auto; padding:28px; background:#fff7f6; border:1px solid #ffd0cd; border-radius:16px; text-align:center; color:#85221c;">
    <div style="font-size:34px; margin-bottom:8px;">⚠️</div>
    <h3 style="margin:0 0 8px;">Không đọc được dữ liệu Vault</h3>
    <p style="margin:0 0 16px; font-size:13px;">${String(message).replace(/[<>&"']/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[char]))}</p>
    <button id="retryManagerBtn" type="button" style="padding:9px 18px; border:0; border-radius:8px; background:#b42318; color:#fff; font-weight:700; cursor:pointer;">Thử lại</button>
  </div>`;
  $('retryManagerBtn').onclick = () => loadManager();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getSafeWebUrl(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function renderManager() {
  const q = $('dashboardSearch').value.toLowerCase();
  let list = managerCredentials.filter(item => 
    `${item.title} ${item.username} ${item.url}`.toLowerCase().includes(q)
  );
  
  if (activeSubTab === 'az') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (activeSubTab === 'recent') {
    list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else {
    list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }

  if (!list.length) {
    $('loginsGrid').innerHTML = '<div style="grid-column:1/-1;padding:32px;color:var(--muted);text-align:center;font-size:13px">Không có tài khoản đăng nhập nào.</div>';
    return;
  }
  
  $('loginsGrid').replaceChildren(...list.map(item => {
    const card = document.createElement('div');
    card.className = 'grid-card';
    
    const icon = document.createElement('div');
    icon.className = 'card-shield';
    
    setSiteIcon(icon, item.url || item.origins?.[0]);
    
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title || 'Không tiêu đề';
    
    const user = document.createElement('div');
    user.className = 'card-user';
    user.textContent = item.username || '';
    
    const overlay = document.createElement('div');
    overlay.className = 'card-hover-overlay';
    overlay.textContent = '👁️ Click to View';
    
    card.append(icon, title, user, overlay);
    card.onclick = () => openDrawer(item);
    return card;
  }));
}

function securityLabel(level) {
  return level === 'strong' ? 'Mạnh' : level === 'medium' ? 'Trung bình' : 'Yếu';
}

function securityRecommendation(report) {
  if (!report.counts.total) return 'Chưa có tài khoản nào để phân tích. Hãy thêm mật khẩu đầu tiên vào Vault.';
  if (report.counts.weak) return `Ưu tiên thay ${report.counts.weak} mật khẩu yếu bằng mật khẩu dài và duy nhất.`;
  if (report.counts.reused) return `${report.counts.reused} tài khoản đang dùng lại mật khẩu. Hãy tạo mật khẩu riêng cho từng website.`;
  if (report.counts.medium) return `Nâng cấp ${report.counts.medium} mật khẩu trung bình lên ít nhất 12–16 ký tự.`;
  return 'Tuyệt vời! Tất cả mật khẩu đều mạnh và không bị dùng lại.';
}

function renderSecurityTable() {
  let items = [...securityReport.items];
  if (activeSecurityFilter === 'issues') items = items.filter(item => item.level !== 'strong' || item.reused);
  else if (activeSecurityFilter === 'reused') items = items.filter(item => item.reused);
  else if (activeSecurityFilter !== 'all') items = items.filter(item => item.level === activeSecurityFilter);
  items.sort((a, b) => Number(b.reused) - Number(a.reused) || a.score - b.score);

  const tbody = $('securityTableBody');
  const empty = $('securityEmpty');
  tbody.replaceChildren(...items.map(item => {
    const row = document.createElement('tr');
    const siteCell = document.createElement('td');
    const site = document.createElement('div');
    site.className = 'security-site';
    const icon = document.createElement('div');
    icon.className = 'security-site-icon';
    setSiteIcon(icon, item.url);
    const copy = document.createElement('div');
    copy.className = 'security-site-copy';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const username = document.createElement('span');
    username.textContent = item.username || 'Không có tên đăng nhập';
    copy.append(title, username);
    site.append(icon, copy);
    siteCell.append(site);

    const passwordCell = document.createElement('td');
    passwordCell.textContent = '••••••••••••';
    passwordCell.style.letterSpacing = '.12em';
    passwordCell.style.color = 'var(--apple-muted)';

    const strengthCell = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `strength-pill ${item.level}`;
    pill.textContent = `${securityLabel(item.level)} · ${item.score}`;
    strengthCell.append(pill);

    const riskCell = document.createElement('td');
    if (item.reused) {
      const reused = document.createElement('span');
      reused.className = 'reuse-badge';
      reused.textContent = '↻ Dùng lại';
      riskCell.append(reused);
    } else riskCell.textContent = '—';

    const actionCell = document.createElement('td');
    const edit = document.createElement('button');
    edit.className = 'security-edit';
    edit.textContent = 'Sửa';
    edit.onclick = () => {
      const credential = managerCredentials.find(value => value.id === item.id);
      if (credential) openDrawer(credential);
    };
    actionCell.append(edit);
    row.append(siteCell, passwordCell, strengthCell, riskCell, actionCell);
    return row;
  }));
  empty.classList.toggle('hidden', items.length > 0);
}

function renderSecurityCenter() {
  const { overallScore, counts } = securityReport;
  const color = overallScore >= 75 ? '#22a65a' : overallScore >= 45 ? '#f59e0b' : '#ef4444';
  $('securityScore').textContent = overallScore;
  $('securityScoreRing').style.setProperty('--score', overallScore);
  $('securityScoreRing').style.setProperty('--score-color', color);
  $('securityScoreLabel').textContent = overallScore >= 85 ? 'Bảo vệ rất tốt' : overallScore >= 65 ? 'Mức bảo vệ tốt' : overallScore >= 40 ? 'Cần cải thiện' : 'Rủi ro cao';
  $('strongCount').textContent = counts.strong;
  $('mediumCount').textContent = counts.medium;
  $('weakCount').textContent = counts.weak;
  $('reusedCount').textContent = counts.reused;
  const denominator = counts.total || 1;
  $('distWeak').style.width = `${counts.weak / denominator * 100}%`;
  $('distMedium').style.width = `${counts.medium / denominator * 100}%`;
  $('distStrong').style.width = `${counts.strong / denominator * 100}%`;
  $('securityRecommendation').textContent = securityRecommendation(securityReport);
  renderSecurityTable();
}

// Drawer Controller
function openDrawer(item = null) {
  $('overlay').classList.add('open');
  $('drawer').classList.add('open');
  if ($('loginSaveResult')) $('loginSaveResult').textContent = '';
  $('editPassword').type = 'password';
  $('togglePassword').textContent = 'Show';
  
  if (item) {
    $('drawerTitle').textContent = item.title || 'Không tiêu đề';
    $('editId').value = item.id;
    $('editTitle').value = item.title || '';
    $('editUrl').value = item.url || '';
    $('editMatchUrl').value = item.origins?.[0] || 'Khớp tên miền mặc định';
    $('editUsername').value = item.username || '';
    $('editPassword').value = item.password || '';
    $('editNotes').value = item.notes || '';
    
    setSiteIcon($('drawerLogo'), item.url);
    $('deleteBtn').classList.remove('hidden');

    if (Array.isArray(item.passwordHistory) && item.passwordHistory.length > 0) {
      $('pwdHistoryWrapper').classList.remove('hidden');
      $('pwdHistoryList').replaceChildren(...item.passwordHistory.map((ph) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:11px; padding:4px 8px; background:#ffffff; border-radius:6px; border:1px solid var(--apple-line);';
        const pwd = document.createElement('code');
        pwd.style.fontFamily = 'monospace';
        pwd.textContent = ph.password;
        const date = document.createElement('span');
        date.style.color = 'var(--apple-muted)';
        date.style.fontSize = '10px';
        date.textContent = new Date(ph.changedAt).toLocaleDateString();
        row.append(pwd, date);
        return row;
      }));
    } else {
      $('pwdHistoryWrapper').classList.add('hidden');
    }
  } else {
    $('drawerTitle').textContent = 'Thêm tài khoản';
    $('editId').value = '';
    $('editTitle').value = '';
    $('editUrl').value = '';
    $('editMatchUrl').value = 'Tự động tạo từ link đăng nhập';
    $('editUsername').value = '';
    $('editPassword').value = '';
    $('editNotes').value = '';
    $('drawerLogo').textContent = '🔒';
    $('deleteBtn').classList.add('hidden');
    $('pwdHistoryWrapper').classList.add('hidden');
  }
}

function closeDrawer() {
  $('overlay').classList.remove('open');
  $('drawer').classList.remove('open');
  if ($('loginSaveResult')) $('loginSaveResult').textContent = '';
  if ($('noteSaveResult')) $('noteSaveResult').textContent = '';
  if ($('cardSaveResult')) $('cardSaveResult').textContent = '';
  if ($('noteDrawer')) $('noteDrawer').classList.remove('open');
  if ($('cardDrawer')) $('cardDrawer').classList.remove('open');
}

$('overlay').onclick = closeDrawer;
$('drawerCancel').onclick = closeDrawer;

$('togglePassword').onclick = () => {
  const input = $('editPassword');
  if (input.type === 'password') {
    input.type = 'text';
    $('togglePassword').textContent = 'Hide';
  } else {
    input.type = 'password';
    $('togglePassword').textContent = 'Show';
  }
};

$('openUrlBtn').onclick = () => {
  const url = getSafeWebUrl($('editUrl').value);
  if (!url) return alert('Website phải là một địa chỉ HTTP hoặc HTTPS hợp lệ.');
  window.open(url, '_blank', 'noopener,noreferrer');
};

$('drawerSave').onclick = async () => {
  const id = $('editId').value;
  const title = $('editTitle').value.trim();
  const url = $('editUrl').value.trim();
  const username = $('editUsername').value.trim();
  const password = $('editPassword').value;
  const notes = $('editNotes').value;
  const favorite = editingId
    ? Boolean(managerCredentials.find(item => item.id === editingId)?.favorite)
    : false;
  const status = $('loginSaveResult');
  if (!url || !username || !password) {
    status.style.color = '#e11d48';
    status.textContent = 'Vui lòng điền Website, Tên đăng nhập và Mật khẩu.';
    return;
  }
  status.style.color = '#6b7280';
  status.textContent = 'Đang lưu…';
  const res = await send({ type: 'UPDATE_ITEM', id, title, url, username, password, notes, favorite });
  if (res.ok) {
    status.style.color = '#22a65a';
    status.textContent = '✓ Đã lưu thông tin tài khoản thành công.';
    await loadManager();
    await refreshSyncStatus(res.syncStatus);
    setTimeout(closeDrawer, 500);
  } else {
    status.style.color = '#e11d48';
    status.textContent = `Không thể lưu: ${res.error || 'Lỗi không xác định.'}`;
  }
};

$('deleteBtn').onclick = async () => {
  const id = $('editId').value;
  const status = $('loginSaveResult');
  if (!id) return;
  if (await confirmDelete('Bạn có đồng ý xóa thông tin tài khoản này không?')) {
    status.style.color = '#6b7280';
    status.textContent = 'Đang xóa…';
    const res = await send({ type: 'DELETE', id });
    if (res.ok) {
      status.style.color = '#22a65a';
      status.textContent = '✓ Đã xóa tài khoản.';
      await loadManager();
      await refreshSyncStatus(res.syncStatus);
      setTimeout(closeDrawer, 500);
    } else {
      status.style.color = '#e11d48';
      status.textContent = `Không thể xóa: ${res.error || 'Lỗi không xác định.'}`;
    }
  }
};

function renderNotes() {
  const container = $('notesGrid');
  if (!container) return;
  if (!managerNotes.length) {
    container.innerHTML = '<div style="grid-column:1/-1;padding:32px;color:var(--apple-muted);text-align:center;font-size:13px" data-i18n="noNotesMsg">Chưa có ghi chú bảo mật nào.</div>';
    return;
  }

  container.replaceChildren(...managerNotes.map(item => {
    const card = document.createElement('article');
    card.className = 'vault-item-card note-item-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Xem ghi chú ${item.title || 'không tiêu đề'}`);
    card.onclick = () => openNoteDetail(item);
    card.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openNoteDetail(item);
      }
    };

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; gap:10px;';
    const icon = document.createElement('div');
    icon.style.cssText = 'width:34px;height:34px;border-radius:9px;background:#fff7db;display:grid;place-items:center;flex:0 0 34px;';
    icon.textContent = '📝';
    const title = document.createElement('strong');
    title.style.cssText = 'font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    title.textContent = item.title || 'Ghi chú mới';
    header.append(icon, title);

    const body = document.createElement('p');
    body.className = 'note-private-preview';
    body.setAttribute('aria-label', 'Nội dung ghi chú đang được ẩn');
    body.textContent = '••••••••••••••••';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:auto;';
    const editBtn = document.createElement('button');
    editBtn.className = 'item-action-btn';
    editBtn.textContent = 'Sửa';
    editBtn.onclick = event => {
      event.stopPropagation();
      openNoteDrawer(item);
    };
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'item-action-btn danger';
    deleteBtn.textContent = 'Xóa';
    deleteBtn.onclick = async event => {
      event.stopPropagation();
      if (!await confirmDelete('Bạn có đồng ý xóa ghi chú này không?')) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Đang xóa…';
      const res = await send({ type: 'DELETE_NOTE', id: item.id });
      if (res.ok) {
        await loadManager();
        await refreshSyncStatus(res.syncStatus);
      } else {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Xóa';
        alert(res.error);
      }
    };
    actions.append(editBtn, deleteBtn);
    card.append(header, body, actions);
    return card;
  }));
}

function openNoteDetail(item) {
  const modal = $('noteDetailModal');
  if (!modal) return;
  $('noteDetailTitle').textContent = item.title || 'GHI CHÚ';
  $('noteDetailContent').textContent = item.notes || 'Không có nội dung.';
  modal.classList.remove('hidden');
  $('noteDetailCopy').onclick = async () => {
    await navigator.clipboard.writeText(item.notes || '');
    $('noteDetailCopy').textContent = '✓ Đã sao chép';
    setTimeout(() => { $('noteDetailCopy').textContent = '📋 Sao chép nội dung'; }, 1500);
  };
}

function closeNoteDetail() {
  if ($('noteDetailModal')) $('noteDetailModal').classList.add('hidden');
}

if ($('noteDetailClose')) $('noteDetailClose').onclick = closeNoteDetail;
if ($('noteDetailModal')) $('noteDetailModal').onclick = event => {
  if (event.target === $('noteDetailModal')) closeNoteDetail();
};

function openNoteDrawer(item = null) {
  $('overlay').classList.add('open');
  $('noteDrawer').classList.add('open');
  if ($('noteSaveResult')) $('noteSaveResult').textContent = '';
  if (item) {
    $('noteDrawerTitle').textContent = 'Sửa ghi chú bảo mật';
    $('editNoteId').value = item.id;
    $('editNoteTitle').value = item.title || '';
    $('editNoteContent').value = item.notes || '';
  } else {
    $('noteDrawerTitle').textContent = 'Thêm ghi chú bảo mật';
    $('editNoteId').value = '';
    $('editNoteTitle').value = '';
    $('editNoteContent').value = '';
  }
}

function closeNoteDrawer() {
  $('overlay').classList.remove('open');
  $('noteDrawer').classList.remove('open');
  if ($('noteSaveResult')) $('noteSaveResult').textContent = '';
}

if ($('noteDrawerSave')) {
  $('noteDrawerSave').onclick = async () => {
    const id = $('editNoteId').value;
    const title = $('editNoteTitle').value.trim();
    const notes = $('editNoteContent').value.trim();
    const status = $('noteSaveResult');
    if (!title && !notes) {
      status.style.color = '#e11d48';
      status.textContent = 'Vui lòng nhập tiêu đề hoặc nội dung ghi chú.';
      return;
    }
    status.style.color = '#6b7280';
    status.textContent = 'Đang lưu…';
    const res = await send({ type: 'SAVE_NOTE', id, title: title || 'Ghi chú mới', notes, favorite: false });
    if (res.ok) {
      status.style.color = '#22a65a';
      status.textContent = '✓ Đã lưu ghi chú thành công.';
      await loadManager();
      await refreshSyncStatus(res.syncStatus);
      setTimeout(closeNoteDrawer, 500);
    } else {
      status.style.color = '#e11d48';
      status.textContent = `Không thể lưu: ${res.error || 'Lỗi không xác định.'}`;
    }
  };
}

if ($('addNoteBtn')) {
  $('addNoteBtn').onclick = () => openNoteDrawer(null);
}

function renderCards() {
  const container = $('cardsGrid');
  if (!container) return;
  if (!managerCards.length) {
    container.innerHTML = '<div style="grid-column:1/-1;padding:32px;color:var(--apple-muted);text-align:center;font-size:13px" data-i18n="noCardsMsg">Chưa có thẻ thanh toán nào.</div>';
    return;
  }

  container.replaceChildren(...managerCards.map(item => {
    const card = document.createElement('article');
    card.className = 'vault-item-card payment-item-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Xem thẻ ${item.title || 'thanh toán'}`);
    card.onclick = () => openCardDetail(item);
    card.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCardDetail(item);
      }
    };

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; font-size:14px; color:#f8fafc; word-break:break-all;';
    title.textContent = item.title || 'Thẻ ATM / Credit';

    const brandIcon = document.createElement('div');
    brandIcon.style.cssText = 'font-size:20px;';
    brandIcon.textContent = '💳';

    header.append(title, brandIcon);

    const num = document.createElement('div');
    num.style.cssText = 'font-family:monospace; font-size:15px; letter-spacing:2px; color:#38bdf8; font-weight:700;';
    const rawNum = String(item.cardNumber || '').replace(/\D/g, '');
    const masked = rawNum ? `•••• •••• •••• ${rawNum.slice(-4)}` : '•••• •••• •••• ••••';
    num.textContent = masked;

    const meta = document.createElement('div');
    meta.style.cssText = 'display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;';
    meta.innerHTML = `<span>Chủ thẻ: <strong style="color:#e2e8f0">${item.cardholderName || '—'}</strong></span><span>Hạn: <strong style="color:#e2e8f0">${item.expMonth || '--'}/${item.expYear || '--'}</strong></span>`;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:8px; margin-top:4px;';

    const copyNumBtn = document.createElement('button');
    copyNumBtn.style.cssText = 'flex:1; padding:6px; border-radius:6px; border:0; background:rgba(255,255,255,0.15); color:#fff; font-size:11px; font-weight:600; cursor:pointer;';
    copyNumBtn.textContent = '📋 Copy số thẻ';
    copyNumBtn.onclick = event => {
      event.stopPropagation();
      navigator.clipboard.writeText(rawNum);
      copyNumBtn.textContent = '✓ Đã copy';
      setTimeout(() => { copyNumBtn.textContent = '📋 Sao chép'; }, 1500);
    };

    const editBtn = document.createElement('button');
    editBtn.className = 'item-action-btn dark';
    editBtn.textContent = 'Sửa';
    editBtn.onclick = event => {
      event.stopPropagation();
      openCardDrawer(item);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'item-action-btn danger-dark';
    deleteBtn.textContent = 'Xóa';
    deleteBtn.onclick = async event => {
      event.stopPropagation();
      if (!await confirmDelete('Bạn có đồng ý xóa thẻ thanh toán này không?')) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Đang xóa…';
      const res = await send({ type: 'DELETE_CARD', id: item.id });
      if (res.ok) {
        await loadManager();
        await refreshSyncStatus(res.syncStatus);
      } else {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Xóa';
        alert(res.error);
      }
    };

    actions.append(copyNumBtn, editBtn, deleteBtn);
    card.append(header, num, meta, actions);
    return card;
  }));
}

function openCardDetail(item) {
  const modal = $('cardDetailModal');
  if (!modal) return;
  const rawNumber = String(item.cardNumber || '').replace(/\s+/g, '');
  const rawCvv = String(item.cvv || '');
  $('cardDetailTitle').textContent = item.title || 'NGÂN HÀNG';
  $('cardDetailNumber').textContent = rawNumber.replace(/(.{4})/g, '$1 ').trim() || '•••• •••• •••• ••••';
  $('cardDetailHolder').textContent = item.cardholderName || '—';
  $('cardDetailExpiry').textContent = `${item.expMonth || '--'}/${item.expYear || '--'}`;
  $('cardDetailCvv').textContent = '•'.repeat(Math.max(rawCvv.length, 3));
  $('cardDetailCvvToggle').setAttribute('aria-pressed', 'false');
  $('cardDetailCvvToggle').onclick = event => {
    event.stopPropagation();
    const visible = $('cardDetailCvvToggle').getAttribute('aria-pressed') === 'true';
    $('cardDetailCvv').textContent = visible ? '•'.repeat(Math.max(rawCvv.length, 3)) : (rawCvv || '—');
    $('cardDetailCvvToggle').setAttribute('aria-pressed', String(!visible));
    $('cardDetailCvvToggle').setAttribute('aria-label', visible ? 'Hiện mã CVV' : 'Ẩn mã CVV');
  };
  const bindCopy = (buttonId, value) => {
    const button = $(buttonId);
    if (!button) return;
    button.onclick = async event => {
      event.stopPropagation();
      await navigator.clipboard.writeText(String(value || ''));
      button.classList.add('copied');
      button.setAttribute('aria-label', 'Đã sao chép');
      setTimeout(() => {
        button.classList.remove('copied');
        button.setAttribute('aria-label', button.title || 'Sao chép');
      }, 1400);
    };
  };
  bindCopy('copyCardNumber', rawNumber);
  bindCopy('copyCardHolder', item.cardholderName || '');
  bindCopy('copyCardExpiry', `${item.expMonth || ''}/${item.expYear || ''}`);
  bindCopy('copyCardCvv', rawCvv);
  modal.classList.remove('hidden');
}

function closeCardDetail() {
  if ($('cardDetailModal')) $('cardDetailModal').classList.add('hidden');
}

if ($('cardDetailClose')) $('cardDetailClose').onclick = closeCardDetail;
if ($('cardDetailModal')) $('cardDetailModal').onclick = event => {
  if (event.target === $('cardDetailModal')) closeCardDetail();
};

function openCardDrawer(item = null) {
  $('overlay').classList.add('open');
  $('cardDrawer').classList.add('open');
  if ($('cardSaveResult')) $('cardSaveResult').textContent = '';
  $('editCardCvv').type = 'password';
  $('toggleCardCvv').setAttribute('aria-pressed', 'false');
  $('toggleCardCvv').setAttribute('aria-label', 'Hiện mã CVV');
  if (item) {
    $('cardDrawerTitle').textContent = 'Sửa thẻ thanh toán';
    $('editCardId').value = item.id;
    $('editCardTitle').value = item.title || '';
    $('editCardName').value = item.cardholderName || '';
    $('editCardNumber').value = item.cardNumber || '';
    $('editCardExpMonth').value = item.expMonth || '';
    $('editCardExpYear').value = item.expYear || '';
    $('editCardCvv').value = item.cvv || '';
  } else {
    $('cardDrawerTitle').textContent = 'Thêm thẻ thanh toán';
    $('editCardId').value = '';
    $('editCardTitle').value = '';
    $('editCardName').value = '';
    $('editCardNumber').value = '';
    $('editCardExpMonth').value = '';
    $('editCardExpYear').value = '';
    $('editCardCvv').value = '';
  }
}

function closeCardDrawer() {
  $('overlay').classList.remove('open');
  $('cardDrawer').classList.remove('open');
  if ($('cardSaveResult')) $('cardSaveResult').textContent = '';
}

if ($('cardDrawerCancel')) $('cardDrawerCancel').onclick = closeCardDrawer;
if ($('toggleCardCvv')) $('toggleCardCvv').onclick = () => {
  const field = $('editCardCvv');
  const button = $('toggleCardCvv');
  const visible = field.type === 'text';
  field.type = visible ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!visible));
  button.setAttribute('aria-label', visible ? 'Hiện mã CVV' : 'Ẩn mã CVV');
};
if ($('cardDrawerSave')) {
  $('cardDrawerSave').onclick = async () => {
    const id = $('editCardId').value;
    const title = $('editCardTitle').value.trim();
    const cardholderName = $('editCardName').value.trim();
    const cardNumber = $('editCardNumber').value.trim();
    const expMonth = $('editCardExpMonth').value.trim();
    const expYear = $('editCardExpYear').value.trim();
    const cvv = $('editCardCvv').value.trim();
    const status = $('cardSaveResult');
    if (!cardNumber) {
      status.style.color = '#e11d48';
      status.textContent = 'Vui lòng nhập số thẻ.';
      return;
    }
    status.style.color = '#6b7280';
    status.textContent = 'Đang lưu…';
    const res = await send({ type: 'SAVE_CARD', id, title: title || 'Thẻ ATM', cardholderName, cardNumber, expMonth, expYear, cvv, favorite: false });
    if (res.ok) {
      status.style.color = '#22a65a';
      status.textContent = '✓ Đã lưu thẻ thành công.';
      await loadManager();
      await refreshSyncStatus(res.syncStatus);
      setTimeout(closeCardDrawer, 500);
    } else {
      status.style.color = '#e11d48';
      status.textContent = `Không thể lưu: ${res.error || 'Lỗi không xác định.'}`;
    }
  };
}

if ($('addCardBtn')) {
  $('addCardBtn').onclick = () => openCardDrawer(null);
}

function renderIdentities() {
  // Personal identity data remains in the Vault for compatibility, but its editor UI was intentionally removed.
}

function renderTrash() {
  const container = $('trashGrid');
  if (!container) return;
  if (!managerTrash.length) {
    container.innerHTML = '<div class="trash-empty" data-i18n="noTrashMsg">Thùng rác rỗng.</div>';
    return;
  }

  container.replaceChildren(...managerTrash.map(item => {
    const original = item.originalItem || {};
    const type = String(item.itemType || 'item').toLowerCase();
    const card = document.createElement('article');
    card.className = `trash-item trash-${type}`;

    const date = document.createElement('span');
    date.className = 'trash-date';
    date.textContent = `Đã xóa ${new Date(item.deletedAt).toLocaleDateString('vi-VN')}`;

    const content = document.createElement('div');
    content.className = 'trash-content';
    if (type === 'card') {
      const digits = String(original.cardNumber || '').replace(/\D/g, '');
      content.innerHTML = `<div class="trash-card-top"><strong>${escapeHtml(original.title || 'NGÂN HÀNG')}</strong><span>💳</span></div><div class="trash-card-number">•••• •••• •••• ${escapeHtml(digits.slice(-4) || '••••')}</div><div class="trash-card-meta"><span>${escapeHtml(original.cardholderName || '—')}</span><span>${escapeHtml(original.expMonth || '--')}/${escapeHtml(original.expYear || '--')}</span></div>`;
    } else if (type === 'note') {
      content.innerHTML = `<div class="trash-note-title"><span>📝</span><strong>${escapeHtml(original.title || 'GHI CHÚ')}</strong></div><p class="trash-private-note">••••••••••••••••</p>`;
    } else {
      const title = original.title || original.username || original.account || 'Không tiêu đề';
      const detail = original.username || original.url || original.issuer || '';
      content.innerHTML = `<div class="trash-login-title"><span>${type === 'otp' ? '⏱️' : '🔑'}</span><strong>${escapeHtml(title)}</strong></div><p>${escapeHtml(detail)}</p>`;
    }

    const actions = document.createElement('div');
    actions.className = 'trash-actions';
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'trash-restore';
    restoreBtn.textContent = 'Khôi phục';
    restoreBtn.onclick = async () => {
      const accepted = await confirmAction({
        title: 'Khôi phục thông tin?',
        message: `Bạn có đồng ý khôi phục ${trashTypeLabel(type)} này không?`,
        acceptText: 'Đồng ý khôi phục',
        cancelText: 'Không khôi phục',
        tone: 'restore'
      });
      if (!accepted) return;
      restoreBtn.disabled = true;
      restoreBtn.textContent = 'Đang khôi phục…';
      const res = await send({ type: 'RESTORE_TRASH', id: item.id });
      if (res.ok) {
        await loadManager();
        await refreshSyncStatus(res.syncStatus);
      } else {
        restoreBtn.disabled = false;
        restoreBtn.textContent = 'Khôi phục';
        alert(res.error);
      }
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'trash-delete';
    deleteBtn.textContent = 'Xóa vĩnh viễn';
    deleteBtn.onclick = async () => {
      const accepted = await confirmAction({
        title: 'Xóa vĩnh viễn?',
        message: `Dữ liệu ${trashTypeLabel(type)} sẽ không thể khôi phục sau khi xóa.`,
        acceptText: 'Đồng ý xóa',
        cancelText: 'Không xóa',
        tone: 'delete'
      });
      if (!accepted) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Đang xóa…';
      const res = await send({ type: 'DELETE_PERMANENTLY', id: item.id });
      if (res.ok) {
        await loadManager();
        await refreshSyncStatus(res.syncStatus);
      } else {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Xóa vĩnh viễn';
        alert(res.error);
      }
    };
    actions.append(restoreBtn, deleteBtn);
    card.append(date, content, actions);
    return card;
  }));
}

function trashTypeLabel(type) {
  return ({ card: 'thẻ thanh toán', note: 'ghi chú', credential: 'tài khoản', login: 'tài khoản', otp: 'mã OTP' })[type] || 'thông tin';
}

if ($('emptyTrashBtn')) {
  $('emptyTrashBtn').onclick = async () => {
    if (!managerTrash.length) return;
    if (confirm(t('emptyTrashConfirm', 'Bạn có chắc chắn muốn xóa vĩnh viễn tất cả mục trong thùng rác không?'))) {
      const res = await send({ type: 'EMPTY_TRASH' });
      if (res.ok) {
        await loadManager();
        await refreshSyncStatus(res.syncStatus);
      } else {
        alert(res.error);
      }
    }
  };
}

// Sidebar Navigation
const sections = {
  menuLogins: $('loginsSection'),
  menuNotes: $('notesSection'),
  menuCards: $('cardsSection'),
  menuIdentity: $('identitySection'),
  menuSecurity: $('securitySection'),
  menuTrash: $('trashSection'),
  menuSettings: $('settingsSection')
};

let currentActiveMenu = 'menuLogins';

$('addBtn').onclick = () => {
  if (currentActiveMenu === 'menuNotes') openNoteDrawer(null);
  else if (currentActiveMenu === 'menuCards') openCardDrawer(null);
  else openDrawer(null);
};

Object.keys(sections).forEach(menuId => {
  $(menuId).onclick = () => {
    currentActiveMenu = menuId;
    Object.keys(sections).forEach(id => {
      $(id).classList.remove('active');
      sections[id].classList.add('hidden');
    });
    $(menuId).classList.add('active');
    sections[menuId].classList.remove('hidden');
    
    if (['menuLogins', 'menuNotes', 'menuCards'].includes(menuId)) {
      $('addBtn').classList.remove('hidden');
      if (menuId === 'menuLogins') $('subTabsBar').classList.remove('hidden');
      else $('subTabsBar').classList.add('hidden');
    } else {
      $('addBtn').classList.add('hidden');
      $('subTabsBar').classList.add('hidden');
    }
  };
});

// Search input
$('dashboardSearch').oninput = renderManager;

// Sub Tabs popular/recent/az
const subTabs = [...$('subTabsBar').children];
subTabs.forEach(tab => {
  tab.onclick = () => {
    subTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeSubTab = tab.dataset.tab;
    renderManager();
  };
});

[...$('securityFilters').querySelectorAll('.security-filter')].forEach(button => {
  button.onclick = () => {
    [...$('securityFilters').querySelectorAll('.security-filter')].forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeSecurityFilter = button.dataset.securityFilter;
    renderSecurityTable();
  };
});

const settingsToolSelect = $('settingsToolSelect');
if (settingsToolSelect) {
  settingsToolSelect.onchange = () => {
    const selectedTool = settingsToolSelect.value;
    document.querySelectorAll('.settings-tool-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.settingsTool !== selectedTool);
    });
  };
}

// CSV Import & Export logic
$('csvFile').onchange = async event => {
  const generation = ++csvReadGeneration;
  const file = event.target.files?.[0];
  csvText = '';
  importValidCount = 0;
  $('importButton').disabled = true;
  $('importResult').textContent = '';
  if (!file) {
    $('csvFileName').textContent = 'Chưa chọn tệp';
    return;
  }
  if (file.size > MAX_CSV_FILE_BYTES) {
    $('csvFileName').textContent = `${file.name} · quá lớn`;
    $('importResult').style.color = '#e11d48';
    $('importResult').textContent = 'Tệp CSV vượt quá giới hạn 8 MiB. Hãy chọn tệp nhỏ hơn.';
    event.target.value = '';
    return;
  }
  $('csvFileName').textContent = `${file.name} · đang kiểm tra…`;
  try {
    const text = await file.text();
    if (generation !== csvReadGeneration) return;
    if (!text.trim()) throw new Error('Tệp CSV đang trống.');
    const response = await send({ type: 'IMPORT_PREVIEW', csv: text });
    if (response?.ok === false) throw new Error(response.error || 'Tệp CSV không hợp lệ.');
    csvText = text;
    importValidCount = response.preview?.valid || 0;
    $('csvFileName').textContent = file.name;
    $('importButton').disabled = importValidCount === 0;
    $('importResult').style.color = importValidCount ? 'var(--apple-green)' : '#e11d48';
    $('importResult').textContent = importValidCount
      ? `Đã kiểm tra: ${importValidCount} tài khoản hợp lệ, ${response.preview?.duplicates || 0} mục trùng.`
      : 'Tệp CSV không có tài khoản hợp lệ để nhập.';
  } catch (error) {
    if (generation !== csvReadGeneration) return;
    csvText = '';
    $('csvFileName').textContent = `${file.name} · không hợp lệ`;
    $('importResult').style.color = '#e11d48';
    $('importResult').textContent = error?.message || 'Không thể đọc tệp CSV.';
    event.target.value = '';
  }
};

$('importButton').onclick = async () => {
  if (!csvText || !importValidCount) return;
  const accepted = await confirmAction({
    title: 'Nhập dữ liệu CSV?',
    message: `Bạn có đồng ý nhập ${importValidCount} tài khoản hợp lệ vào Vault không?`,
    acceptText: 'Đồng ý nhập CSV',
    cancelText: 'Không nhập',
    tone: 'restore'
  });
  if (!accepted) return;
  const button = $('importButton');
  const result = $('importResult');
  button.disabled = true;
  button.textContent = 'Đang nhập…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = `Đang mã hóa và nhập ${importValidCount} tài khoản…`;
  try {
    const response = await send({ type: 'IMPORT_COMMIT', csv: csvText });
    if (response?.ok === false) throw new Error(response.error || 'Không thể nhập CSV.');
    result.style.color = 'var(--apple-green)';
    result.textContent = `Đã nhập/cập nhật ${response.imported ?? 0} tài khoản.`;
    $('csvFile').value = '';
    $('csvFileName').textContent = 'Chưa chọn tệp';
    csvText = '';
    importValidCount = 0;
    await loadManager();
    await refreshSyncStatus(response?.syncStatus);
  } catch (error) {
    result.style.color = '#e11d48';
    result.textContent = `Không thể nhập CSV: ${error?.message || 'Lỗi không xác định.'}`;
  } finally {
    button.textContent = 'Nhập CSV';
    button.disabled = !csvText;
  }
};

$('exportButton').onclick = async () => {
  const password = $('exportPassword').value;
  const result = $('exportResult');
  const button = $('exportButton');
  result.style.color = '#e11d48';
  result.textContent = '';
  if (!password) {
    result.textContent = 'Nhập mật khẩu chính để xuất CSV.';
    $('exportPassword').focus();
    return;
  }
  const accepted = await confirmAction({
    title: 'Xuất dữ liệu CSV?',
    message: 'CSV chứa mật khẩu dạng rõ. Chỉ dùng tệp để chuyển sang password manager và không mở bằng ứng dụng bảng tính.',
    acceptText: 'Đồng ý xuất CSV',
    cancelText: 'Không xuất',
    tone: 'restore'
  });
  if (!accepted) return;
  button.disabled = true;
  button.textContent = 'Đang xuất…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang xác minh và chuẩn bị tệp CSV…';
  try {
    const response = await send({ type: 'EXPORT_CSV', masterPassword: password });
    if (response?.ok === false || typeof response?.csv !== 'string') {
      throw new Error(response?.error || 'Không thể xuất tệp CSV.');
    }
    await downloadText(response.csv, `aegis-vault-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
    result.style.color = 'var(--apple-green)';
    result.textContent = `Đã xuất ${response.count ?? 0} tài khoản.`;
    $('exportPassword').value = '';
  } catch (error) {
    result.style.color = '#e11d48';
    result.textContent = `Không thể xuất CSV: ${error?.message || 'Lỗi không xác định.'}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Xuất CSV';
  }
};
function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function confirmAction({
  title = 'Xác nhận thao tác?',
  message = 'Bạn có muốn tiếp tục không?',
  acceptText = 'Đồng ý',
  cancelText = 'Hủy',
  tone = 'delete'
} = {}) {
  return new Promise(resolve => {
    const modal = $('deleteConfirmModal');
    const titleNode = $('deleteConfirmTitle');
    const messageNode = $('deleteConfirmMessage');
    const iconNode = modal?.querySelector('.confirm-icon');
    const cancelBtn = $('deleteConfirmCancel');
    const acceptBtn = $('deleteConfirmAccept');
    if (!modal || !cancelBtn || !acceptBtn) {
      resolve(false);
      return;
    }
    titleNode.textContent = title;
    messageNode.textContent = message;
    cancelBtn.textContent = cancelText;
    acceptBtn.textContent = acceptText;
    iconNode.textContent = tone === 'restore' ? '↻' : '🗑️';
    modal.dataset.tone = tone;
    modal.classList.remove('hidden');
    const finish = accepted => {
      modal.classList.add('hidden');
      cancelBtn.onclick = null;
      acceptBtn.onclick = null;
      modal.onclick = null;
      resolve(accepted);
    };
    cancelBtn.onclick = () => finish(false);
    acceptBtn.onclick = () => finish(true);
    modal.onclick = event => {
      if (event.target === modal) finish(false);
    };
    cancelBtn.focus();
  });
}

function confirmDelete(message = 'Bạn có đồng ý xóa thông tin này không?') {
  return confirmAction({ title: 'Xóa thông tin?', message, acceptText: 'Đồng ý xóa', cancelText: 'Không xóa', tone: 'delete' });
}
function dateStamp(){return new Date().toISOString().slice(0,10);}
async function downloadText(text, name, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    if (!chrome.downloads?.download) {
      throw new Error('Aegis chưa được cấp quyền tải tệp. Hãy tải lại extension.');
    }
    await chrome.downloads.download({
      url,
      filename: name,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

function formatBackupCounts(counts) {
  if (typeof counts === 'number') return `${counts} mục`;
  if (!counts || typeof counts !== 'object') return 'dữ liệu';
  const credentials = counts.credentials ?? counts.logins ?? counts.items ?? 0;
  const otp = counts.otpAccounts ?? counts.otp ?? 0;
  return `${credentials} tài khoản và ${otp} mã OTP`;
}

$('backupExportButton').onclick = async () => {
  const password = $('backupExportPassword').value;
  const result = $('backupExportResult');
  if (!password) {
    result.textContent = 'Nhập mật khẩu chính để tạo backup.';
    result.style.color = '#e11d48';
    return;
  }

  const button = $('backupExportButton');
  button.disabled = true;
  button.textContent = 'Đang tạo…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang tạo bản backup mã hóa cục bộ…';
  const response = await send({ type: 'EXPORT_ENCRYPTED_BACKUP', masterPassword: password });
  button.disabled = false;
  button.textContent = 'Tải backup';

  if (response?.ok === false || response?.backup === undefined) {
    result.style.color = '#e11d48';
    result.textContent = response?.error || 'Không thể tạo backup.';
    return;
  }

  const text = typeof response.backup === 'string'
    ? response.backup
    : JSON.stringify(response.backup, null, 2);
  await downloadText(text, `aegis-vault-backup-${dateStamp()}.json`, 'application/json;charset=utf-8');
  result.style.color = 'var(--apple-green)';
  result.textContent = `Đã tải backup gồm ${formatBackupCounts(response.counts)}.`;
  $('backupExportPassword').value = '';
};

$('recoveryExportButton').onclick = async () => {
  const button = $('recoveryExportButton');
  const result = $('recoveryExportResult');
  button.disabled = true;
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang chuẩn bị bản local cũ đã mã hóa…';
  const response = await send({ type: 'EXPORT_PRE_CLOUD_RECOVERY' });
  button.disabled = false;
  if (response?.ok === false || response?.backup === undefined) {
    result.style.color = '#e11d48';
    result.textContent = response?.error || 'Không tìm thấy bản local cũ.';
    return;
  }
  const text = typeof response.backup === 'string'
    ? response.backup
    : JSON.stringify(response.backup, null, 2);
  await downloadText(
    text,
    `aegis-vault-pre-cloud-recovery-${dateStamp()}.json`,
    'application/json;charset=utf-8'
  );
  result.style.color = 'var(--apple-green)';
  result.textContent = 'Đã tải bản local cũ. Hãy giữ kèm mật khẩu chính cũ.';
};

$('backupFile').onchange = async event => {
  const file = event.target.files?.[0];
  backupImportPayload = null;
  $('backupFileName').textContent = file?.name || 'Chưa chọn tệp';
  $('backupImportButton').disabled = true;
  $('backupImportResult').textContent = '';
  if (!file) return;
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    $('backupFileName').textContent = `${file.name} · quá lớn`;
    $('backupImportResult').style.color = '#e11d48';
    $('backupImportResult').textContent = 'Tệp backup vượt quá giới hạn 10 MiB. Hãy chọn tệp nhỏ hơn.';
    event.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    if (!text.trim()) throw new Error('Tệp backup đang trống.');
    try {
      backupImportPayload = JSON.parse(text);
    } catch {
      backupImportPayload = text;
    }
    $('backupImportButton').disabled = false;
  } catch (error) {
    $('backupImportResult').style.color = '#e11d48';
    $('backupImportResult').textContent = error?.message || 'Không thể đọc tệp backup.';
  }
};

$('backupImportButton').onclick = async () => {
  const password = $('backupImportPassword').value;
  const result = $('backupImportResult');
  const button = $('backupImportButton');
  result.textContent = '';
  if (!backupImportPayload) {
    result.style.color = '#e11d48';
    result.textContent = 'Hãy chọn tệp backup Aegis.';
    return;
  }
  if (!password) {
    result.style.color = '#e11d48';
    result.textContent = 'Nhập mật khẩu chính của bản backup.';
    $('backupImportPassword').focus();
    return;
  }
  const accepted = await confirmAction({
    title: 'Khôi phục Vault?',
    message: 'Dữ liệu trong tệp sẽ thay thế Vault hiện tại rồi được đồng bộ lại. Bạn có đồng ý tiếp tục không?',
    acceptText: 'Đồng ý khôi phục',
    cancelText: 'Không khôi phục',
    tone: 'restore'
  });
  if (!accepted) return;

  button.disabled = true;
  button.textContent = 'Đang khôi phục…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang xác minh mật khẩu và khôi phục dữ liệu mã hóa…';
  try {
    const response = await send({
      type: 'IMPORT_ENCRYPTED_BACKUP',
      masterPassword: password,
      backup: backupImportPayload
    });
    if (response?.ok === false) {
      throw new Error(response.error || 'Không thể khôi phục backup.');
    }
    result.style.color = 'var(--apple-green)';
    result.textContent = `Đã khôi phục ${formatBackupCounts(response?.counts)}.`;
    $('backupImportPassword').value = '';
    $('backupFile').value = '';
    $('backupFileName').textContent = 'Chưa chọn tệp';
    backupImportPayload = null;
    await loadManager();
    await refreshSyncStatus(response?.syncStatus);
  } catch (error) {
    result.style.color = '#e11d48';
    result.textContent = `Không thể khôi phục: ${error?.message || 'Lỗi không xác định.'}`;
  } finally {
    button.textContent = 'Khôi phục Vault';
    button.disabled = !backupImportPayload;
  }
};

$('otpTextFile').onchange = async event => {
  const generation = ++otpReadGeneration;
  const file = event.target.files?.[0];
  otpText = '';
  otpImportValidCount = 0;
  $('otpImportBtn').disabled = true;
  $('otpImportResult').textContent = '';
  if (!file) {
    $('otpTextFileName').textContent = 'Chưa chọn tệp';
    return;
  }
  if (file.size > MAX_OTP_FILE_BYTES) {
    $('otpTextFileName').textContent = `${file.name} · quá lớn`;
    $('otpImportResult').style.color = '#e11d48';
    $('otpImportResult').textContent = 'Tệp OTP vượt quá giới hạn 4 MiB. Hãy chọn tệp nhỏ hơn.';
    event.target.value = '';
    return;
  }
  $('otpTextFileName').textContent = `${file.name} · đang kiểm tra…`;
  try {
    const text = await file.text();
    if (generation !== otpReadGeneration) return;
    if (!text.trim()) throw new Error('Tệp OTP đang trống.');
    const response = await send({ type: 'OTP_IMPORT_PREVIEW', text });
    if (response?.ok === false) throw new Error(response.error || 'Tệp OTP không hợp lệ.');
    otpText = text;
    otpImportValidCount = response.preview?.valid || 0;
    $('otpTextFileName').textContent = file.name;
    $('otpImportBtn').disabled = otpImportValidCount === 0;
    $('otpImportResult').style.color = otpImportValidCount ? 'var(--apple-green)' : '#e11d48';
    $('otpImportResult').textContent = otpImportValidCount
      ? `Đã kiểm tra: ${otpImportValidCount} mã OTP hợp lệ, ${response.preview?.duplicates || 0} mục trùng.`
      : 'Tệp không có mã OTP hợp lệ để nhập.';
  } catch (error) {
    if (generation !== otpReadGeneration) return;
    otpText = '';
    $('otpTextFileName').textContent = `${file.name} · không hợp lệ`;
    $('otpImportResult').style.color = '#e11d48';
    $('otpImportResult').textContent = error?.message || 'Không thể đọc tệp OTP.';
    event.target.value = '';
  }
};
$('otpImportBtn').onclick = async () => {
  if (!otpText || !otpImportValidCount) return;
  const accepted = await confirmAction({
    title: 'Nhập mã OTP?',
    message: `Bạn có đồng ý nhập ${otpImportValidCount} mã OTP hợp lệ vào Vault không?`,
    acceptText: 'Đồng ý nhập OTP',
    cancelText: 'Không nhập',
    tone: 'restore'
  });
  if (!accepted) return;
  const button = $('otpImportBtn');
  const result = $('otpImportResult');
  button.disabled = true;
  button.textContent = 'Đang nhập…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang kiểm tra và mã hóa mã OTP…';
  try {
    const response = await send({ type: 'OTP_IMPORT_COMMIT', text: otpText });
    if (response?.ok === false) throw new Error(response.error || 'Không thể nhập OTP.');
    const skipped = Math.max(0, otpImportValidCount - (response.imported || 0));
    result.style.color = 'var(--apple-green)';
    result.textContent = `Đã nhập ${response.imported ?? 0} mã OTP.${skipped ? ` Bỏ qua ${skipped} mã đã tồn tại.` : ''}`;
    $('otpTextFile').value = '';
    $('otpTextFileName').textContent = 'Chưa chọn tệp';
    otpText = '';
    otpImportValidCount = 0;
    await refreshSyncStatus(response?.syncStatus);
  } catch (error) {
    result.style.color = '#e11d48';
    result.textContent = `Không thể nhập OTP: ${error?.message || 'Lỗi không xác định.'}`;
  } finally {
    button.textContent = 'Nhập OTP';
    button.disabled = !otpText;
  }
};
$('otpExportBtn').onclick = async () => {
  const password = $('otpExportPassword').value;
  const result = $('otpExportResult');
  const button = $('otpExportBtn');
  result.style.color = '#e11d48';
  result.textContent = '';
  if (!password) {
    result.textContent = 'Nhập mật khẩu chính để xuất OTP.';
    $('otpExportPassword').focus();
    return;
  }
  const accepted = await confirmAction({
    title: 'Xuất mã OTP?',
    message: 'Tệp TXT chứa secret có thể tạo mã đăng nhập. Hãy giữ tệp ở nơi an toàn.',
    acceptText: 'Đồng ý xuất OTP',
    cancelText: 'Không xuất',
    tone: 'restore'
  });
  if (!accepted) return;
  button.disabled = true;
  button.textContent = 'Đang xuất…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang xác minh và chuẩn bị tệp OTP…';
  try {
    const response = await send({ type: 'OTP_EXPORT_TXT', masterPassword: password });
    if (response?.ok === false || typeof response?.text !== 'string') {
      throw new Error(response?.error || 'Không thể xuất tệp OTP.');
    }
    await downloadText(response.text, `aegis-authenticator-${dateStamp()}.txt`, 'text/plain;charset=utf-8');
    result.style.color = 'var(--apple-green)';
    result.textContent = `Đã xuất ${response.count ?? 0} mã OTP.`;
    $('otpExportPassword').value = '';
  } catch (error) {
    result.style.color = '#e11d48';
    result.textContent = `Không thể xuất OTP: ${error?.message || 'Lỗi không xác định.'}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Xuất OTP TXT';
  }
};


$('changePasswordBtn').onclick = async () => {
  const currentPassword = $('changeCurrentPassword').value;
  const newPassword = $('changeNewPassword').value;
  const confirmPassword = $('changeConfirmPassword').value;
  const resultEl = $('changePasswordResult');
  const btn = $('changePasswordBtn');
  
  resultEl.textContent = '';
  resultEl.style.color = '';
  
  if (!currentPassword) {
    resultEl.textContent = '⚠️ Vui lòng nhập mật khẩu chính hiện tại.';
    resultEl.style.color = '#e11d48';
    $('changeCurrentPassword').focus();
    return;
  }

  if (!newPassword) {
    resultEl.textContent = '⚠️ Vui lòng nhập mật khẩu chính mới.';
    resultEl.style.color = '#e11d48';
    $('changeNewPassword').focus();
    return;
  }

  if (!confirmPassword) {
    resultEl.textContent = '⚠️ Vui lòng xác nhận mật khẩu chính mới.';
    resultEl.style.color = '#e11d48';
    $('changeConfirmPassword').focus();
    return;
  }
  
  if (newPassword.length < 6) {
    resultEl.textContent = '⚠️ Mật khẩu chính mới phải có ít nhất 6 ký tự.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  if (newPassword !== confirmPassword) {
    resultEl.textContent = '❌ Mật khẩu mới và Nhập lại mật khẩu mới không trùng khớp nhau! Vui lòng kiểm tra lại.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  if (currentPassword === newPassword) {
    resultEl.textContent = '⚠️ Mật khẩu mới không được trùng với mật khẩu hiện tại.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ Đang kiểm tra & cập nhật mật khẩu chính…';
  resultEl.textContent = '⌛ Đang cập nhật mật khẩu mới và mã hóa lại dữ liệu...';
  resultEl.style.color = 'var(--apple-accent)';
  
  try {
    const response = await send({ 
      type: 'CHANGE_PASSWORD', 
      currentPassword, 
      newPassword 
    });
    
    btn.disabled = false;
    btn.textContent = 'Cập nhật mật khẩu chính';

    if (response.ok) {
      const syncState = String(response.syncStatus?.state || '').toLowerCase();
      const syncPending = response.syncOk === false || ['error', 'conflict', 'staged'].includes(syncState);
      resultEl.textContent = syncPending
        ? '⚠️ Mật khẩu trên máy này đã đổi thành công, nhưng Firebase chưa nhận được. Aegis sẽ tự thử lại khi có mạng.'
        : '🎉 HOÀN THÀNH: Đã thay đổi mật khẩu chính và đồng bộ lên Firebase thành công!';
      resultEl.style.color = syncPending ? '#b45309' : 'var(--apple-green)';
      // Clear inputs
      $('changeCurrentPassword').value = '';
      $('changeNewPassword').value = '';
      $('changeConfirmPassword').value = '';
      await refreshSyncStatus(response.syncStatus);
    } else {
      resultEl.textContent = `❌ Đổi mật khẩu thất bại: ${response.error || 'Mật khẩu hiện tại không chính xác.'}`;
      resultEl.style.color = '#e11d48';
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Cập nhật mật khẩu chính';
    resultEl.textContent = `❌ Lỗi: ${err?.message || 'Không thể thực hiện đổi mật khẩu.'}`;
    resultEl.style.color = '#e11d48';
  }
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    (areaName === 'local' && changes.aegisGoogleUser) ||
    (areaName === 'session' && changes.aegisSessionPassword)
  ) {
    location.reload();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'VAULT_LOCKED') {
    location.reload();
  }
});

// Toggle user profile dropdown
$('topUserBtn').onclick = (e) => {
  e.stopPropagation();
  $('userDropdown').classList.toggle('hidden');
};

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  $('userDropdown').classList.add('hidden');
});

// Dropdown item: Change Master Password
$('dropdownChangePassword').onclick = (e) => {
  e.stopPropagation();
  $('userDropdown').classList.add('hidden');
  $('menuIdentity').click();
  // Focus on the first input of change password card
  setTimeout(() => $('changeCurrentPassword').focus(), 150);
};

// Dropdown item: Sign Out
$('dropdownSignOut').onclick = async (e) => {
  e.stopPropagation();
  $('userDropdown').classList.add('hidden');
  if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Google hiện tại?')) {
    await send({ type: 'GOOGLE_SIGN_OUT' });
    location.reload();
  }
};

function initPasswordToggles() {
  document.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      btn.classList.toggle('is-visible', isPwd);
      btn.setAttribute('aria-label', isPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      btn.title = isPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
    };
  });
}

function openDonateModal() {
  $('donateModal')?.classList.remove('hidden');
}

function closeDonateModal() {
  $('donateModal')?.classList.add('hidden');
}

if ($('topDonateBtn')) {
  $('topDonateBtn').onclick = (e) => {
    e.stopPropagation();
    openDonateModal();
  };
}


if ($('closeDonateModal')) {
  $('closeDonateModal').onclick = closeDonateModal;
}

if ($('donateModal')) {
  $('donateModal').onclick = (e) => {
    if (e.target === $('donateModal')) {
      closeDonateModal();
    }
  };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('donateModal') && !$('donateModal').classList.contains('hidden')) {
    closeDonateModal();
  }
});

async function copyToClipboard(text, btn, successLabel) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = btn.innerHTML;
    btn.innerHTML = successLabel;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }
}

if ($('copyBtcBtn')) {
  $('copyBtcBtn').onclick = () => {
    copyToClipboard('14enMJBiXgk7jLc187qXB5quBBSfsYuVG', $('copyBtcBtn'), t('donateCopiedBtc', '✓ Copied BTC Address!'));
  };
}

if ($('copyUsdtBtn')) {
  $('copyUsdtBtn').onclick = () => {
    copyToClipboard('0x1b1817cc4f6eb49adb051c25d0f82e77f66c8514', $('copyUsdtBtn'), t('donateCopiedUsdt', '✓ Copied USDT Address!'));
  };
}

init();
initPasswordToggles();
