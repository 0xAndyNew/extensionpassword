const $ = id => document.getElementById(id);
let credentials = [];
let activeSubTab = 'popular';
let activeMainTab = 'logins';
let currentOrigin = '';

const BLUE_GLOBE_SVG = `<svg viewBox="0 0 100 100" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function setAccountControls(isSignedIn) {
  $('optionsButton').classList.toggle('hidden', !isSignedIn);
  $('lockButton').classList.toggle('hidden', !isSignedIn);
}

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url) {
    try {
      currentOrigin = new URL(tabs[0].url).origin;
    } catch (e) {
      currentOrigin = '';
    }
  }

  const s = await send({ type: 'STATUS' });
  const isSignedIn = Boolean(s.ok && s.user);
  setAccountControls(isSignedIn);

  if (s.ok) {
    if (s.user) {
      updateProfileUI(s.user);
    }
    
    if (s.unlocked) {
      showVault();
    } else {
      $('googleView').classList.toggle('hidden', isSignedIn);
      $('authView').classList.toggle('hidden', !isSignedIn);
      $('vaultView').classList.add('hidden');
      if (isSignedIn) authMode(s.exists);
    }
  } else {
    $('googleView').classList.remove('hidden');
    $('authView').classList.add('hidden');
    $('vaultView').classList.add('hidden');
  }
  
  // Khởi tạo các trình lắng nghe sự kiện của Password Generator
  initGenerator();
}

function updateProfileUI(user) {
  const name = user.name || 'Google Account';
  const email = user.email || '';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'GA';
  
  $('tabProfile').textContent = `👤 ${initials}`;
  $('pFirstName').textContent = name;
  $('pEmail').textContent = email || 'Chưa có email';
}

function authMode(exists) {
  $('authView').classList.remove('hidden');
  $('vaultView').classList.add('hidden');
  $('authTitle').textContent = exists ? 'Mở khóa kho bảo mật' : 'Tạo kho bảo mật';
  $('authHint').textContent = exists ? 'Nhập mật khẩu chính để tiếp tục.' : 'Tạo mật khẩu chính tối thiểu 10 ký tự để mã hóa vault.';
  $('authButton').textContent = exists ? 'Mở khóa →' : 'Tạo vault →';
  $('authButton').dataset.exists = String(exists);
}

async function showVault() {
  $('googleView').classList.add('hidden');
  $('authView').classList.add('hidden');
  $('vaultView').classList.remove('hidden');
  
  const r = await send({ type: 'LIST' });
  if (r.ok) {
    credentials = r.credentials;
    render();
  } else {
    $('error').textContent = r.error;
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

function render() {
  const q = $('searchInput').value.toLowerCase();
  let list = credentials.filter(x => `${x.title} ${x.username}`.toLowerCase().includes(q));
  
  if (activeSubTab === 'az') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (activeSubTab === 'recent') {
    list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else {
    list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }

  const container = $('credentialList');
  
  // Ẩn/hiện giao diện dựa theo main tab hoạt động
  if (activeMainTab === 'profile') {
    container.classList.add('hidden');
    $('identityTabContent').classList.remove('hidden');
    $('generatorTabContent').classList.add('hidden');
    $('subTabs').classList.add('hidden');
    $('floatAddBtn').classList.add('hidden');
    return;
  }
  
  if (activeMainTab === 'generator') {
    container.classList.add('hidden');
    $('identityTabContent').classList.add('hidden');
    $('generatorTabContent').classList.remove('hidden');
    $('subTabs').classList.add('hidden');
    $('floatAddBtn').classList.add('hidden');
    generatePassword(); // Tự động tạo lần đầu khi mở tab
    return;
  }
  
  // Tab logins thông thường
  container.classList.remove('hidden');
  $('identityTabContent').classList.add('hidden');
  $('generatorTabContent').classList.add('hidden');
  $('subTabs').classList.remove('hidden');
  $('floatAddBtn').classList.remove('hidden');

  if (!list.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">Không có tài khoản nào được tìm thấy.</div>`;
    return;
  }

  container.replaceChildren(...list.map(item => {
    const el = document.createElement('div');
    el.className = 'list-item';
    
    const icon = document.createElement('div');
    icon.className = 'list-icon';
    icon.style.display = 'grid';
    icon.style.placeItems = 'center';
    
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
    
    const info = document.createElement('div');
    info.className = 'list-info';
    const title = document.createElement('h4');
    title.textContent = item.title;
    const user = document.createElement('p');
    user.textContent = item.username;
    info.append(title, user);
    
    const menuBtn = document.createElement('button');
    menuBtn.className = 'list-menu-btn';
    menuBtn.innerHTML = '⋮';
    menuBtn.title = 'Chi tiết / Quản lý';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.openOptionsPage();
    };

    el.append(icon, info, menuBtn);
    
    el.onclick = async () => {
      if (!currentOrigin) return;
      const res = await send({ type: 'FILL', id: item.id, origin: currentOrigin });
      if (res.ok) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'AEGIS_AUTOFILL', username: res.credential.username, password: res.credential.password });
          window.close();
        }
      } else {
        alert(res.error);
      }
    };
    
    return el;
  }));
}

