import { generateTotp, parseOtpAuthUri, serializeOtpAuthUri } from '../vault/totp.js';
import qrcode from '../vendor/qrcode-generator.js';
import '../vendor/jsqr.js';
import { setSiteIcon } from './favicon.js';
import { i18nInit, localizeRuntimeText, setLanguage, translateDocument, t } from '../i18n.js';


const $ = id => document.getElementById(id);
let activeLanguage = 'en';
const l = (english, vietnamese) => activeLanguage === 'vi' ? vietnamese : english;
const lf = (english, vietnamese, values = {}) => l(english, vietnamese).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
const jsQR = globalThis.jsQR;
let credentials = [];
let otpAccounts = [];
let otpTimer = null;
let screenScanInFlight = false;
let isOtpDragging = false;
let otpDragArmedId = null;
let otpRenderGeneration = 0;
let activeSubTab = 'popular';
let activeMainTab = 'logins';
let currentOrigin = '';
let currentTabId = null;
let signedIn = false;
let applyingOtpUri = false;
let vaultUnlocked = false;
let otpSaveInFlight = false;
let vaultLoadGeneration = 0;
const OPEN_OTP_TAB_SESSION_KEY = 'aegisOpenOtpOnNextPopup';
const LAST_QR_SAVED_SESSION_KEY = 'aegisLastQrSavedOtp';
let recentlySavedOtp = null;
let recentlySavedOtpShown = false;

async function send(message, { timeoutMs = 0 } = {}) {
  let timeoutId = null;
  try {
    const request = chrome.runtime.sendMessage(message);
    const response = !timeoutMs
      ? await request
      : await Promise.race([
        request,
        new Promise(resolve => {
          timeoutId = setTimeout(() => resolve({
            ok: false,
            error: l('Aegis Vault is taking longer than expected. Retrying…', 'Aegis phản hồi chậm. Đang thử kết nối lại…'),
            timeout: true
          }), timeoutMs);
        })
      ]);
    if (response?.error) response.error = localizeRuntimeText(response.error, activeLanguage);
    if (response?.message) response.message = localizeRuntimeText(response.message, activeLanguage);
    return response;
  } catch (error) {
    return { ok: false, error: error?.message || l('Cannot connect to Aegis Vault.', 'Không thể kết nối với Aegis Vault.') };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function sendReadWithRetry(message, { attempts = 2, timeoutMs = 4000 } = {}) {
  let response = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await send(message, { timeoutMs });
    if (response?.ok) return response;
    if (attempt + 1 < attempts) await wait(120 * (attempt + 1));
  }
  return response || { ok: false, error: l('Cannot read Vault data.', 'Không thể đọc dữ liệu Vault.') };
}

async function activePageContext() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url) return null;
  try {
    const url = new URL(tab.url);
    const isLocalHttp = url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !isLocalHttp) return null;
    return { tabId: tab.id, origin: url.origin };
  } catch {
    return null;
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

function showOpenLinkPopover(anchor, url) {
  document.querySelector('.open-link-popover')?.remove();
  const popover = document.createElement('div');
  popover.className = 'open-link-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', l('Confirm opening website', 'Xác nhận mở website'));
  const host = new URL(url).host;
  const heading = document.createElement('strong');
  heading.textContent = l('Open website?', 'Mở website?');
  const destination = document.createElement('span');
  destination.textContent = host;
  destination.title = url;
  const actions = document.createElement('div');
  actions.className = 'open-link-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = l('Cancel', 'Hủy');
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'primary';
  open.textContent = l('Open', 'Mở');
  actions.append(cancel, open);
  popover.append(heading, destination, actions);
  document.body.append(popover);

  const rect = anchor.getBoundingClientRect();
  const width = 210;
  popover.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
  popover.style.top = `${Math.max(8, Math.min(rect.bottom - 6, window.innerHeight - popover.offsetHeight - 8))}px`;

  const close = () => {
    document.removeEventListener('pointerdown', onOutsidePointer);
    document.removeEventListener('keydown', onKeydown);
    popover.remove();
  };
  const onOutsidePointer = event => { if (!popover.contains(event.target)) close(); };
  const onKeydown = event => { if (event.key === 'Escape') close(); };
  cancel.onclick = close;
  open.onclick = event => {
    event.stopPropagation();
    close();
    void chrome.tabs.create({ url });
  };
  popover.onclick = event => event.stopPropagation();
  setTimeout(() => document.addEventListener('pointerdown', onOutsidePointer), 0);
  document.addEventListener('keydown', onKeydown);
  open.focus();
}

function updateSyncWarningBanner(syncStatus) {
  const banner = $('syncWarningBanner');
  if (banner) banner.classList.add('hidden');
}

function setAccountControls(isSignedIn) {
  $('profileButton').classList.toggle('hidden', !isSignedIn);
  $('headerScanButton').classList.toggle('hidden', !isSignedIn || !vaultUnlocked);
  $('lockButton').classList.toggle('hidden', !isSignedIn);
}

async function init() {
  const [page, s] = await Promise.all([
    activePageContext(),
    sendReadWithRetry({ type: 'STATUS' }, { attempts: 2, timeoutMs: 3000 })
  ]);
  currentOrigin = page?.origin || '';
  currentTabId = page?.tabId || null;

  signedIn = Boolean(s.ok && s.user);
  setAccountControls(signedIn);

  if (s.ok) {
    updateSyncWarningBanner(s.syncStatus);
    if (s.user) {
      updateProfileUI(s.user);
    }
    
    if (s.unlocked) {
      await showVault();
    } else {
      $('googleView').classList.toggle('hidden', signedIn);
      $('authView').classList.toggle('hidden', !signedIn);
      $('vaultView').classList.add('hidden');
      if (signedIn) authMode(s.exists, s.canCreate);
    }
  } else {
    $('googleView').classList.remove('hidden');
    $('authView').classList.add('hidden');
    $('vaultView').classList.add('hidden');
  }
  
  // Khởi tạo các trình lắng nghe sự kiện của Password Generator
  initGenerator();
  initPasswordToggles();
  if ($('optionsButton')) {
    $('optionsButton').onclick = () => chrome.runtime.openOptionsPage();
  }
}

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

function updateProfileUI(user) {
  const name = user.name || 'Google Account';
  const email = user.email || '';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'GA';
  
  $('profileButton').textContent = initials;
  $('pFirstName').textContent = name;
  $('pEmail').textContent = email || l('No email', 'Chưa có email');
}

