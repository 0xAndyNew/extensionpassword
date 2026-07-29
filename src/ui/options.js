import { analyzeCredentials } from '../vault/password-security.js';
import { setSiteIcon } from './favicon.js';

const $ = id => document.getElementById(id);
let csvText = '';
let managerCredentials = [];
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

async function init() {
  const status = await send({ type: 'STATUS' });
  isSignedIn = Boolean(status.ok && status.user);
  $('topUserBtn').classList.toggle('hidden', !isSignedIn);
  applyRecoveryStatus(status.syncStatus, isSignedIn);

  if (isSignedIn) {
    updateProfileUI(status.user);
  } else {
    $('profileEmail').textContent = '';
    $('googleAvatar').textContent = '?';
  }
  
  if (status.ok && status.unlocked) {
    await loadManager();
  } else {
    $('loginsGrid').innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--muted);">
        <p style="font-size: 14px; margin-bottom: 16px;">${isSignedIn ? 'Kho mật khẩu của bạn đang khóa.' : 'Bạn chưa đăng nhập Google.'}</p>
        <p style="font-size: 12px;">${isSignedIn ? 'Vui lòng nhấp vào biểu tượng Aegis Vault ở thanh công cụ trình duyệt để mở khóa trước khi quản lý.' : 'Hãy đăng nhập từ popup Aegis Vault trước khi mở trang quản lý.'}</p>
      </div>
    `;
  }
  await refreshSyncStatus(status.syncStatus);
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
  const res = await send({ type: 'LIST_DECRYPTED' });
  if (res.ok) {
    managerCredentials = res.credentials;
    securityReport = analyzeCredentials(managerCredentials);
    renderManager();
    renderSecurityCenter();
  } else {
    managerCredentials = [];
    securityReport = analyzeCredentials([]);
    renderSecurityCenter();
  }
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
    $('editFavorite').checked = Boolean(item.favorite);
    
    setSiteIcon($('drawerLogo'), item.url);
    $('deleteBtn').classList.remove('hidden');
  } else {
    $('drawerTitle').textContent = 'Thêm tài khoản';
    $('editId').value = '';
    $('editTitle').value = '';
    $('editUrl').value = '';
    $('editMatchUrl').value = 'Tự động tạo từ link đăng nhập';
    $('editUsername').value = '';
    $('editPassword').value = '';
    $('editNotes').value = '';
    $('editFavorite').checked = false;
    $('drawerLogo').textContent = '🔒';
    $('deleteBtn').classList.add('hidden');
  }
}

function closeDrawer() {
  $('overlay').classList.remove('open');
  $('drawer').classList.remove('open');
}

$('overlay').onclick = closeDrawer;
$('drawerCancel').onclick = closeDrawer;
$('addBtn').onclick = () => openDrawer(null);

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
  const favorite = $('editFavorite').checked;
  
  if (!url || !username || !password) {
    alert('Vui lòng điền đầy đủ Website (URL), Tên đăng nhập và Mật khẩu.');
    return;
  }
  
  const res = await send({ type: 'UPDATE_ITEM', id, title, url, username, password, notes, favorite });
  if (res.ok) {
    closeDrawer();
    await loadManager();
    await refreshSyncStatus(res.syncStatus);
  } else {
    alert(res.error);
  }
};

$('deleteBtn').onclick = async () => {
  const id = $('editId').value;
  if (!id) return;
  if (confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) {
    const res = await send({ type: 'DELETE', id });
    if (res.ok) {
      closeDrawer();
      await loadManager();
      await refreshSyncStatus(res.syncStatus);
    } else {
      alert(res.error);
    }
  }
};

// Sidebar Navigation
const sections = {
  menuLogins: $('loginsSection'),
  menuSecurity: $('securitySection'),
  menuIdentity: $('identitySection'),
  menuSettings: $('settingsSection')
};

Object.keys(sections).forEach(menuId => {
  $(menuId).onclick = () => {
    Object.keys(sections).forEach(id => {
      $(id).classList.remove('active');
      sections[id].classList.add('hidden');
    });
    $(menuId).classList.add('active');
    sections[menuId].classList.remove('hidden');
    
    if (menuId === 'menuLogins') {
      $('addBtn').classList.remove('hidden');
      $('subTabsBar').classList.remove('hidden');
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

// CSV Import & Export logic
$('csvFile').onchange = async event => {
  const generation = ++csvReadGeneration;
  const file = event.target.files?.[0];
  csvText = '';
  importValidCount = 0;
  $('previewButton').disabled = true;
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
  $('csvFileName').textContent = `${file.name} · đang đọc…`;
  try {
    const text = await file.text();
    if (generation !== csvReadGeneration) return;
    if (!text.trim()) throw new Error('Tệp CSV đang trống.');
    csvText = text;
    $('csvFileName').textContent = file.name;
    $('previewButton').disabled = false;
  } catch (error) {
    if (generation !== csvReadGeneration) return;
    csvText = '';
    $('csvFileName').textContent = `${file.name} · không đọc được`;
    $('importResult').style.color = '#e11d48';
    $('importResult').textContent = error?.message || 'Không thể đọc tệp CSV.';
    event.target.value = '';
  }
};

$('previewButton').onclick = async () => {
  if (!csvText) return $('importResult').textContent = 'Hãy chọn file CSV.';
  const response = await send({ type: 'IMPORT_PREVIEW', csv: csvText });
  if (!response.ok) return $('importResult').textContent = response.error;
  const p = response.preview;
  importValidCount = p.valid;
  $('importResult').textContent = `Tổng: ${p.total}\nHợp lệ: ${p.valid}\nTrùng sẽ cập nhật: ${p.duplicates}\nLỗi: ${p.errors.length}${p.errors.slice(0, 5).map(e => `\n• Dòng ${e.row}: ${e.reason}`).join('')}`;
  $('importButton').disabled = p.valid === 0;
};

$('importButton').onclick = async () => {
  if (!confirm(`Nhập ${importValidCount} tài khoản hợp lệ vào vault?`)) return;
  
  $('importButton').disabled = true;
  $('importButton').textContent = 'Đang nhập...';
  $('importResult').style.color = 'var(--apple-accent)';
  $('importResult').style.fontWeight = '500';
  $('importResult').textContent = `⏳ Đang nhập và mã hóa ${importValidCount} tài khoản vào kho bảo mật. Vui lòng chờ...`;
  
  const response = await send({ type: 'IMPORT_COMMIT', csv: csvText });
  
  $('importButton').textContent = 'Nhập vào Vault';
  $('importButton').disabled = false;
  
  if (response.ok) {
    $('importResult').style.color = 'var(--apple-green)';
    $('importResult').style.fontWeight = '600';
    $('importResult').textContent = `✅ Đã nhập xong! Đã nhập/cập nhật thành công ${response.imported} tài khoản vào kho mật khẩu.`;
    await loadManager();
    await refreshSyncStatus();
  } else {
    $('importResult').style.color = '#e11d48';
    $('importResult').style.fontWeight = '600';
    $('importResult').textContent = `❌ Nhập thất bại: ${response.error}`;
  }
};

$('exportButton').onclick = async () => {
  if (!confirm(
    'CSV sẽ chứa mật khẩu dạng rõ và có thể bị Excel/Google Sheets diễn giải như công thức. '
    + 'Chỉ dùng tệp để chuyển sang password manager và không mở bằng ứng dụng bảng tính. Tiếp tục?'
  )) return;
  const response = await send({ type: 'EXPORT_CSV', masterPassword: $('exportPassword').value });
  if (!response.ok) return $('exportResult').textContent = response.error;
  downloadText(response.csv, `aegis-lastpass-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
  $('exportResult').textContent = `Đã xuất ${response.count} tài khoản.`;
};
function dateStamp(){return new Date().toISOString().slice(0,10);}
function downloadText(text,name,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

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
  downloadText(text, `aegis-vault-backup-${dateStamp()}.aegis`, 'application/json;charset=utf-8');
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
  downloadText(
    text,
    `aegis-vault-pre-cloud-recovery-${dateStamp()}.aegis`,
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
  if (!backupImportPayload) {
    result.style.color = '#e11d48';
    result.textContent = 'Hãy chọn tệp backup Aegis.';
    return;
  }
  if (!password) {
    result.style.color = '#e11d48';
    result.textContent = 'Nhập mật khẩu chính của bản backup.';
    return;
  }
  if (!confirm('Khôi phục sẽ thay thế Vault hiện tại bằng dữ liệu trong tệp đã chọn. Bạn có chắc muốn tiếp tục?')) return;

  const button = $('backupImportButton');
  button.disabled = true;
  button.textContent = 'Đang khôi phục…';
  result.style.color = 'var(--apple-accent)';
  result.textContent = 'Đang xác minh và khôi phục dữ liệu mã hóa…';
  const response = await send({
    type: 'IMPORT_ENCRYPTED_BACKUP',
    masterPassword: password,
    backup: backupImportPayload
  });
  button.textContent = 'Khôi phục Vault';

  if (response?.ok === false) {
    button.disabled = false;
    result.style.color = '#e11d48';
    result.textContent = response.error || 'Không thể khôi phục backup.';
    return;
  }

  result.style.color = 'var(--apple-green)';
  result.textContent = `Đã khôi phục ${formatBackupCounts(response?.counts)}.`;
  $('backupImportPassword').value = '';
  $('backupFile').value = '';
  $('backupFileName').textContent = 'Chưa chọn tệp';
  backupImportPayload = null;
  button.disabled = true;
  await loadManager();
  await refreshSyncStatus(response?.syncStatus);
};

$('otpTextFile').onchange = async event => {
  const generation = ++otpReadGeneration;
  const file = event.target.files?.[0];
  otpText = '';
  otpImportValidCount = 0;
  $('otpPreviewBtn').disabled = true;
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
  $('otpTextFileName').textContent = `${file.name} · đang đọc…`;
  try {
    const text = await file.text();
    if (generation !== otpReadGeneration) return;
    if (!text.trim()) throw new Error('Tệp OTP đang trống.');
    otpText = text;
    $('otpTextFileName').textContent = file.name;
    $('otpPreviewBtn').disabled = false;
  } catch (error) {
    if (generation !== otpReadGeneration) return;
    otpText = '';
    $('otpTextFileName').textContent = `${file.name} · không đọc được`;
    $('otpImportResult').style.color = '#e11d48';
    $('otpImportResult').textContent = error?.message || 'Không thể đọc tệp OTP.';
    event.target.value = '';
  }
};
$('otpPreviewBtn').onclick=async()=>{const r=await send({type:'OTP_IMPORT_PREVIEW',text:otpText});if(!r.ok)return $('otpImportResult').textContent=r.error;otpImportValidCount=r.preview.valid;$('otpImportResult').textContent=`Tổng: ${r.preview.total}\nHợp lệ: ${r.preview.valid}\nTrùng (bỏ qua): ${r.preview.duplicates}\nLỗi: ${r.preview.errors.length}${r.preview.errors.slice(0,5).map(e=>`\n• Dòng ${e.row}: ${e.reason}`).join('')}`;$('otpImportBtn').disabled=!r.preview.valid;};
$('otpImportBtn').onclick = async () => {
  if (!confirm(`Nhập tối đa ${otpImportValidCount} mã OTP vào Vault?`)) return;
  const button = $('otpImportBtn');
  const result = $('otpImportResult');
  button.disabled = true;
  button.textContent = 'Đang nhập...';
  result.style.color = 'var(--apple-accent)';
  result.style.fontWeight = '600';
  result.textContent = '⏳ Đang kiểm tra và mã hóa mã OTP...';
  const response = await send({ type: 'OTP_IMPORT_COMMIT', text: otpText });
  button.textContent = 'Nhập OTP';
  if (response.ok) {
    const skipped = Math.max(0, otpImportValidCount - response.imported);
    result.style.color = 'var(--apple-green)';
    result.textContent = `✅ Đã nhập xong ${response.imported} mã OTP.${skipped ? ` Bỏ qua ${skipped} mã đã tồn tại.` : ''}${response.errors.length ? ` Có ${response.errors.length} dòng lỗi.` : ''}`;
    $('otpTextFile').value = '';
    $('otpTextFileName').textContent = 'Chưa chọn tệp';
    otpText = '';
    otpImportValidCount = 0;
    $('otpPreviewBtn').disabled = true;
    button.disabled = true;
    await refreshSyncStatus(response.syncStatus);
  } else {
    result.style.color = '#e11d48';
    result.textContent = `❌ Nhập OTP thất bại: ${response.error}`;
    button.disabled = false;
  }
};
$('otpExportBtn').onclick=async()=>{if(!confirm('File xuất chứa secret OTP có thể tạo mã đăng nhập. Tiếp tục?'))return;const r=await send({type:'OTP_EXPORT_TXT',masterPassword:$('otpExportPassword').value});if(!r.ok)return $('otpExportResult').textContent=r.error;downloadText(r.text,`aegis-authenticator-${dateStamp()}.txt`);$('otpExportResult').textContent=`Đã xuất ${r.count} mã OTP.`;};


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
      btn.textContent = isPwd ? '🙈' : '👁️';
    };
  });
}

init();
initPasswordToggles();

