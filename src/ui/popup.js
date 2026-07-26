import { generateTotp, parseOtpAuthUri, serializeOtpAuthUri } from '../vault/totp.js';
import qrcode from '../vendor/qrcode-generator.js';
import jsQR from '../vendor/jsqr.js';

const $ = id => document.getElementById(id);
let credentials = [];
let otpAccounts = [];
let otpTimer = null;
let cameraStream = null;
let isOtpDragging = false;
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
  $('profileButton').classList.toggle('hidden', !isSignedIn);
  $('headerScanButton').classList.toggle('hidden', !isSignedIn);
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
  
  $('profileButton').textContent = initials;
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
  
  if (activeMainTab === 'profile') {
    container.classList.add('hidden'); $('identityTabContent').classList.remove('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.add('hidden'); $('floatAddBtn').classList.add('hidden'); stopOtpTimer(); return;
  }
  if (activeMainTab === 'generator') {
    container.classList.add('hidden'); $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.remove('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.add('hidden'); $('floatAddBtn').classList.add('hidden'); stopOtpTimer(); generatePassword(); return;
  }
  if (activeMainTab === 'otp') {
    container.classList.add('hidden'); $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.remove('hidden'); $('subTabs').classList.add('hidden'); $('floatAddBtn').classList.add('hidden'); loadOtp(); return;
  }
  container.classList.remove('hidden');
  $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.remove('hidden'); $('floatAddBtn').classList.remove('hidden'); stopOtpTimer();

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
  { id: 'tabOtp', key: 'otp' }
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

$('profileButton').onclick = () => {
  mainTabs.forEach(t => $(t.id).classList.remove('active'));
  activeMainTab = 'profile'; render();
};

async function loadOtp() {
  const response = await send({ type: 'OTP_LIST' });
  if (!response.ok) return;
  otpAccounts = response.otpAccounts || [];
  await renderOtp();
  if (!otpTimer) otpTimer = setInterval(renderOtp, 1000);
}
function stopOtpTimer() { if (otpTimer) clearInterval(otpTimer); otpTimer = null; }
async function renderOtp() {
  if (activeMainTab !== 'otp' || isOtpDragging) return;
  const q = $('searchInput').value.toLowerCase();
  const list = otpAccounts.filter(item => `${item.issuer} ${item.account}`.toLowerCase().includes(q));
  if (!list.length) { $('otpList').innerHTML = '<div style="padding:28px;text-align:center;color:#86868b;font-size:12px">Chưa có mã OTP. Chọn “Thêm mã” để bắt đầu.</div>'; return; }
  const nodes = await Promise.all(list.map(async item => {
    const card = document.createElement('article'); card.className = 'otp-card'; card.draggable = false; card.dataset.id = item.id;
    const issuer = document.createElement('div'); issuer.className = 'otp-issuer'; issuer.textContent = item.issuer || item.account;
    const code = document.createElement('div'); code.className = 'otp-code'; code.textContent = await generateTotp(item);
    const account = document.createElement('div'); account.className = 'otp-account'; account.textContent = item.account || '';
    const side = document.createElement('div'); side.className = 'otp-side';
    const tools = document.createElement('div'); tools.className = 'otp-card-tools';
    const dragHandle = document.createElement('button'); dragHandle.type = 'button'; dragHandle.className = 'otp-icon-btn otp-drag-btn'; dragHandle.title = 'Kéo để đổi thứ tự'; dragHandle.setAttribute('aria-label', `Kéo ${item.issuer || item.account} để đổi thứ tự`); dragHandle.textContent = '⠿';
    const qrButton = document.createElement('button'); qrButton.type = 'button'; qrButton.className = 'otp-icon-btn otp-qr-btn'; qrButton.title = 'Hiển thị QR để quét'; qrButton.setAttribute('aria-label', `Hiển thị QR cho ${item.issuer || item.account}`); qrButton.textContent = '▦';
    const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'otp-icon-btn'; editButton.title = 'Sửa hoặc xóa OTP'; editButton.setAttribute('aria-label', `Sửa ${item.issuer || item.account}`); editButton.textContent = '✎';
    tools.append(dragHandle, qrButton, editButton);
    const timer = document.createElement('span'); timer.className = 'otp-timer'; timer.title = `${item.period || 30} giây mỗi mã`;
    const seconds = document.createElement('span'); timer.append(seconds);
    side.append(tools, timer);
    const remaining = (item.period || 30) - (Math.floor(Date.now()/1000) % (item.period || 30));
    seconds.textContent = remaining;
    code.classList.toggle('expiring', remaining <= 5);
    timer.classList.toggle('expiring', remaining <= 5);
    timer.style.setProperty('--timer-angle', `${remaining / (item.period || 30) * 360}deg`);
    card.append(issuer, code, account, side);
    dragHandle.onclick = event => event.stopPropagation();
    dragHandle.onpointerdown = () => { card.draggable = true; };
    qrButton.onclick = event => { event.stopPropagation(); showOtpQr(item); };
    editButton.onclick = event => { event.stopPropagation(); openOtpEditor(item); };
    card.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent);
      const toast = $('otpCopyToast');
      toast.classList.add('show');
      clearTimeout(toast.hideTimer);
      toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 900);
    };
    card.ondragstart = event => {
      if (!event.target.closest('.otp-card') || !card.draggable) { event.preventDefault(); return; }
      isOtpDragging = true;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      requestAnimationFrame(() => card.classList.add('dragging'));
    };
    card.ondragover = event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const dragging = $('otpList').querySelector('.dragging');
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      card.parentNode.insertBefore(dragging, event.clientY < rect.top + rect.height / 2 ? card : card.nextSibling);
    };
    card.ondragend = async () => {
      card.classList.remove('dragging');
      card.draggable = false;
      const visibleIds = [...$('otpList').querySelectorAll('.otp-card')].map(element => element.dataset.id);
      let cursor = 0;
      const visibleSet = new Set(visibleIds);
      const ids = otpAccounts.map(account => visibleSet.has(account.id) ? visibleIds[cursor++] : account.id);
      const response = await send({ type: 'OTP_REORDER', ids });
      if (response.ok) otpAccounts = ids.map(id => otpAccounts.find(account => account.id === id));
      isOtpDragging = false;
      await renderOtp();
    };
    return card;
  }));
  $('otpList').replaceChildren(...nodes);
}
function showOtpQr(item) {
  const qr = qrcode(0, 'M');
  qr.addData(serializeOtpAuthUri(item));
  qr.make();
  const canvas = $('otpQrCanvas');
  const context = canvas.getContext('2d');
  const count = qr.getModuleCount();
  const quiet = 4;
  const total = count + quiet * 2;
  canvas.width = canvas.height = 230;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 230, 230);
  const scale = 230 / total;
  context.fillStyle = '#000000';
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) {
    const x1 = Math.round((col + quiet) * scale), y1 = Math.round((row + quiet) * scale);
    const x2 = Math.round((col + quiet + 1) * scale), y2 = Math.round((row + quiet + 1) * scale);
    context.fillRect(x1, y1, x2 - x1, y2 - y1);
  }
  $('otpQrTitle').textContent = item.issuer || 'Mã QR OTP';
  $('otpQrLabel').textContent = item.account || '';
  $('otpQrModal').classList.remove('hidden');
}
const otpQrCloseButton = $('otpQrCloseBtn');
if (otpQrCloseButton) otpQrCloseButton.onclick = () => $('otpQrModal')?.classList.add('hidden');
const otpQrModal = $('otpQrModal');
if (otpQrModal) otpQrModal.onclick = event => { if (event.target === otpQrModal) otpQrModal.classList.add('hidden'); };
function resetOtpEditor() {
  ['otpEditId','otpUri','otpIssuer','otpAccount','otpSecret'].forEach(id => $(id).value = '');
  $('otpDialogTitle').textContent = 'Thêm mã xác thực';
  $('otpDeleteBtn').classList.remove('visible');
  $('otpFormError').textContent = '';
}
function openOtpEditor(item = null) {
  resetOtpEditor();
  if (item) {
    $('otpEditId').value = item.id;
    $('otpIssuer').value = item.issuer || '';
    $('otpAccount').value = item.account || '';
    $('otpSecret').value = item.secret || '';
    $('otpDialogTitle').textContent = 'Sửa mã xác thực';
    $('otpDeleteBtn').classList.add('visible');
  }
  $('otpModal').classList.remove('hidden');
}
async function openCameraScanner() {
  openOtpEditor();
  $('otpDialogTitle').textContent = 'Quét QR thêm mã OTP';
  await startOtpCamera();
}
function stopCamera(){ if(cameraStream) cameraStream.getTracks().forEach(track=>track.stop()); cameraStream=null; $('otpCamera').classList.add('hidden'); }
function closeOtpModal(){ stopCamera(); resetOtpEditor(); $('otpModal').classList.add('hidden'); }
const headerScanButton = $('headerScanButton');
if (headerScanButton) headerScanButton.onclick = openCameraScanner;
const otpCancelButton = $('otpCancelBtn');
if (otpCancelButton) otpCancelButton.onclick = closeOtpModal;
const otpSaveButton = $('otpSaveBtn');
if (otpSaveButton) otpSaveButton.onclick=async()=>{const id=$('otpEditId').value;const uri=$('otpUri').value.trim();const r=await send(uri?{type:'OTP_SAVE',id,uri}:{type:'OTP_SAVE',id,issuer:$('otpIssuer').value,account:$('otpAccount').value,secret:$('otpSecret').value});if(!r.ok)return $('otpFormError').textContent=r.error;closeOtpModal();await loadOtp();};
const otpDeleteButton = $('otpDeleteBtn');
if (otpDeleteButton) otpDeleteButton.onclick=async()=>{const id=$('otpEditId').value;if(!id||!confirm('Xóa mã OTP này? Hành động không thể hoàn tác.'))return;const r=await send({type:'OTP_DELETE',id});if(!r.ok)return $('otpFormError').textContent=r.error;closeOtpModal();await loadOtp();};
async function acceptQr(value){try{const parsed=parseOtpAuthUri(value);$('otpUri').value=value;$('otpIssuer').value=parsed.issuer;$('otpAccount').value=parsed.account;$('otpSecret').value=parsed.secret;stopCamera();}catch(error){$('otpFormError').textContent=error.message;}}
function decodeQrFromSource(source) {
  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  if (!width || !height) return null;
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
}
$('otpImageBtn').onclick=()=>$('otpQrFile').click();
$('otpQrFile').onchange = async event => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const result = decodeQrFromSource(bitmap);
    bitmap.close();
    if (result?.data) acceptQr(result.data);
    else $('otpFormError').textContent = 'Không tìm thấy QR trong ảnh. Hãy chọn ảnh rõ và không bị cắt.';
  } catch (error) { $('otpFormError').textContent = `Không đọc được ảnh QR: ${error.message}`; }
  finally { event.target.value = ''; }
};
async function startOtpCamera() {
  try {
    $('otpFormError').textContent = '';
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const video = $('otpCamera');
    video.srcObject = cameraStream;
    video.classList.remove('hidden');
    await video.play();
    const scan = () => {
      if (!cameraStream) return;
      const result = decodeQrFromSource(video);
      if (result?.data) return acceptQr(result.data);
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch (error) {
    stopCamera();
    const denied = error.name === 'NotAllowedError';
    $('otpFormError').textContent = denied ? 'Chrome đang chặn camera. Hãy cho phép Camera trong quyền của extension rồi thử lại.' : `Không mở được camera: ${error.message}`;
  }
}
const otpCameraButton = $('otpCameraBtn');
if (otpCameraButton) otpCameraButton.onclick = startOtpCamera;
const advancedSettingsButton = $('advancedSettingsBtn');
if (advancedSettingsButton) advancedSettingsButton.onclick = async () => { await send({ type: 'OPEN_OPTIONS' }); window.close(); };
window.addEventListener('unload',()=>{stopOtpTimer();stopCamera();});

init();