function authMode(exists, canCreate = true) {
  vaultUnlocked = false;
  setAccountControls(signedIn);
  $('authView').classList.remove('hidden');
  $('vaultView').classList.add('hidden');
  const creationBlocked = !exists && canCreate === false;
  $('authTitle').textContent = exists
    ? t('unlockVaultHeader', 'Unlock Secure Vault')
    : creationBlocked
      ? t('cantCreateVault', 'Cannot Create Vault Yet')
      : t('createVaultHeader', 'Create Secure Vault');
  $('authHint').textContent = exists
    ? t('enterMasterPwd', 'Enter your master password to continue.')
    : creationBlocked
      ? t('firebaseCheckPending', 'Aegis has not finished checking Firebase data. Please try syncing again to avoid overwriting existing backup.')
      : t('createMasterPwdHint', 'Create a strong, unique master password with at least 6 characters.');
  $('authButton').textContent = exists
    ? t('unlockBtnText', 'Unlock →')
    : creationBlocked
      ? t('waitingFirebase', 'Waiting for Firebase')
      : t('createVaultBtn', 'Create Vault →');
  $('authButton').disabled = creationBlocked;
  $('masterPassword').disabled = creationBlocked;
  $('masterPassword').autocomplete = exists ? 'current-password' : 'new-password';
  $('confirmMasterGroup').classList.toggle('hidden', exists || creationBlocked);
  $('confirmMasterPassword').disabled = exists || creationBlocked;
  if (exists || creationBlocked) $('confirmMasterPassword').value = '';
  $('authButton').dataset.exists = String(exists);
}