// Google Auth Action
$('googleButton').onclick = async () => {
  $('googleError').textContent = '';
  const r = await send({ type: 'GOOGLE_SIGN_IN' });
  if (r.ok) {
    updateProfileUI(r.user);
    setAccountControls(true);
    $('googleView').classList.add('hidden');
    const s = await send({ type: 'STATUS' });
    authMode(s.exists);
  } else {
    setAccountControls(false);
    $('googleError').textContent = r.error;
  }
};

// Vault Auth Action
$('authButton').onclick = async () => {
  $('error').textContent = '';
  const password = $('masterPassword').value;
  const type = $('authButton').dataset.exists === 'true' ? 'UNLOCK' : 'CREATE';
  const r = await send({ type, password });
  if (r.ok) {
    showVault();
  } else {
    if (r.error && (r.error.includes('decryption') || r.error.includes('Decryption') || r.error.includes('decrypt'))) {
      $('error').textContent = 'Mật khẩu không đúng. Vui lòng thử lại.';
    } else {
      $('error').textContent = r.error || 'Mở khóa thất bại. Vui lòng thử lại.';
    }
  }
};

$('masterPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('authButton').click();
});

// Search input
$('searchInput').oninput = render;

// Lock button
$('lockButton').onclick = async () => {
  await send({ type: 'LOCK' });
  location.reload();
};


// Đăng xuất Google từ tab Profile
$('profileSignOutBtn').onclick = async () => {
  if (confirm('Bạn có chắc chắn muốn đăng xuất Google?')) {
    setAccountControls(false);
    await send({ type: 'GOOGLE_SIGN_OUT' });
    location.reload();
  }
};

// Đăng nhập tài khoản Google khác từ màn hình khóa
$('authSignOutBtn').onclick = async (e) => {
  e.preventDefault();
  if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Google hiện tại?')) {
    setAccountControls(false);
    await send({ type: 'GOOGLE_SIGN_OUT' });
    location.reload();
  }
};

// Main Tabs Controller
const mainTabs = [
  { id: 'tabLogins', key: 'logins' },
  { id: 'tabGenerator', key: 'generator' },
  { id: 'tabProfile', key: 'profile' }
];

mainTabs.forEach(tab => {
  $(tab.id).onclick = () => {
    mainTabs.forEach(t => $(t.id).classList.remove('active'));
    $(tab.id).classList.add('active');
    activeMainTab = tab.key;
    render();
  };
});

// Sub Tabs Controller
const subTabsPopup = [...$('subTabs').children];
subTabsPopup.forEach(tab => {
  tab.onclick = () => {
    subTabsPopup.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeSubTab = tab.dataset.tab;
    render();
  };
});

// Floating buttons actions
$('floatAddBtn').onclick = () => {
  chrome.runtime.openOptionsPage();
};

// Trình quản lý Password Generator
function initGenerator() {
  $('genLength').oninput = () => {
    $('lenLabel').textContent = $('genLength').value;
    generatePassword();
  };
  $('genUpper').onchange = generatePassword;
  $('genLower').onchange = generatePassword;
  $('genNumbers').onchange = generatePassword;
  $('genSymbols').onchange = generatePassword;
  $('genRegenBtn').onclick = generatePassword;
  
  $('genCopyBtn').onclick = () => {
    const text = $('genPasswordDisplay').value;
    if (text && text !== 'Chọn ít nhất 1 loại ký tự') {
      navigator.clipboard.writeText(text);
      const btn = $('genCopyBtn');
      btn.textContent = 'Copied!';
      btn.style.background = '#34c759';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1000);
    }
  };
}

function generatePassword() {
  const length = parseInt($('genLength').value);
  const upper = $('genUpper').checked;
  const lower = $('genLower').checked;
  const numbers = $('genNumbers').checked;
  const symbols = $('genSymbols').checked;
  
  let chars = '';
  if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lower) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (numbers) chars += '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  if (!chars) {
    $('genPasswordDisplay').value = 'Chọn ít nhất 1 loại ký tự';
    return;
  }
  
  let password = '';
  // Đảm bảo mật khẩu sinh ra hoàn toàn ngẫu nhiên cục bộ bằng API Crypto
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    password += chars[randomValues[i] % chars.length];
  }
  $('genPasswordDisplay').value = password;
}

$('optionsButton').onclick = async () => {
  const status = await send({ type: 'STATUS' });
  if (!status.ok || !status.user) {
    $('optionsButton').classList.add('hidden');
    return;
  }
  await send({ type: 'OPEN_OPTIONS' });
  window.close();
};

init();
