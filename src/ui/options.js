import { analyzeCredentials } from '../vault/password-security.js';

const $ = id => document.getElementById(id);
let csvText = '';
let managerCredentials = [];
let activeSubTab = 'popular';
let importValidCount = 0;
let otpText = '';
let otpImportValidCount = 0;
let securityReport = analyzeCredentials([]);
let activeSecurityFilter = 'issues';

const BLUE_GLOBE_SVG = `<svg viewBox="0 0 100 100" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="45" cy="55" r="35" stroke="#0071e3" stroke-width="5" fill="none"/>
  <path d="M45 20 C30 30 30 80 45 90" stroke="#0071e3" stroke-width="3" fill="none"/>
  <path d="M45 20 C60 30 60 80 45 90" stroke="#0071e3" stroke-width="3" fill="none"/>
  <line x1="45" y1="20" x2="45" y2="90" stroke="#0071e3" stroke-width="3"/>
  <line x1="10" y1="55" x2="80" y2="55" stroke="#0071e3" stroke-width="3"/>
  <path d="M15 37 C25 45 65 45 75 37" stroke="#0071e3" stroke-width="3" fill="none"/>
  <path d="M15 73 C25 65 65 65 75 73" stroke="#0071e3" stroke-width="3" fill="none"/>
  <path d="M8 68 C 12 90, 52 98, 78 78 C 90 68, 93 52, 86 35" stroke="#0071e3" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M78 37 L94 28 L88 46 Z" fill="#0071e3"/>
</svg>`;

const send = message => chrome.runtime.sendMessage(message);

async function init() {
  const status = await send({ type: 'STATUS' });
  const isSignedIn = Boolean(status.ok && status.user);
  $('topUserBtn').classList.toggle('hidden', !isSignedIn);

  if (isSignedIn) {
    updateProfileUI(status.user);
  } else {
    $('profileEmail').textContent = '';
    $('googleAvatar').textContent = '?';
  }
  
  if (status.ok && status.unlocked) {
    loadManager();
  } else {
    $('loginsGrid').innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--muted);">
        <p style="font-size: 14px; margin-bottom: 16px;">${isSignedIn ? 'Kho mật khẩu của bạn đang khóa.' : 'Bạn chưa đăng nhập Google.'}</p>
        <p style="font-size: 12px;">${isSignedIn ? 'Vui lòng nhấp vào biểu tượng Aegis Vault ở thanh công cụ trình duyệt để mở khóa trước khi quản lý.' : 'Hãy đăng nhập từ popup Aegis Vault trước khi mở trang quản lý.'}</p>
      </div>
    `;
  }
}

function updateProfileUI(user) {
  const name = user.name || 'Google Account';
  const email = user.email || '';
  const avatar = user.picture ? `<img src="${user.picture}" alt="avatar">` : (name[0] || '?');
  
  $('profileEmail').textContent = email || 'Google Account';
  $('googleAvatar').innerHTML = avatar;
  
  $('identityName').textContent = name;
  $('identityEmail').textContent = email || 'Chưa có email';
  $('identityAvatar').innerHTML = avatar;
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

function getFavicon(urlStr) {
  try {
    const url = new URL(urlStr);
    return `${url.origin}/favicon.ico`;
  } catch (e) {
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
    
    const fav = getFavicon(item.url || item.origins?.[0]);
    if (fav) {
      const img = document.createElement('img');
      img.src = fav;
      img.onerror = () => {
        icon.style.background = 'rgba(0, 113, 227, 0.08)';
        icon.innerHTML = BLUE_GLOBE_SVG;
      };
      icon.append(img);
    } else {
      icon.style.background = 'rgba(0, 113, 227, 0.08)';
      icon.innerHTML = BLUE_GLOBE_SVG;
    }
    
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title || 'Không tiêu đề';
    
    const user = document.createElement('div');
    user.className = 'card-user';
    user.textContent = item.username || '';
    
    const overlay = document.createElement('div');
    overlay.className = 'card-hover-overlay';
    overlay.innerHTML = '👁️ Click to View';
    
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
    icon.innerHTML = BLUE_GLOBE_SVG;
    const fav = getFavicon(item.url);
    if (fav) {
      const img = document.createElement('img');
      img.src = fav;
      img.alt = '';
      img.onerror = () => { icon.innerHTML = BLUE_GLOBE_SVG; };
      icon.replaceChildren(img);
    }
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
    
    const fav = getFavicon(item.url);
    if (fav) {
      $('drawerLogo').innerHTML = `<img src="${fav}" alt="icon" style="width:100%;height:100%;object-fit:cover">`;
    } else {
      $('drawerLogo').innerHTML = '🔒';
    }
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
    $('drawerLogo').innerHTML = '🔒';
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
  const url = $('editUrl').value.trim();
  if (url) {
    window.open(url, '_blank');
  }
};

$('drawerSave').onclick = async () => {
  const id = $('editId').value;
  const title = $('editTitle').value.trim();
  const url = $('editUrl').value.trim();
  const username = $('editUsername').value.trim();
  const password = $('editPassword').value;
  const notes = $('editNotes').value;
  
  if (!url || !username || !password) {
    alert('Vui lòng điền đầy đủ Website (URL), Tên đăng nhập và Mật khẩu.');
    return;
  }
  
  const res = await send({ type: 'UPDATE_ITEM', id, title, url, username, password, notes });
  if (res.ok) {
    closeDrawer();
    await loadManager();
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
  const file = event.target.files[0];
  csvText = file ? await file.text() : '';
  $('csvFileName').textContent = file ? file.name : 'Chưa chọn tệp';
  $('previewButton').disabled = !file;
  $('importButton').disabled = true;
  $('importResult').textContent = '';
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
  $('importResult').innerHTML = `<span style="color:var(--apple-accent); font-weight: 500;">⏳ Đang nhập và mã hóa ${importValidCount} tài khoản vào kho bảo mật. Vui lòng chờ...</span>`;
  
  const response = await send({ type: 'IMPORT_COMMIT', csv: csvText });
  
  $('importButton').textContent = 'Nhập vào Vault';
  $('importButton').disabled = false;
  
  if (response.ok) {
    $('importResult').innerHTML = `<span style="color:var(--apple-green); font-weight: 600;">✅ Đã nhập xong! Đã nhập/cập nhật thành công ${response.imported} tài khoản vào kho mật khẩu.</span>`;
    await loadManager();
  } else {
    $('importResult').innerHTML = `<span style="color:#e11d48; font-weight: 600;">❌ Nhập thất bại: ${response.error}</span>`;
  }
};

$('exportButton').onclick = async () => {
  const response = await send({ type: 'EXPORT_CSV', masterPassword: $('exportPassword').value });
  if (!response.ok) return $('exportResult').textContent = response.error;
  downloadText(response.csv, `aegis-lastpass-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
  $('exportResult').textContent = `Đã xuất ${response.count} tài khoản.`;
};
function dateStamp(){return new Date().toISOString().slice(0,10);}
function downloadText(text,name,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('otpTextFile').onchange=async event=>{const file=event.target.files[0];otpText=file?await file.text():'';$('otpTextFileName').textContent=file?file.name:'Chưa chọn tệp';$('otpPreviewBtn').disabled=!file;$('otpImportBtn').disabled=true;$('otpImportResult').textContent='';};
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
  } else {
    result.style.color = '#e11d48';
    result.textContent = `❌ Nhập OTP thất bại: ${response.error}`;
    button.disabled = false;
  }
};
$('otpExportBtn').onclick=async()=>{if(!confirm('File xuất chứa secret OTP có thể tạo mã đăng nhập. Tiếp tục?'))return;const r=await send({type:'OTP_EXPORT_TXT',masterPassword:$('otpExportPassword').value});if(!r.ok)return $('otpExportResult').textContent=r.error;downloadText(r.text,`aegis-authenticator-${dateStamp()}.txt`);$('otpExportResult').textContent=`Đã xuất ${r.count} mã OTP.`;};
$('fullBackupButton').onclick=async()=>{if(!confirm('Bản sao lưu chứa toàn bộ mật khẩu và secret OTP ở dạng có thể đọc. Chỉ tiếp tục trên thiết bị tin cậy.'))return;const r=await send({type:'EXPORT_FULL_BACKUP',masterPassword:$('fullBackupPassword').value});if(!r.ok)return $('fullBackupResult').textContent=r.error;downloadText(r.backup,`aegis-full-backup-${dateStamp()}.json`,'application/json;charset=utf-8');$('fullBackupResult').textContent=`Đã sao lưu ${r.counts.credentials} tài khoản và ${r.counts.otp} mã OTP.`;};