function renderVaultLoading() {
  $('credentialList').classList.remove('hidden');
  $('identityTabContent').classList.add('hidden');
  $('generatorTabContent').classList.add('hidden');
  $('otpTabContent').classList.add('hidden');
  $('subTabs').classList.remove('hidden');
  $('credentialList').innerHTML = `
    <div class="vault-loading" role="status" aria-live="polite">
      <span>${t('openingVault', 'Opening Vault…')}</span>
      ${Array.from({ length: 5 }, () => `
        <div class="vault-loading-row" aria-hidden="true">
          <i></i><b></b><em></em>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLoadFailure(container, {
  className,
  title = '',
  message,
  buttonId,
  onRetry
}) {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  wrapper.setAttribute('role', 'alert');
  if (title) {
    const heading = document.createElement('strong');
    heading.textContent = title;
    wrapper.append(heading);
  }
  const detail = document.createElement('span');
  detail.textContent = message;
  const retryButton = document.createElement('button');
  retryButton.id = buttonId;
  retryButton.type = 'button';
  retryButton.textContent = l('Try again', 'Thử lại');
  retryButton.onclick = onRetry;
  wrapper.append(detail, retryButton);
  container.replaceChildren(wrapper);
}

async function showVault() {
  const loadGeneration = ++vaultLoadGeneration;
  vaultUnlocked = true;
  setAccountControls(signedIn);
  $('googleView').classList.add('hidden');
  $('authView').classList.add('hidden');
  $('vaultView').classList.remove('hidden');
  renderVaultLoading();
  const r = await sendReadWithRetry({ type: 'LIST' }, { attempts: 2, timeoutMs: 4000 });
  if (loadGeneration !== vaultLoadGeneration) return;
  if (r.ok) {
    credentials = Array.isArray(r.credentials) ? r.credentials : [];
    const otpResponse = await sendReadWithRetry({ type: 'OTP_LIST' }, { attempts: 2, timeoutMs: 4000 });
    if (loadGeneration !== vaultLoadGeneration) return;
    otpAccounts = otpResponse.ok && Array.isArray(otpResponse.otpAccounts) ? otpResponse.otpAccounts : [];
    render();
  } else {
    $('error').textContent = r.error;
    renderLoadFailure($('credentialList'), {
      className: 'vault-load-error',
      title: l('Vault data could not be loaded', 'Chưa tải được dữ liệu Vault'),
      message: r.error || l('Aegis has not responded yet.', 'Aegis chưa phản hồi.'),
      buttonId: 'vaultRetryBtn',
      onRetry: () => { void showVault(); }
    });
  }
}

let popupLoginTimer = null;
let popupLoginItem = null;

async function fillCredential(item) {
  const page = await activePageContext();
  if (!page || page.tabId !== currentTabId || page.origin !== currentOrigin) {
    alert(l('The open page has changed. Close and reopen Aegis Vault on the page you want to fill.', 'Trang đang mở đã thay đổi. Hãy đóng rồi mở lại Aegis Vault trên trang cần điền.'));
    return;
  }
  const res = await send({ type: 'FILL', id: item.id, origin: page.origin, tabId: page.tabId });
  if (!res.ok) return alert(res.error);
  const confirmedPage = await activePageContext();
  if (confirmedPage?.tabId !== page.tabId || confirmedPage.origin !== page.origin) return;
  try {
    await chrome.tabs.sendMessage(confirmedPage.tabId, {
      type: 'AEGIS_AUTOFILL', username: res.credential.username,
      password: res.credential.password, origin: confirmedPage.origin
    });
    window.close();
  } catch {
    alert(l('Could not connect to this page. Reload the page and try again.', 'Không thể kết nối với trang này. Hãy tải lại trang rồi thử lại.'));
  }
}

function closePopupLogin() {
  if (popupLoginTimer) clearInterval(popupLoginTimer);
  popupLoginTimer = null;
  popupLoginItem = null;
  $('popupLoginModal').classList.add('hidden');
}

async function openPopupLogin(item) {
  closePopupLogin();
  const detailResponse = await send({ type: 'GET_CREDENTIAL_DETAIL', id: item.id });
  if (!detailResponse.ok || !detailResponse.credential) {
    showOtpToast(detailResponse.error || 'Không đọc được thông tin tài khoản', 'error');
    return;
  }
  const detailedItem = detailResponse.credential;
  popupLoginItem = detailedItem;
  const password = detailedItem.password || '';
  $('popupLoginTitle').textContent = detailedItem.title || 'Không tiêu đề';
  $('popupLoginUsername').textContent = detailedItem.username || '—';
  $('popupLoginPassword').textContent = '•'.repeat(Math.max(password.length, 8));
  $('popupLoginEye').setAttribute('aria-pressed', 'false');
  if (!otpAccounts.length) {
    const response = await send({ type: 'OTP_LIST' });
    if (response.ok) otpAccounts = response.otpAccounts || [];
  }
  const normalizedTitle = String(item.title || '').trim().toLowerCase();
  const normalizedUsername = String(item.username || '').trim().toLowerCase();
  const otp = otpAccounts.find(value => value.id === detailedItem.otpId)
    || otpAccounts.find(value => (
      String(value.account || '').trim().toLowerCase() === normalizedUsername
      && String(value.issuer || '').trim().toLowerCase() === normalizedTitle
    ));
  $('popupLoginOtpRow').classList.toggle('hidden', !otp);
  const refreshOtp = async () => {
    if (!popupLoginItem || !otp) return;
    const configuredPeriod = Number(otp.period ?? 30);
    const period = Number.isInteger(configuredPeriod) && configuredPeriod >= 5 && configuredPeriod <= 300 ? configuredPeriod : 30;
    const remaining = period - (Math.floor(Date.now() / 1000) % period);
    $('popupLoginOtpIssuer').textContent = otp.issuer || otp.account || 'OTP';
    $('popupLoginOtpAccount').textContent = otp.account || '';
    $('popupLoginCountdown').textContent = remaining;
    $('popupLoginTimer').style.setProperty('--timer-angle', `${remaining / period * 360}deg`);
    $('popupLoginTimer').classList.toggle('expiring', remaining <= 5);
    try {
      $('popupLoginOtp').textContent = await generateTotp(otp);
      $('popupLoginOtp').classList.remove('invalid');
      $('popupLoginOtp').classList.toggle('expiring', remaining <= 5);
    } catch {
      $('popupLoginOtp').textContent = 'OTP không hợp lệ';
      $('popupLoginOtp').classList.add('invalid');
    }
  };
  if (otp) {
    await refreshOtp();
    popupLoginTimer = setInterval(refreshOtp, 1000);
  }
  $('popupLoginEye').onclick = () => {
    const visible = $('popupLoginEye').getAttribute('aria-pressed') === 'true';
    $('popupLoginPassword').textContent = visible ? '•'.repeat(Math.max(password.length, 8)) : password;
    $('popupLoginEye').setAttribute('aria-pressed', String(!visible));
  };
  const copyPopupValue = async (value, englishLabel, vietnameseLabel) => {
    const label = l(englishLabel, vietnameseLabel);
    try {
      await navigator.clipboard.writeText(value || '');
      showOtpToast(l(`Copied ${label}`, `Đã sao chép ${label}`), 'success');
    } catch {
      showOtpToast(l(`Could not copy ${label}`, `Không thể sao chép ${label}`), 'error');
    }
  };
  const copyPopupOtp = async () => {
    if ($('popupLoginOtp').classList.contains('invalid')) {
      showOtpToast('OTP không hợp lệ — hãy kiểm tra lại', 'error');
      return;
    }
    await copyPopupValue($('popupLoginOtp').textContent, 'OTP code', 'mã OTP');
  };
  $('popupCopyUsername').onclick = () => { void copyPopupValue(detailedItem.username, 'username', 'tên đăng nhập'); };
  $('popupCopyPassword').onclick = () => { void copyPopupValue(password, 'password', 'mật khẩu'); };
  $('popupLoginOtpRow').onclick = () => { void copyPopupOtp(); };
  $('popupLoginModal').classList.remove('hidden');
}

$('popupLoginClose').onclick = closePopupLogin;
$('popupLoginModal').onclick = event => { if (event.target === $('popupLoginModal')) closePopupLogin(); };

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
    container.classList.add('hidden'); $('identityTabContent').classList.remove('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.add('hidden'); stopOtpTimer(); return;
  }
  if (activeMainTab === 'generator') {
    container.classList.add('hidden'); $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.remove('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.add('hidden'); stopOtpTimer(); generatePassword(); return;
  }
  if (activeMainTab === 'otp') {
    container.classList.add('hidden'); $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.remove('hidden'); $('subTabs').classList.add('hidden'); renderOtpLoading(); void loadOtp(); return;
  }
  container.classList.remove('hidden');
  $('identityTabContent').classList.add('hidden'); $('generatorTabContent').classList.add('hidden'); $('otpTabContent').classList.add('hidden'); $('subTabs').classList.remove('hidden'); stopOtpTimer();

  if (!list.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">${l('No accounts found.', 'Không có tài khoản nào được tìm thấy.')}</div>`;
    return;
  }

  container.replaceChildren(...list.map(item => {
    const el = document.createElement('div');
    el.className = 'list-item';
    
    const icon = document.createElement('div');
    icon.className = 'list-icon';
    icon.style.display = 'grid';
    icon.style.placeItems = 'center';
    
    setSiteIcon(icon, item.url || item.origins?.[0]);
    
    const info = document.createElement('div');
    info.className = 'list-info';
    const title = document.createElement('h4');
    title.textContent = item.title;
    const user = document.createElement('p');
    user.textContent = item.username;
    info.append(title, user);
    
    const menuBtn = document.createElement('button');
    menuBtn.className = 'list-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.title = l('Details / Manage', 'Chi tiết / Quản lý');
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.openOptionsPage();
    };

    el.append(icon, info, menuBtn);
    
    el.onclick = () => { void openPopupLogin(item); };
    el.oncontextmenu = event => {
      event.preventDefault();
      event.stopPropagation();
      const url = getSafeWebUrl(item.url || item.origins?.[0]);
      if (url) showOpenLinkPopover(el, url);
    };
    el.title = l('Click to view details · Right-click to open website', 'Nhấp để xem thông tin · Nhấp chuột phải để mở website');
    
    return el;
  }));
}

// Google Auth Action
$('googleButton').onclick = async () => {
  $('googleError').textContent = '';
  const r = await send({ type: 'GOOGLE_SIGN_IN' });
  if (r.ok) {
    signedIn = true;
    updateProfileUI(r.user);
    setAccountControls(true);
    $('googleView').classList.add('hidden');
    const s = await sendReadWithRetry({ type: 'STATUS' }, { attempts: 2, timeoutMs: 3000 });
    if (s.ok) authMode(s.exists, s.canCreate);
    else $('googleError').textContent = s.error;
  } else {
    signedIn = false;
    setAccountControls(false);
    $('googleError').textContent = r.error;
  }
};