$('changePasswordBtn').onclick = async () => {
  const currentPassword = $('changeCurrentPassword').value;
  const newPassword = $('changeNewPassword').value;
  const confirmPassword = $('changeConfirmPassword').value;
  const resultEl = $('changePasswordResult');
  
  resultEl.textContent = '';
  resultEl.style.color = '';
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    resultEl.textContent = 'Vui lòng nhập đầy đủ tất cả các trường.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  if (newPassword.length < 10) {
    resultEl.textContent = 'Mật khẩu chính mới phải có ít nhất 10 ký tự.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  if (newPassword !== confirmPassword) {
    resultEl.textContent = 'Xác nhận mật khẩu mới không trùng khớp.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  if (currentPassword === newPassword) {
    resultEl.textContent = 'Mật khẩu mới không được trùng với mật khẩu hiện tại.';
    resultEl.style.color = '#e11d48';
    return;
  }
  
  resultEl.textContent = '⌛ Đang cập nhật mật khẩu mới và mã hóa lại dữ liệu...';
  resultEl.style.color = 'var(--apple-accent)';
  
  const response = await send({ 
    type: 'CHANGE_PASSWORD', 
    currentPassword, 
    newPassword 
  });
  
  if (response.ok) {
    resultEl.textContent = '✅ Đã thay đổi mật khẩu chính thành công!';
    resultEl.style.color = 'var(--apple-green)';
    // Clear inputs
    $('changeCurrentPassword').value = '';
    $('changeNewPassword').value = '';
    $('changeConfirmPassword').value = '';
  } else {
    resultEl.textContent = `❌ Thất bại: ${response.error}`;
    resultEl.style.color = '#e11d48';
  }
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session') {
    if (changes.aegisGoogleUser || changes.aegisSessionPassword) {
      location.reload();
    }
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

init();