// Vault Auth Action
$('authButton').onclick = async () => {
  $('error').textContent = '';
  const password = $('masterPassword').value;
  const type = $('authButton').dataset.exists === 'true' ? 'UNLOCK' : 'CREATE';

  if (!password) {
    $('error').textContent = '⚠️ Vui lòng nhập mật khẩu chính.';
    return;
  }

  if (type === 'CREATE') {
    if (password.length < 6) {
      $('error').textContent = '⚠️ Mật khẩu chính phải có ít nhất 6 ký tự.';
      return;
    }
    const confirmPassword = $('confirmMasterPassword').value;
    if (!confirmPassword) {
      $('error').textContent = '⚠️ Vui lòng nhập lại mật khẩu chính để xác nhận.';
      return;
    }
    if (password !== confirmPassword) {
      $('error').textContent = '❌ Mật khẩu chính và Nhập lại mật khẩu không trùng khớp nhau!';
      return;
    }
  }

  const btn = $('authButton');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = type === 'CREATE' ? '⏳ Đang khởi tạo kho bảo mật…' : '⏳ Đang kiểm tra & mở khóa…';

  try {
    const r = await send({ type, password });
    if (r.ok) {
      await showVault();
    } else {
      btn.disabled = false;
      btn.textContent = originalText;
      if (r.error && (r.error.includes('decryption') || r.error.includes('Decryption') || r.error.includes('decrypt'))) {
        $('error').textContent = '❌ Mật khẩu không đúng. Vui lòng thử lại.';
      } else {
        $('error').textContent = '❌ ' + (r.error || 'Mở khóa thất bại. Vui lòng thử lại.');
      }
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    $('error').textContent = '❌ ' + (err?.message || 'Có lỗi xảy ra.');
  }
};

$('masterPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('authButton').click();
});
$('confirmMasterPassword').addEventListener('keydown', e => {
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
let profileSignOutConfirm = false;
let profileSignOutTimer = null;
$('profileSignOutBtn').onclick = async () => {
  if (!profileSignOutConfirm) {
    profileSignOutConfirm = true;
    $('profileSignOutBtn').textContent = 'Xác nhận đăng xuất?';
    $('profileSignOutBtn').style.background = 'rgba(244,63,94,.15)';
    profileSignOutTimer = setTimeout(() => {
      profileSignOutConfirm = false;
      $('profileSignOutBtn').textContent = 'Đăng xuất Google';
      $('profileSignOutBtn').style.background = 'rgba(244,63,94,.05)';
    }, 3000);
  } else {
    clearTimeout(profileSignOutTimer);
    setAccountControls(false);
    await send({ type: 'GOOGLE_SIGN_OUT' });
    location.reload();
  }
};

// Đăng nhập tài khoản Google khác từ màn hình khóa
let authSignOutConfirm = false;
let authSignOutTimer = null;
$('authSignOutBtn').onclick = async (e) => {
  e.preventDefault();
  if (!authSignOutConfirm) {
    authSignOutConfirm = true;
    $('authSignOutBtn').textContent = 'Xác nhận đăng xuất tài khoản?';
    authSignOutTimer = setTimeout(() => {
      authSignOutConfirm = false;
      $('authSignOutBtn').textContent = 'Đăng nhập tài khoản Google khác';
    }, 3000);
  } else {
    clearTimeout(authSignOutTimer);
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
  
  $('genCopyBtn').onclick = async () => {
    const text = $('genPasswordDisplay').value;
    const button = $('genCopyBtn');
    const status = $('genCopyStatus');
    clearTimeout(button.resetTimer);
    status.classList.remove('error');
    if (!text || !selectedPasswordClasses().length) {
      status.classList.add('error');
      status.textContent = 'Hãy chọn ít nhất một nhóm ký tự.';
      return;
    }
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      button.textContent = 'Đã chép';
      status.textContent = 'Mật khẩu đã được sao chép.';
    } catch {
      button.textContent = 'Thử lại';
      status.classList.add('error');
      status.textContent = 'Chrome không cho phép sao chép. Hãy chọn mật khẩu và sao chép thủ công.';
    } finally {
      button.disabled = false;
      button.resetTimer = setTimeout(() => {
        button.textContent = 'Sao chép';
      }, 1400);
    }
  };
}

const PASSWORD_CHARACTER_CLASSES = [
  { id: 'genUpper', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { id: 'genLower', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { id: 'genNumbers', chars: '0123456789' },
  { id: 'genSymbols', chars: '!@#$%^&*()_+-=[]{}|;:,.<>?' }
];

function selectedPasswordClasses() {
  return PASSWORD_CHARACTER_CLASSES
    .filter(group => $(group.id).checked)
    .map(group => group.chars);
}

function cryptoRandomIndex(size) {
  if (!Number.isInteger(size) || size < 1 || size > 0x100000000) {
    throw new RangeError('Kích thước tập ký tự không hợp lệ.');
  }
  const range = 0x100000000;
  const limit = Math.floor(range / size) * size;
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % size;
}

function secureShuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = cryptoRandomIndex(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function generatePassword() {
  const length = Number.parseInt($('genLength').value, 10);
  const classes = selectedPasswordClasses();
  const status = $('genCopyStatus');
  status.textContent = '';
  status.classList.remove('error');

  if (!classes.length) {
    $('genPasswordDisplay').value = 'Chọn ít nhất 1 loại ký tự';
    return;
  }

  if (length < classes.length) {
    $('genPasswordDisplay').value = '';
    status.classList.add('error');
    status.textContent = `Độ dài phải từ ${classes.length} ký tự để chứa đủ các nhóm đã chọn.`;
    return;
  }

  const allCharacters = classes.join('');
  const password = classes.map(characters => characters[cryptoRandomIndex(characters.length)]);
  while (password.length < length) {
    password.push(allCharacters[cryptoRandomIndex(allCharacters.length)]);
  }
  $('genPasswordDisplay').value = secureShuffle(password).join('');
}

$('profileButton').onclick = () => {
  mainTabs.forEach(t => $(t.id).classList.remove('active'));
  activeMainTab = 'profile'; render();
};

async function loadOtp() {
  const response = await sendReadWithRetry({ type: 'OTP_LIST' }, { attempts: 2, timeoutMs: 4000 });
  if (!response.ok) {
    renderLoadFailure($('otpList'), {
      className: 'otp-load-error',
      message: response.error || 'Không tải được danh sách OTP.',
      buttonId: 'otpRetryBtn',
      onRetry: () => { renderOtpLoading(); void loadOtp(); }
    });
    return;
  }
  otpAccounts = Array.isArray(response.otpAccounts) ? response.otpAccounts : [];
  await renderOtp();
  if (!otpTimer) otpTimer = setInterval(renderOtp, 1000);
}

function renderOtpLoading() {
  $('otpList').innerHTML = `
    <div class="otp-loading" role="status" aria-live="polite">
      <span>Đang tải mã OTP…</span>
      <i></i><i></i><i></i>
    </div>
  `;
}

function showOtpToast(message, tone = '') {
  const toast = $('otpCopyToast');
  toast.textContent = message;
  if (tone) toast.dataset.tone = tone;
  else delete toast.dataset.tone;
  toast.classList.add('show');
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function stopOtpTimer() { if (otpTimer) clearInterval(otpTimer); otpTimer = null; }
async function renderOtp() {
  if (activeMainTab !== 'otp' || isOtpDragging) return;
  const renderGeneration = ++otpRenderGeneration;
  const q = $('searchInput').value.toLowerCase();
  const list = otpAccounts.filter(item => `${item.issuer} ${item.account}`.toLowerCase().includes(q));
  if (!list.length) {
    $('otpList').innerHTML = `<div style="padding:28px;text-align:center;color:#86868b;font-size:12px">${l('No OTP codes yet. Select Add code to get started.', 'Chưa có mã OTP. Chọn “Thêm mã” để bắt đầu.')}</div>`;
    return;
  }
  const nodes = await Promise.all(list.map(async item => {
    const card = document.createElement('article'); card.className = 'otp-card'; card.draggable = true; card.dataset.id = item.id;
    if (recentlySavedOtp?.id === item.id) card.classList.add('just-saved');
    const issuer = document.createElement('div'); issuer.className = 'otp-issuer'; issuer.textContent = item.issuer || item.account;
    const code = document.createElement('div'); code.className = 'otp-code';
    let otpValid = true;
    const configuredPeriod = Number(item.period ?? 30);
    const displayPeriod = Number.isInteger(configuredPeriod) && configuredPeriod >= 5 && configuredPeriod <= 300 ? configuredPeriod : 30;
    try {
      const configuredDigits = Number(item.digits ?? 6);
      const configuredAlgorithm = String(item.algorithm || 'SHA1').toUpperCase().replace('-', '');
      if (!Number.isInteger(configuredPeriod) || configuredPeriod < 5 || configuredPeriod > 300
        || ![6, 7, 8].includes(configuredDigits)
        || !['SHA1', 'SHA256', 'SHA512'].includes(configuredAlgorithm)) {
        throw new Error('Thông số OTP không hợp lệ.');
      }
      code.textContent = await generateTotp(item);
    } catch {
      otpValid = false;
      code.textContent = 'OTP không hợp lệ';
      code.classList.add('invalid');
      code.setAttribute('aria-label', 'Mã OTP không hợp lệ. Chọn nút sửa để kiểm tra lại secret và thông số.');
    }
    const account = document.createElement('div'); account.className = 'otp-account'; account.textContent = item.account || '';
    const side = document.createElement('div'); side.className = 'otp-side';
    const tools = document.createElement('div'); tools.className = 'otp-card-tools';
    const dragHandle = document.createElement('button'); dragHandle.type = 'button'; dragHandle.className = 'otp-icon-btn otp-drag-btn'; dragHandle.title = 'Kéo để đổi thứ tự'; dragHandle.setAttribute('aria-label', `Kéo ${item.issuer || item.account} để đổi thứ tự`); dragHandle.textContent = '⠿';
    const qrButton = document.createElement('button'); qrButton.type = 'button'; qrButton.className = 'otp-icon-btn otp-qr-btn'; qrButton.title = 'Hiển thị QR để quét'; qrButton.setAttribute('aria-label', `Hiển thị QR cho ${item.issuer || item.account}`); qrButton.textContent = '▦';
    const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'otp-icon-btn'; editButton.title = 'Sửa hoặc xóa OTP'; editButton.setAttribute('aria-label', `Sửa ${item.issuer || item.account}`); editButton.textContent = '✎';
    if (!otpValid) {
      qrButton.disabled = true;
      qrButton.title = 'Sửa OTP trước khi tạo mã QR';
      qrButton.setAttribute('aria-label', 'Không thể tạo QR vì OTP không hợp lệ');
    }
    tools.append(dragHandle, qrButton, editButton);
    const timer = document.createElement('span'); timer.className = 'otp-timer'; timer.title = `${displayPeriod} giây mỗi mã`;
    const seconds = document.createElement('span'); timer.append(seconds);
    side.append(tools, timer);
    const remaining = displayPeriod - (Math.floor(Date.now()/1000) % displayPeriod);
    seconds.textContent = remaining;
    code.classList.toggle('expiring', remaining <= 5);
    timer.classList.toggle('expiring', remaining <= 5);
    timer.style.setProperty('--timer-angle', `${remaining / displayPeriod * 360}deg`);
    card.append(issuer, code, account, side);
    dragHandle.onclick = event => event.stopPropagation();
    dragHandle.onpointerdown = event => {
      event.stopPropagation();
      otpDragArmedId = item.id;
    };
    card.onpointerdown = event => {
      if (!event.target.closest('.otp-drag-btn')) otpDragArmedId = null;
    };
    qrButton.onclick = event => { event.stopPropagation(); showOtpQr(item); };
    editButton.onclick = event => { event.stopPropagation(); openOtpEditor(item); };
    card.onclick = async () => {
      if (!otpValid) {
        showOtpToast('OTP không hợp lệ — hãy kiểm tra lại', 'error');
      } else {
        try {
          await navigator.clipboard.writeText(code.textContent);
          showOtpToast('Đã sao chép mã OTP', 'success');
        } catch {
          showOtpToast('Không thể sao chép mã OTP', 'error');
        }
      }
    };
    card.ondragstart = event => {
      if (otpDragArmedId !== item.id) {
        event.preventDefault();
        return;
      }
      isOtpDragging = true;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
      }
      requestAnimationFrame(() => card.classList.add('dragging'));
    };
    card.ondragover = event => {
      if (!isOtpDragging) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const dragging = $('otpList').querySelector('.dragging');
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      card.parentNode.insertBefore(dragging, event.clientY < rect.top + rect.height / 2 ? card : card.nextSibling);
    };
    card.ondrop = event => event.preventDefault();
    card.ondragend = async () => {
      if (!isOtpDragging) return;
      card.classList.remove('dragging');
      const visibleIds = [...$('otpList').querySelectorAll('.otp-card')].map(element => element.dataset.id);
      let cursor = 0;
      const visibleSet = new Set(visibleIds);
      const ids = otpAccounts.map(account => visibleSet.has(account.id) ? visibleIds[cursor++] : account.id);
      const unchanged = ids.every((id, index) => id === otpAccounts[index]?.id);
      try {
        if (!unchanged) {
          const response = await send({ type: 'OTP_REORDER', ids });
          if (response.ok) {
            otpAccounts = Array.isArray(response.otpAccounts)
              ? response.otpAccounts
              : ids.map(id => otpAccounts.find(account => account.id === id)).filter(Boolean);
          } else {
            showOtpToast(response.error || 'Không thể lưu thứ tự OTP', 'error');
          }
        }
      } finally {
        otpDragArmedId = null;
        isOtpDragging = false;
        await renderOtp();
      }
    };
    return card;
  }));
  if (
    renderGeneration !== otpRenderGeneration
    || isOtpDragging
    || activeMainTab !== 'otp'
  ) return;
  $('otpList').replaceChildren(...nodes);
  if (recentlySavedOtp && !recentlySavedOtpShown) {
    const savedCard = [...$('otpList').querySelectorAll('.otp-card')]
      .find(card => card.dataset.id === recentlySavedOtp.id);
    if (savedCard) {
      recentlySavedOtpShown = true;
      requestAnimationFrame(() => savedCard.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      const label = recentlySavedOtp.issuer || recentlySavedOtp.account || 'OTP';
      showOtpToast(
        recentlySavedOtp.duplicate
          ? `${label} đã có trong danh sách OTP`
          : `Đã lưu ${label} vào danh sách OTP`,
        'success'
      );
      setTimeout(() => {
        recentlySavedOtp = null;
        savedCard.classList.remove('just-saved');
      }, 4000);
    }
  }
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
  $('otpAlgorithm').value = 'SHA1';
  $('otpDigits').value = '6';
  $('otpPeriod').value = '30';
  $('otpDialogTitle').textContent = 'Thêm mã xác thực';
  $('otpDeleteBtn').classList.remove('visible');
  $('otpDeleteConfirm').classList.add('hidden');
  $('otpDeleteCancelBtn').disabled = false;
  $('otpDeleteConfirmBtn').disabled = false;
  $('otpDeleteConfirmBtn').textContent = 'Đồng ý xóa';
  $('otpFormStatus').textContent = '';
  $('otpFormError').textContent = '';
  setOtpEditorBusy(false);
}
function openOtpEditor(item = null) {
  resetOtpEditor();
  if (item) {
    $('otpEditId').value = item.id;
    $('otpIssuer').value = item.issuer || '';
    $('otpAccount').value = item.account || '';
    $('otpSecret').value = item.secret || '';
    $('otpAlgorithm').value = String(item.algorithm || 'SHA1').toUpperCase().replace('-', '');
    $('otpDigits').value = String(item.digits || 6);
    $('otpPeriod').value = String(item.period || 30);
    try {
      $('otpUri').value = serializeOtpAuthUri(item);
    } catch {
      $('otpUri').value = '';
    }
    $('otpDialogTitle').textContent = 'Sửa mã xác thực';
    $('otpDeleteBtn').classList.add('visible');
  }
  $('otpModal').classList.remove('hidden');
}
function closeOtpModal(){
  resetOtpEditor();
  $('otpModal').classList.add('hidden');
  if (activeMainTab === 'otp' && !otpTimer) {
    otpTimer = setInterval(renderOtp, 1000);
    void renderOtp();
  }
}
const headerScanButton = $('headerScanButton');
function setHeaderScanMenu(open) {
  $('headerScanMenu').classList.toggle('hidden', !open);
  headerScanButton.setAttribute('aria-expanded', String(open));
}
if (headerScanButton) headerScanButton.onclick = event => {
  event.stopPropagation();
  setHeaderScanMenu($('headerScanMenu').classList.contains('hidden'));
};
$('scanScreenMenuBtn').onclick = () => {
  setHeaderScanMenu(false);
  void scanVisibleTabForOtp($('scanScreenMenuBtn'));
};
$('scanImportMenuBtn').onclick = () => {
  setHeaderScanMenu(false);
  $('headerQrFile').click();
};
document.addEventListener('click', event => {
  if (!event.target.closest('.scan-menu-wrap')) setHeaderScanMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setHeaderScanMenu(false);
});
const otpCancelButton = $('otpCancelBtn');
if (otpCancelButton) otpCancelButton.onclick = closeOtpModal;
const otpSaveButton = $('otpSaveBtn');
function setOtpEditorBusy(busy) {
  otpSaveInFlight = busy;
  const saveButton = $('otpSaveBtn');
  saveButton.disabled = busy;
  saveButton.setAttribute('aria-busy', String(busy));
  saveButton.textContent = busy ? 'Đang lưu…' : 'Lưu OTP';
  ['otpCancelBtn', 'otpCameraBtn', 'otpImageBtn', 'otpDeleteBtn'].forEach(id => {
    $(id).disabled = busy;
  });
}
if (otpSaveButton) otpSaveButton.onclick = async () => {
  if (otpSaveInFlight) return;
  const uri = $('otpUri').value.trim();
  if (uri && !applyOtpUriToEditor(uri, true)) return;

  const payload = {
    type: 'OTP_SAVE',
    id: $('otpEditId').value,
    issuer: $('otpIssuer').value.trim(),
    account: $('otpAccount').value.trim(),
    secret: $('otpSecret').value.trim(),
    algorithm: $('otpAlgorithm').value,
    digits: Number($('otpDigits').value),
    period: Number($('otpPeriod').value)
  };
  setOtpEditorBusy(true);
  $('otpFormError').textContent = '';
  $('otpFormStatus').textContent = 'Đang mã hóa và lưu an toàn trên máy…';
  const response = await send(payload);
  if (!response.ok) {
    setOtpEditorBusy(false);
    $('otpFormStatus').textContent = '';
    $('otpFormError').textContent = response.error;
    return;
  }

  if (Array.isArray(response.otpAccounts)) {
    otpAccounts = response.otpAccounts;
  } else {
    const refreshed = await send({ type: 'OTP_LIST' });
    if (refreshed.ok) otpAccounts = refreshed.otpAccounts || [];
  }

  const syncState = String(response.syncStatus?.state || '').toLowerCase();
  closeOtpModal();
  if (syncState && syncState !== 'synced') {
    showOtpToast('Đã lưu OTP · đang tự đồng bộ Firebase', 'success');
  } else {
    showOtpToast(
      syncState === 'synced' ? 'Đã lưu OTP và đồng bộ Firebase' : 'Đã lưu OTP',
      'success'
    );
  }
  void renderOtp();
  if (!otpTimer) otpTimer = setInterval(renderOtp, 1000);
};
const otpDeleteButton = $('otpDeleteBtn');
if (otpDeleteButton) otpDeleteButton.onclick = () => {
  const id = $('otpEditId').value;
  if (!id) return;
  otpDeleteButton.classList.remove('visible');
  $('otpDeleteConfirm').classList.remove('hidden');
};
$('otpDeleteCancelBtn').onclick = () => {
  $('otpDeleteConfirm').classList.add('hidden');
  if ($('otpEditId').value) otpDeleteButton.classList.add('visible');
};
$('otpDeleteConfirmBtn').onclick = async () => {
  const id = $('otpEditId').value;
  if (!id) return;
  const previousAccounts = otpAccounts;
  const deleteButton = $('otpDeleteConfirmBtn');
  deleteButton.disabled = true;
  $('otpDeleteCancelBtn').disabled = true;
  deleteButton.textContent = 'Đang xóa…';

  otpAccounts = otpAccounts.filter(item => item.id !== id);
  closeOtpModal();
  void renderOtp();
  showOtpToast('Đã xóa OTP trên máy', 'success');

  const response = await send({ type: 'OTP_DELETE', id });
  if (!response.ok) {
    otpAccounts = previousAccounts;
    void renderOtp();
    showOtpToast(response.error || 'Không xóa được mã OTP', 'error');
    return;
  }
  if (Array.isArray(response.otpAccounts)) {
    otpAccounts = response.otpAccounts;
    void renderOtp();
  }
  const syncState = String(response.syncStatus?.state || '').toLowerCase();
  if (syncState && syncState !== 'synced') {
    showOtpToast('Đã xóa OTP · đang tự đồng bộ Firebase', 'success');
  } else {
    showOtpToast('Đã xóa mã OTP', 'success');
  }
};
function applyOtpUriToEditor(value, showError = false) {
  try {
    const parsed = parseOtpAuthUri(value);
    applyingOtpUri = true;
    $('otpUri').value = value;
    $('otpIssuer').value = parsed.issuer;
    $('otpAccount').value = parsed.account;
    $('otpSecret').value = parsed.secret;
    $('otpAlgorithm').value = parsed.algorithm;
    $('otpDigits').value = String(parsed.digits);
    $('otpPeriod').value = String(parsed.period);
    $('otpFormError').textContent = '';
    return true;
  } catch (error) {
    if (showError) $('otpFormError').textContent = error.message;
    return false;
  } finally {
    applyingOtpUri = false;
  }
}

$('otpUri').addEventListener('input', () => {
  const value = $('otpUri').value.trim();
  if (value) applyOtpUriToEditor(value);
});

['otpIssuer', 'otpAccount', 'otpSecret', 'otpAlgorithm', 'otpDigits', 'otpPeriod'].forEach(id => {
  $(id).addEventListener(id === 'otpAlgorithm' || id === 'otpDigits' ? 'change' : 'input', () => {
    if (!applyingOtpUri) $('otpUri').value = '';
  });
});

function acceptQr(value){
  if (applyOtpUriToEditor(value, true)) {
    $('otpDialogTitle').textContent = 'Đã quét được mã OTP';
    $('otpFormStatus').textContent = 'Đã nhận diện QR. Kiểm tra thông tin rồi bấm Lưu OTP.';
    showOtpToast('Đã nhận diện mã QR', 'success');
    return true;
  }
  return false;
}
function makeQrImageData(source, maxWidth = 1200) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return null;
  const scale = Math.min(1, maxWidth / width);
  const drawnWidth = Math.max(1, Math.round(width * scale));
  const drawnHeight = Math.max(1, Math.round(height * scale));
  const padding = Math.max(12, Math.round(Math.min(drawnWidth, drawnHeight) * 0.06));
  const canvas = document.createElement('canvas');
  canvas.width = drawnWidth + padding * 2;
  canvas.height = drawnHeight + padding * 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, padding, padding, drawnWidth, drawnHeight);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
function makeHighContrastQrImage(image) {
  const output = new Uint8ClampedArray(image.data);
  let darkest = 255;
  let lightest = 0;
  for (let index = 0; index < output.length; index += 4) {
    const luminance = output[index] * .299 + output[index + 1] * .587 + output[index + 2] * .114;
    darkest = Math.min(darkest, luminance);
    lightest = Math.max(lightest, luminance);
  }
  const threshold = darkest + (lightest - darkest) * .56;
  for (let index = 0; index < output.length; index += 4) {
    const luminance = output[index] * .299 + output[index + 1] * .587 + output[index + 2] * .114;
    const value = luminance < threshold ? 0 : 255;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return new ImageData(output, image.width, image.height);
}
async function decodeQrFromSource(source, maxWidth = 1200) {
  if (typeof jsQR !== 'function') throw new Error('Bộ nhận diện QR chưa sẵn sàng.');
  const image = makeQrImageData(source, maxWidth);
  if (!image) return null;
  let result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  if (result?.data) return result;
  await new Promise(resolve => requestAnimationFrame(resolve));
  const contrasted = makeHighContrastQrImage(image);
  result = jsQR(contrasted.data, contrasted.width, contrasted.height, {
    inversionAttempts: 'dontInvert'
  });
  return result;
}
$('otpImageBtn').onclick=()=>$('otpQrFile').click();
$('otpQrFile').onchange = async event => {
  let bitmap;
  try {
    const file = event.target.files[0];
    if (!file) return;
    $('otpFormStatus').textContent = 'Đang nhận diện ảnh QR…';
    bitmap = await createImageBitmap(file);
    const result = await decodeQrFromSource(bitmap);
    if (result?.data) acceptQr(result.data);
    else {
      $('otpFormStatus').textContent = '';
      $('otpFormError').textContent = 'Không tìm thấy QR trong ảnh. Hãy chọn ảnh rõ và không bị cắt.';
    }
  } catch (error) {
    $('otpFormStatus').textContent = '';
    $('otpFormError').textContent = `Không đọc được ảnh QR: ${error.message}`;
  }
  finally {
    bitmap?.close();
    event.target.value = '';
  }
};

async function saveImportedQr(uri) {
  const response = await send({ type: 'SAVE_QR_URI', uri });
  if (!response.ok) throw new Error(response.error || 'Không tự lưu được mã OTP.');
  activeMainTab = 'otp';
  mainTabs.forEach(tab => $(tab.id).classList.toggle('active', tab.key === 'otp'));
  if (Array.isArray(response.otpAccounts)) otpAccounts = response.otpAccounts;
  render();
  showOtpToast(
    response.duplicate ? 'Mã OTP này đã có trong Vault' : 'Đã quét xong và tự lưu OTP',
    'success'
  );
}

$('headerQrFile').onchange = async event => {
  let bitmap;
  try {
    const file = event.target.files[0];
    if (!file) return;
    showOtpToast('Đang nhận diện ảnh QR…');
    bitmap = await createImageBitmap(file);
    const result = await decodeQrFromSource(bitmap);
    if (!result?.data) {
      throw new Error('Không nhận diện được QR trong ảnh đã chọn.');
    }
    await saveImportedQr(result.data);
  } catch (error) {
    showOtpToast(error?.message || 'Không import được ảnh QR.', 'error');
  } finally {
    bitmap?.close();
    event.target.value = '';
  }
};

async function scanVisibleTabForOtp(sourceButton = $('otpCameraBtn')) {
  if (screenScanInFlight || otpSaveInFlight) return;
  screenScanInFlight = true;
  const scanButton = sourceButton;
  const originalLabel = scanButton.textContent;
  scanButton.disabled = true;
  scanButton.textContent = 'Đang mở…';
  $('otpFormError').textContent = '';
  $('otpFormStatus').textContent = 'Đang mở công cụ khoanh vùng trên trang…';

  try {
    const page = await activePageContext();
    if (!page) {
      throw new Error('Không xác định được trang cần quét.');
    }
    if (typeof chrome?.scripting?.executeScript !== 'function') {
      throw new Error('Trình duyệt không hỗ trợ công cụ khoanh vùng QR.');
    }
    await chrome.scripting.executeScript({
      target: { tabId: page.tabId },
      files: ['src/vendor/jsqr.js', 'src/content/qr-selector.js']
    });
    window.close();
  } catch (error) {
    $('otpFormStatus').textContent = '';
    $('otpFormError').textContent = /Cannot access|không thể truy cập/i.test(String(error?.message || ''))
      ? 'Trình duyệt không cho phép khoanh vùng trên trang hệ thống này.'
      : error?.message || 'Không thể mở công cụ khoanh vùng QR.';
  } finally {
    screenScanInFlight = false;
    if (!otpSaveInFlight) {
      scanButton.disabled = false;
      scanButton.textContent = originalLabel;
    }
  }
}
const otpCameraButton = $('otpCameraBtn');
if (otpCameraButton) otpCameraButton.onclick = scanVisibleTabForOtp;
const advancedSettingsButton = $('advancedSettingsBtn');
if (advancedSettingsButton) advancedSettingsButton.onclick = async () => { await send({ type: 'OPEN_OPTIONS' }); window.close(); };
window.addEventListener('unload',()=>{stopOtpTimer();});

function updateLangUI(lang) {
  activeLanguage = lang === 'vi' ? 'vi' : 'en';
  const langBtn = $('langButton');
  if (langBtn) langBtn.textContent = lang === 'en' ? '🇬🇧' : '🇻🇳';
  const viBtn = $('langViBtn');
  if (viBtn) viBtn.classList.toggle('active', lang === 'vi');
  const enBtn = $('langEnBtn');
  if (enBtn) enBtn.classList.toggle('active', lang === 'en');
  translateDocument();

  const authBtn = $('authButton');
  if (authBtn && authBtn.dataset.exists !== undefined) {
    const exists = authBtn.dataset.exists === 'true';
    authMode(exists, !authBtn.disabled);
  }
  if (!$('vaultView').classList.contains('hidden')) render();
}

function initLanguageUI() {
  const langButton = $('langButton');
  const langMenu = $('langMenu');
  if (langButton && langMenu) {
    langButton.onclick = (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('hidden');
    };

    const viBtn = $('langViBtn');
    if (viBtn) {
      viBtn.onclick = async (e) => {
        e.stopPropagation();
        langMenu.classList.add('hidden');
        const newLang = await setLanguage('vi');
        updateLangUI(newLang);
      };
    }

    const enBtn = $('langEnBtn');
    if (enBtn) {
      enBtn.onclick = async (e) => {
        e.stopPropagation();
        langMenu.classList.add('hidden');
        const newLang = await setLanguage('en');
        updateLangUI(newLang);
      };
    }

    document.addEventListener('click', () => {
      langMenu.classList.add('hidden');
    });
  }
}

async function bootPopup() {
  try {
    const currentLang = await i18nInit(updateLangUI);
    initLanguageUI();
    updateLangUI(currentLang);

    const requestedTab = await chrome.storage.session.get([
      OPEN_OTP_TAB_SESSION_KEY,
      LAST_QR_SAVED_SESSION_KEY
    ]);
    recentlySavedOtp = requestedTab[LAST_QR_SAVED_SESSION_KEY] || null;
    if (requestedTab[OPEN_OTP_TAB_SESSION_KEY]) {
      await chrome.storage.session.remove([
        OPEN_OTP_TAB_SESSION_KEY,
        LAST_QR_SAVED_SESSION_KEY
      ]);
      activeMainTab = 'otp';
      mainTabs.forEach(tab => $(tab.id).classList.toggle('active', tab.key === 'otp'));
    }
    await init();
  } catch (error) {
    $('authView').classList.add('hidden');
    $('vaultView').classList.add('hidden');
    $('googleView').classList.remove('hidden');
    $('googleError').textContent = error?.message || l('Aegis Vault could not open. Close and reopen the extension.', 'Không mở được Aegis Vault. Hãy đóng rồi mở lại extension.');
  } finally {
    $('bootView').classList.add('hidden');
  }
}

void bootPopup();

