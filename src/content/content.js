(() => {
  'use strict';

  const PAGE_ORIGIN = location.origin;
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const loopbackHosts = new Set(['localhost', 'localhost.', '127.0.0.1', '[::1]', '::1']);
  if (location.protocol === 'http:' && !loopbackHosts.has(location.hostname.toLowerCase())) return;

  const SHADOW_STYLES = `
    :host {
      all: initial;
      color-scheme: dark;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    .layer {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      overflow: visible;
      pointer-events: none;
      z-index: 2147483647;
      font: 500 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #f8fafc;
    }
    button, input {
      font: inherit;
    }
    .icon {
      position: fixed;
      z-index: 2;
      width: 20px;
      height: 20px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      cursor: pointer;
      display: grid;
      place-items: center;
      pointer-events: auto;
    }
    .icon img {
      display: block;
      width: 20px;
      height: 20px;
      object-fit: contain;
      pointer-events: none;
    }
    .icon:hover {
      filter: brightness(1.08);
    }
    .icon:focus-visible,
    .menu button:focus-visible,
    .banner button:focus-visible,
    .banner input:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 2px;
    }
    .menu {
      position: fixed;
      z-index: 3;
      min-width: 220px;
      max-width: min(360px, calc(100vw - 16px));
      max-height: min(360px, calc(100vh - 16px));
      overflow: auto;
      padding: 8px;
      border: 1px solid rgba(59, 130, 246, 0.34);
      border-radius: 12px;
      background: rgba(17, 24, 39, 0.97);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.52);
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: auto;
    }
    .menu button {
      width: 100%;
      margin: 0;
      padding: 9px 12px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
      white-space: normal;
    }
    .menu button:hover {
      background: rgba(59, 130, 246, 0.16);
      color: #7dd3fc;
    }
    .menu .message {
      color: #cbd5e1;
      cursor: default;
      text-align: center;
    }
    .menu .message:hover {
      background: transparent;
      color: #cbd5e1;
    }
    .primary-line {
      display: block;
      color: #f8fafc;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .secondary-line {
      display: block;
      margin-top: 2px;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .banner {
      position: fixed;
      z-index: 4;
      top: 20px;
      right: 20px;
      width: min(320px, calc(100vw - 32px));
      padding: 16px;
      border: 1px solid rgba(59, 130, 246, 0.34);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.97);
      box-shadow: 0 20px 42px rgba(0, 0, 0, 0.58);
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      animation: slide-in 180ms ease-out;
    }
    @keyframes slide-in {
      from { transform: translateX(24px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .banner-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: linear-gradient(135deg, #3b82f6, #06b6d4);
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 800;
    }
    .banner h2 {
      margin: 0;
      color: #f8fafc;
      font-size: 13px;
      line-height: 1.3;
    }
    .banner p {
      margin: 2px 0 0;
      color: #94a3b8;
      font-size: 10px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: #94a3b8;
      font-size: 11px;
    }
    .field input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #334155;
      border-radius: 7px;
      outline: 0;
      background: #0f172a;
      color: #fff;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .actions button {
      padding: 7px 12px;
      border: 0;
      border-radius: 7px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
    }
    .cancel {
      background: #334155;
      color: #f8fafc;
    }
    .save {
      background: #3b82f6;
      color: #fff;
    }
    .actions button:disabled {
      cursor: wait;
      opacity: 0.65;
    }
    .error {
      color: #fca5a5 !important;
      font-size: 11px !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .banner { animation: none; }
      .icon:hover { transform: none; }
    }
  `;

  let accessAllowed = false;
  let uiHost = null;
  let uiLayer = null;
  let activeMenu = null;
  let activeMenuInput = null;
  let activeBanner = null;
  let activeBannerTimer = null;
  let positionFrame = 0;
  let positionTrackingUntil = 0;
  let wireFrame = 0;
  let pendingSaveTimer = null;
  let lastCaptureKey = '';
  let lastCaptureTimer = null;
  let contextValid = true;
  let mutationObserver = null;
  let qrSelectionHost = null;
  let rememberedUsername = '';
  let rememberedUsernameAt = 0;
  const REMEMBERED_USERNAME_TTL_MS = 5 * 60 * 1000;
  const LOGIN_CAPTURE_NOTICE_TTL_MS = 2 * 60 * 1000;

  const icons = new Map();
  const wiredPasswordFields = new WeakSet();
  const wiredForms = new WeakSet();

  const samePageOrigin = () => location.origin === PAGE_ORIGIN;

  const contextWasInvalidated = (error) => (
    /extension context invalidated|receiving end does not exist/i.test(
      String(error?.message || error || '')
    )
  );

  function invalidateExtensionContext() {
    if (!contextValid) return;
    contextValid = false;
    accessAllowed = false;
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (positionFrame) cancelAnimationFrame(positionFrame);
    if (wireFrame) cancelAnimationFrame(wireFrame);
    positionFrame = 0;
    positionTrackingUntil = 0;
    wireFrame = 0;
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('scroll', schedulePosition, true);
    window.removeEventListener('focus', handleWindowFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    document.removeEventListener('input', handleLoginInput, true);
    document.removeEventListener('click', handlePotentialLoginClick, true);
    try {
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    } catch {
      // The old extension world is already detached.
    }
    stopQrSelection();
    teardownUi();
  }

  const send = (message) => {
    if (!contextValid || !samePageOrigin()) return Promise.resolve(null);
    try {
      const request = chrome.runtime.sendMessage({ ...message, origin: PAGE_ORIGIN });
      return Promise.resolve(request).catch((error) => {
        if (contextWasInvalidated(error)) invalidateExtensionContext();
        return null;
      });
    } catch (error) {
      // Accessing or invoking chrome.runtime can throw synchronously after an
      // unpacked extension is reloaded. A trailing Promise.catch cannot see it.
      invalidateExtensionContext();
      return Promise.resolve(null);
    }
  };

  const CAPTURE_TEXT = {
    vi: {
      saveAria: 'Lưu tài khoản vào Aegis Vault',
      updateAria: 'Cập nhật mật khẩu trong Aegis Vault',
      saveTitle: 'Lưu tài khoản?',
      updateTitle: 'Cập nhật mật khẩu?',
      saveDescription: 'Lưu thông tin đăng nhập này vào Aegis Vault?',
      updateDescription: 'Cập nhật mật khẩu mới cho tài khoản này trong Aegis Vault?',
      username: 'Tên đăng nhập',
      dismiss: 'Bỏ qua',
      save: 'Lưu tài khoản',
      update: 'Cập nhật mật khẩu',
      saveError: 'Không thể lưu tài khoản.',
      updateError: 'Không thể cập nhật mật khẩu.',
      unlockTitle: 'Mở khóa Aegis Vault để lưu',
      unlockDescription: 'Vault đang khóa hoặc chưa đăng nhập. Hãy mở Aegis, mở khóa rồi quay lại trang này.',
      unlockRetryDescription: 'Sau khi mở khóa Aegis Vault, quay lại trang này và nhấn Thử lại.',
      openVault: 'Mở Aegis Vault',
      retry: 'Thử lại'
    },
    en: {
      saveAria: 'Save login to Aegis Vault',
      updateAria: 'Update password in Aegis Vault',
      saveTitle: 'Save login?',
      updateTitle: 'Update password?',
      saveDescription: 'Save these login details to Aegis Vault?',
      updateDescription: 'Update this account with the new password in Aegis Vault?',
      username: 'Username',
      dismiss: 'Not now',
      save: 'Save login',
      update: 'Update password',
      saveError: 'Could not save this login.',
      updateError: 'Could not update the password.',
      unlockTitle: 'Unlock Aegis Vault to save',
      unlockDescription: 'The vault is locked or signed out. Open Aegis, unlock it, then return to this page.',
      unlockRetryDescription: 'After unlocking Aegis Vault, return to this page and select Try again.',
      openVault: 'Open Aegis Vault',
      retry: 'Try again'
    }
  };

  async function getCaptureText() {
    try {
      const stored = await chrome.storage.local.get(['aegisLanguage']);
      return CAPTURE_TEXT[stored.aegisLanguage === 'vi' ? 'vi' : 'en'];
    } catch {
      return CAPTURE_TEXT.en;
    }
  }

  function setImportantStyle(element, property, value) {
    element.style.setProperty(property, value, 'important');
  }

  function ensureUi() {
    if (uiHost?.isConnected && uiLayer) return;
    if (uiHost && !uiHost.isConnected) {
      icons.clear();
      activeMenu = null;
      activeBanner = null;
      uiHost = null;
      uiLayer = null;
    }

    const host = document.createElement('div');
    setImportantStyle(host, 'all', 'initial');
    setImportantStyle(host, 'position', 'fixed');
    setImportantStyle(host, 'inset', '0');
    setImportantStyle(host, 'width', '100vw');
    setImportantStyle(host, 'height', '100vh');
    setImportantStyle(host, 'margin', '0');
    setImportantStyle(host, 'padding', '0');
    setImportantStyle(host, 'border', '0');
    setImportantStyle(host, 'overflow', 'visible');
    setImportantStyle(host, 'pointer-events', 'none');
    setImportantStyle(host, 'z-index', '2147483647');

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = SHADOW_STYLES;
    const layer = document.createElement('div');
    layer.className = 'layer';
    shadow.append(style, layer);

    (document.documentElement || document.body).appendChild(host);
    uiHost = host;
    uiLayer = layer;
  }

  function closeMenu() {
    activeMenu?.remove();
    activeMenu = null;
    activeMenuInput = null;
  }

  function closeBanner() {
    activeBanner?.remove();
    activeBanner = null;
    if (activeBannerTimer) clearTimeout(activeBannerTimer);
    activeBannerTimer = null;
  }

  function teardownUi() {
    closeMenu();
    closeBanner();
    uiHost?.remove();
    uiHost = null;
    uiLayer = null;
    icons.clear();
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
    if (lastCaptureTimer) clearTimeout(lastCaptureTimer);
    lastCaptureTimer = null;
    lastCaptureKey = '';
  }

  async function refreshAccess() {
    if (!contextValid || !samePageOrigin()) {
      accessAllowed = false;
      teardownUi();
      return false;
    }
    accessAllowed = true;
    ensureUi();
    scheduleWire();
    return true;
  }

  function isVisible(element) {
    if (!element?.isConnected || element.disabled || element.readOnly) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getPasswordFields(root = document) {
    return [...root.querySelectorAll('input[type="password"]')];
  }

  function autocompleteTokens(input) {
    return String(input.autocomplete || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function usernameDescriptor(input) {
    const parts = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute('aria-label'),
      input.getAttribute('title'),
      input.getAttribute('data-testid')
    ];
    if (input.labels) {
      for (const label of input.labels) parts.push(label.textContent);
    }
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function isLikelyUsernameField(input) {
    if (!(input instanceof HTMLInputElement) || !isVisible(input)) return false;
    const type = String(input.type || 'text').toLowerCase();
    if (!['text', 'email', 'tel'].includes(type)) return false;

    const tokens = autocompleteTokens(input);
    if (
      tokens.includes('new-password')
      || tokens.includes('current-password')
      || tokens.includes('one-time-code')
    ) return false;

    const descriptor = usernameDescriptor(input);
    const positive = /(?:user(?:name|id)?|login|sign.?in|e-?mail|account|identifier|phone|mobile|skype|tài\s*khoản|tên\s*đăng\s*nhập)/i;
    const negative = /(?:search|filter|captcha|otp|token|verification|password|passcode|coupon|promo)/i;
    if (negative.test(descriptor)) return false;
    return tokens.includes('username')
      || tokens.includes('email')
      || type === 'email'
      || positive.test(descriptor);
  }

  function usernameCandidateScore(input, passwordInput) {
    if (!(input instanceof HTMLInputElement) || input === passwordInput || !isVisible(input)) {
      return Number.NEGATIVE_INFINITY;
    }

    const type = String(input.type || 'text').toLowerCase();
    if (!['text', 'email', 'search', 'tel', 'url', 'number'].includes(type)) {
      return Number.NEGATIVE_INFINITY;
    }
    const tokens = autocompleteTokens(input);
    if (
      tokens.includes('new-password')
      || tokens.includes('current-password')
      || tokens.includes('one-time-code')
    ) {
      return Number.NEGATIVE_INFINITY;
    }

    const descriptor = usernameDescriptor(input);
    const positive = /(?:user(?:name|id)?|login|e-?mail|account|identifier|tài\s*khoản|tên\s*đăng\s*nhập)/i;
    const negative = /(?:search|filter|captcha|otp|token|verification|phone|mobile|password|passcode|coupon|promo)/i;
    let score = 0;

    if (tokens.includes('username')) score += 160;
    if (tokens.includes('email')) score += 110;
    if (positive.test(descriptor)) score += 90;
    if (negative.test(descriptor)) score -= 180;
    if (type === 'email') score += 35;
    else if (type === 'text') score += 15;

    if (passwordInput.form && input.form === passwordInput.form) score += 100;
    else if (passwordInput.form && input.form && input.form !== passwordInput.form) score -= 80;

    const relation = input.compareDocumentPosition(passwordInput);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) score += 30;
    else if (relation & Node.DOCUMENT_POSITION_PRECEDING) score -= 20;

    const rect = input.getBoundingClientRect();
    const passwordRect = passwordInput.getBoundingClientRect();
    const horizontalOverlap = Math.min(rect.right, passwordRect.right)
      - Math.max(rect.left, passwordRect.left);
    if (horizontalOverlap > 0) score += 35;
    const verticalGap = passwordRect.top - rect.bottom;
    if (verticalGap >= -4 && verticalGap <= 500) {
      score += 65 - Math.min(45, verticalGap / 10);
    } else {
      score -= Math.min(80, Math.abs(verticalGap) / 8);
    }

    return score;
  }

  function findUsernameField(passwordInput) {
    const candidates = [...document.querySelectorAll('input')]
      .map(input => ({ input, score: usernameCandidateScore(input, passwordInput) }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.score > 0 ? candidates[0].input : null;
  }

  function findPairedPasswordField(usernameInput) {
    const candidates = getPasswordFields().filter(input => (
      isVisible(input) && findUsernameField(input) === usernameInput
    ));
    return candidates.find(input => autocompleteTokens(input).includes('current-password'))
      || candidates.find(input => !autocompleteTokens(input).includes('new-password'))
      || candidates[0]
      || null;
  }

  function collectPageIdentityCandidates(passwordInput) {
    const ranking = globalThis.AegisSuggestionRanking;
    if (!ranking?.extractIdentityCandidates) return [];

    const regions = [];
    const seen = new Set();
    const addRegion = element => {
      if (!element || seen.has(element)) return;
      seen.add(element);
      regions.push(element);
    };
    addRegion(passwordInput.form);
    let ancestor = passwordInput.parentElement;
    for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
      addRegion(ancestor);
    }
    addRegion(document.body);

    for (const region of regions) {
      const sources = [region.innerText || ''];
      for (const element of region.querySelectorAll('[data-email], [data-identifier], [aria-label]')) {
        sources.push(
          element.getAttribute('data-email') || '',
          element.getAttribute('data-identifier') || '',
          element.getAttribute('aria-label') || ''
        );
      }
      const identities = ranking.extractIdentityCandidates(sources.join('\n'));
      if (identities.length) return identities;
    }
    return [];
  }

  function collectIdentityHints(passwordInput, credentials) {
    const ranking = globalThis.AegisSuggestionRanking;
    if (!ranking) return [];

    const hints = [];
    const addHint = value => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized && !hints.some(item => item.toLowerCase() === normalized)) hints.push(String(value).trim());
    };

    const usernameInput = findUsernameField(passwordInput);
    if (usernameInput?.value) addHint(usernameInput.value);

    for (const identity of collectPageIdentityCandidates(passwordInput)) {
      if (credentials.some(credential => (
        String(credential?.username || '').trim().toLowerCase() === identity.toLowerCase()
      ))) {
        addHint(identity);
      }
    }
    if (hints.length) return hints;

    const regions = [];
    const seen = new Set();
    const addRegion = element => {
      if (!element || seen.has(element)) return;
      seen.add(element);
      regions.push(element);
    };
    addRegion(passwordInput.form);
    let ancestor = passwordInput.parentElement;
    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      addRegion(ancestor);
    }
    addRegion(document.body);

    for (const region of regions) {
      const regionHints = [];
      const visibleText = region.innerText || '';
      if (!visibleText) continue;
      for (const credential of credentials) {
        if (ranking.textContainsIdentity(visibleText, credential?.username)) {
          regionHints.push(credential.username);
        }
      }
      if (regionHints.length) {
        for (const hint of regionHints) addHint(hint);
        break;
      }
    }

    // The account visibly selected beside the password field is authoritative.
    // Fall back to the username remembered from step one only when the page
    // does not expose an identity that matches the vault.
    if (!hints.length && Date.now() - rememberedUsernameAt <= REMEMBERED_USERNAME_TTL_MS) {
      addHint(rememberedUsername);
    }
    return hints;
  }

  function setNativeValue(input, value) {
    if (!(input instanceof HTMLInputElement) || !input.isConnected) return false;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (!descriptor?.set) return false;
    const nextValue = String(value ?? '');
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    descriptor.set.call(input, nextValue);
    try {
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: nextValue,
        inputType: 'insertText'
      }));
    } catch {
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === nextValue;
  }

  function positionUi() {
    positionFrame = 0;
    if (!accessAllowed || !uiLayer) return;

    for (const [input, icon] of icons) {
      if (!input.isConnected) {
        icon.remove();
        icons.delete(input);
        continue;
      }
      if (!isVisible(input)) {
        icon.hidden = true;
        continue;
      }
      const rect = input.getBoundingClientRect();
      if (
        rect.bottom <= 0
        || rect.top >= window.innerHeight
        || rect.right <= 0
        || rect.left >= window.innerWidth
      ) {
        icon.hidden = true;
        continue;
      }

      const iconSize = 20;
      const inset = 3;
      const edge = 4;
      const maxLeft = Math.max(edge, window.innerWidth - iconSize - edge);
      const maxTop = Math.max(edge, window.innerHeight - iconSize - edge);
      const centeredTop = Math.min(maxTop, Math.max(
        edge,
        rect.top + (rect.height - iconSize) / 2
      ));
      const minimumInsideLeft = Math.max(edge, rect.left + 2);
      const pairedPassword = input.type !== 'password' && findPairedPasswordField(input);
      const outsideGap = 4;
      const rightOutside = rect.right + outsideGap;
      const leftOutside = rect.left - iconSize - outsideGap;
      const left = pairedPassword
        ? rightOutside + iconSize <= window.innerWidth - edge
          ? rightOutside
          : leftOutside >= edge
            ? leftOutside
            : Math.min(maxLeft, Math.max(minimumInsideLeft, rect.right - iconSize - inset))
        : Math.min(maxLeft, Math.max(minimumInsideLeft, rect.right - iconSize - inset));
      const top = centeredTop;

      icon.style.left = `${left}px`;
      icon.style.top = `${top}px`;
      icon.hidden = false;
    }

    if (activeMenu && activeMenuInput) {
      if (isVisible(activeMenuInput)) placeMenu(activeMenu, activeMenuInput);
      else closeMenu();
    }

    if (performance.now() < positionTrackingUntil) {
      positionFrame = requestAnimationFrame(positionUi);
    }
  }

  function schedulePosition() {
    if (!contextValid || positionFrame) return;
    positionFrame = requestAnimationFrame(positionUi);
  }

  function trackPosition(duration = 900) {
    positionTrackingUntil = Math.max(positionTrackingUntil, performance.now() + duration);
    schedulePosition();
  }

  function appendTwoLineText(button, primary, secondary) {
    const first = document.createElement('span');
    first.className = 'primary-line';
    first.textContent = primary;
    const second = document.createElement('span');
    second.className = 'secondary-line';
    second.textContent = secondary;
    button.append(first, second);
  }

  function makeMenuButton(primary, secondary, onTrustedClick, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    appendTwoLineText(button, primary, secondary);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!event.isTrusted) return;
      void onTrustedClick();
    });
    return button;
  }

  function placeMenu(menu, input) {
    const rect = input.getBoundingClientRect();
    const width = Math.max(220, Math.min(360, rect.width));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const estimatedHeight = Math.min(360, 72 + menu.childElementCount * 46);
    const below = rect.bottom + 6;
    const top = below + estimatedHeight <= window.innerHeight
      ? below
      : Math.max(8, rect.top - estimatedHeight - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${width}px`;
  }

  async function showSuggestions(input) {
    closeMenu();
    if (!input.isConnected || !(await refreshAccess())) return;

    const response = await send({ type: 'MATCH' });
    if (!samePageOrigin() || !accessAllowed || !uiLayer) return;

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');

    if (!response?.ok) {
      const message = makeMenuButton(
        'Aegis Vault chưa sẵn sàng',
        'Mở tiện ích để đăng nhập hoặc mở khóa.',
        async () => {
          await send({ type: 'OPEN_OPTIONS' });
          closeMenu();
        }
      );
      menu.append(message);
    } else if (!Array.isArray(response.credentials) || response.credentials.length === 0) {
      menu.append(makeMenuButton(
        'Chưa có tài khoản cho trang này',
        'Mở Aegis Vault để thêm tài khoản.',
        async () => {
          await send({ type: 'OPEN_OPTIONS' });
          closeMenu();
        }
      ));
    } else {
      const ranking = globalThis.AegisSuggestionRanking;
      const pairedPasswordInput = input.type !== 'password'
        ? findPairedPasswordField(input)
        : null;
      const usernameOnly = input.type !== 'password' && !pairedPasswordInput;
      const identityHints = input.type !== 'password' && input.value.trim()
        ? [input.value.trim()]
        : pairedPasswordInput
          ? collectIdentityHints(pairedPasswordInput, response.credentials)
          : input.type === 'password'
            ? collectIdentityHints(input, response.credentials)
            : [];
      const rankedCredentials = ranking
        ? ranking.rankCredentials(response.credentials, { identityHints, pageUrl: location.href })
        : response.credentials;
      const exactIdentityMatches = ranking
        ? ranking.matchCredentialsToIdentityHints(rankedCredentials, identityHints)
        : [];
      const suggestedCredentials = exactIdentityMatches.length
        ? exactIdentityMatches
        : rankedCredentials;
      for (const item of suggestedCredentials) {
        if (!item || typeof item.id !== 'string') continue;
        const username = typeof item.username === 'string' && item.username
          ? item.username
          : 'Tài khoản không có tên';
        const title = typeof item.title === 'string' && item.title
          ? item.title
          : new URL(PAGE_ORIGIN).hostname;
        const button = makeMenuButton(username, title, async () => {
          if (!(await refreshAccess()) || !input.isConnected) return;
          if (usernameOnly) {
            if (typeof item.username === 'string' && item.username.trim()) {
              setNativeValue(input, item.username);
              rememberedUsername = item.username.trim();
              rememberedUsernameAt = Date.now();
            }
            closeMenu();
            return;
          }
          const result = await send({ type: 'FILL', id: item.id });
          if (!result?.ok || !samePageOrigin() || !accessAllowed) return;
          const credential = result.credential;
          if (!credential || typeof credential.password !== 'string') return;
          const passwordInput = input.type === 'password' ? input : pairedPasswordInput;
          const usernameInput = input.type === 'password' ? findUsernameField(input) : input;
          if (usernameInput && typeof credential.username === 'string') {
            setNativeValue(usernameInput, credential.username);
          }
          if (typeof credential.username === 'string' && credential.username.trim()) {
            rememberedUsername = credential.username.trim();
            rememberedUsernameAt = Date.now();
          }
          if (passwordInput) setNativeValue(passwordInput, credential.password);
          closeMenu();
        });
        button.setAttribute('role', 'menuitem');
        menu.append(button);
      }
    }

    uiLayer.appendChild(menu);
    activeMenu = menu;
    activeMenuInput = input;
    placeMenu(menu, input);
  }

  function injectIcon(input) {
    if (icons.has(input) || !uiLayer) return;
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'icon';
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('src/ui/logo-48.png');
    logo.alt = '';
    icon.appendChild(logo);
    icon.title = 'Tài khoản từ Aegis Vault';
    icon.setAttribute('aria-label', 'Xem tài khoản từ Aegis Vault');
    icon.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!event.isTrusted || !accessAllowed || !samePageOrigin()) return;
      void showSuggestions(input);
    });
    uiLayer.appendChild(icon);
    icons.set(input, icon);
    trackPosition();
  }

  function getLoginCandidate(passwordInput) {
    const root = passwordInput.form || document;
    const allPasswords = getPasswordFields(root);
    const visiblePasswords = allPasswords.filter(isVisible);
    const usernameInput = findUsernameField(passwordInput);
    const pageIdentity = collectPageIdentityCandidates(passwordInput)[0] || '';
    const username = usernameInput?.value.trim()
      || pageIdentity
      || (Date.now() - rememberedUsernameAt <= REMEMBERED_USERNAME_TTL_MS ? rememberedUsername : '');
    if (!username) return null;
    if (username) {
      rememberedUsername = username;
      rememberedUsernameAt = Date.now();
    }

    const descriptorFor = input => [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute('aria-label'),
      input.getAttribute('title'),
      input.getAttribute('data-testid'),
      ...(input.labels ? [...input.labels].map(label => label.textContent) : [])
    ].filter(Boolean).join(' ').toLowerCase();
    const currentPattern = /(?:current|existing|old|present|hiện\s*tại|mật\s*khẩu\s*cũ)/i;
    const newPattern = /(?:new|change|replacement|mới|đổi)/i;
    const confirmPattern = /(?:confirm|confirmation|repeat|retype|again|xác\s*nhận|nhập\s*lại)/i;
    const currentFields = visiblePasswords.filter(input => (
      autocompleteTokens(input).includes('current-password')
      || currentPattern.test(descriptorFor(input))
    ));
    const newFields = visiblePasswords.filter(input => (
      autocompleteTokens(input).includes('new-password')
      || newPattern.test(descriptorFor(input))
      || confirmPattern.test(descriptorFor(input))
    ));
    if (newFields.length) {
      if (currentFields.length > 1 || newFields.length > 2) return null;
      const primaryNewField = newFields.find(input => !confirmPattern.test(descriptorFor(input))) || newFields[0];
      const newPassword = primaryNewField.value;
      if (!newPassword || newFields.some(input => input.value !== newPassword)) return null;
      return { username, password: newPassword, intent: 'update' };
    }

    // Some sites omit autocomplete metadata. The common unambiguous fallback
    // is current password + new password + repeated new password.
    if (
      visiblePasswords.length === 3
      && visiblePasswords[1].value
      && visiblePasswords[1].value === visiblePasswords[2].value
      && visiblePasswords[0].value !== visiblePasswords[1].value
    ) {
      return { username, password: visiblePasswords[1].value, intent: 'update' };
    }

    if (visiblePasswords.length !== 1 || visiblePasswords[0] !== passwordInput) return null;
    const password = passwordInput.value;
    if (!password) return null;
    return { username, password, intent: 'login' };
  }

  function rememberUsernameFrom(input) {
    if (!(input instanceof HTMLInputElement) || input.type === 'password') return;
    const value = input.value.trim();
    if (!value) return;
    const descriptor = usernameDescriptor(input);
    const tokens = autocompleteTokens(input);
    if (
      tokens.includes('username')
      || tokens.includes('email')
      || input.type === 'email'
      || /(?:user(?:name|id)?|login|e-?mail|account|identifier|tài\s*khoản|tên\s*đăng\s*nhập)/i.test(descriptor)
    ) {
      rememberedUsername = value;
      rememberedUsernameAt = Date.now();
    }
  }

  function showUnlockCaptureBanner(username, password, intent, captureOrigin, text) {
    closeBanner();
    const banner = document.createElement('section');
    banner.className = 'banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', text.unlockTitle);

    const header = document.createElement('div');
    header.className = 'banner-header';
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = 'A';
    const headingGroup = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = text.unlockTitle;
    const description = document.createElement('p');
    description.textContent = text.unlockDescription;
    headingGroup.append(heading, description);
    header.append(logo, headingGroup);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = text.dismiss;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'save';
    open.textContent = text.openVault;
    actions.append(cancel, open);
    banner.append(header, actions);

    let waitingForUnlock = false;
    cancel.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!event.isTrusted) return;
      void send({ type: 'DISMISS_LOGIN_CAPTURE' });
      closeBanner();
    });
    open.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!event.isTrusted) return;
      if (!waitingForUnlock) {
        waitingForUnlock = true;
        description.textContent = text.unlockRetryDescription;
        open.textContent = text.retry;
        void send({ type: 'OPEN_OPTIONS' });
        return;
      }
      closeBanner();
      void showSaveBanner(username, password, intent, captureOrigin);
    });

    uiLayer.appendChild(banner);
    activeBanner = banner;
    activeBannerTimer = setTimeout(closeBanner, LOGIN_CAPTURE_NOTICE_TTL_MS);
  }

  async function showSaveBanner(username, password, intent = 'login', captureOrigin = PAGE_ORIGIN) {
    if (!(await refreshAccess()) || !uiLayer) return;
    const text = await getCaptureText();
    const account = await send({
      type: 'CHECK_CAPTURE_ACCOUNT',
      username,
      password,
      captureOrigin
    });
    if (!account?.ok) {
      if (contextValid && uiLayer) showUnlockCaptureBanner(username, password, intent, captureOrigin, text);
      return;
    }
    if (account.unchanged) {
      await send({ type: 'DISMISS_LOGIN_CAPTURE' });
      return;
    }
    const isUpdate = intent === 'update' || account.found;
    closeBanner();

    const banner = document.createElement('section');
    banner.className = 'banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', isUpdate ? text.updateAria : text.saveAria);

    const header = document.createElement('div');
    header.className = 'banner-header';
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = 'A';
    const headingGroup = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = isUpdate ? text.updateTitle : text.saveTitle;
    const description = document.createElement('p');
    description.textContent = isUpdate ? text.updateDescription : text.saveDescription;
    headingGroup.append(heading, description);
    header.append(logo, headingGroup);

    const field = document.createElement('label');
    field.className = 'field';
    const labelText = document.createElement('span');
    labelText.textContent = text.username;
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.autocomplete = 'off';
    usernameInput.spellcheck = false;
    usernameInput.value = username;
    usernameInput.readOnly = isUpdate || captureOrigin !== PAGE_ORIGIN;
    field.append(labelText, usernameInput);

    const error = document.createElement('p');
    error.className = 'error';
    error.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = text.dismiss;
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'save';
    save.textContent = isUpdate ? text.update : text.save;
    actions.append(cancel, save);
    banner.append(header, field, error, actions);

    cancel.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!event.isTrusted) return;
      void send({ type: 'DISMISS_LOGIN_CAPTURE' });
      closeBanner();
    });

    save.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (!event.isTrusted || save.disabled) return;
      void (async () => {
        const finalUsername = usernameInput.value.trim();
        if (!finalUsername || !(await refreshAccess())) return;
        save.disabled = true;
        const result = await send({
          type: isUpdate ? 'UPDATE_CAPTURE_PASSWORD' : 'SAVE',
          username: finalUsername,
          password,
          captureOrigin
        });
        if (result?.ok) {
          await send({ type: 'DISMISS_LOGIN_CAPTURE' });
          closeBanner();
          return;
        }
        error.textContent = isUpdate ? text.updateError : text.saveError;
        error.hidden = false;
        save.disabled = false;
      })();
    });

    uiLayer.appendChild(banner);
    activeBanner = banner;
    activeBannerTimer = setTimeout(closeBanner, 30000);
  }

  function hasVisibleLoginError(root) {
    const selectors = '[role="alert"], [aria-live="assertive"], .error, .invalid, .alert-danger';
    return [...root.querySelectorAll(selectors)].some(element => {
      if (!isVisible(element)) return false;
      return /(?:invalid|incorrect|failed|wrong|denied|sai|không đúng|thất bại|không hợp lệ)/i.test(element.textContent || '');
    });
  }

  function waitForLoginOutcome(candidate, sourceRoot) {
    const initialUrl = location.href;
    const deadline = Date.now() + 8000;
    const checkOutcome = async () => {
      if (!contextValid || !samePageOrigin()) return;
      if (hasVisibleLoginError(sourceRoot || document)) {
        await send({ type: 'DISMISS_LOGIN_CAPTURE' });
        return;
      }
      const passwordStillVisible = getPasswordFields(sourceRoot || document).some(isVisible);
      const successSignal = location.href !== initialUrl || !passwordStillVisible;
      if (successSignal) {
        // showSaveBanner performs the authoritative comparison. Calling it
        // directly also gives a locked vault an actionable unlock-and-retry
        // notice instead of failing silently after a same-page login.
        await showSaveBanner(candidate.username, candidate.password, candidate.intent);
        return;
      }
      if (Date.now() < deadline) setTimeout(checkOutcome, 300);
    };
    setTimeout(checkOutcome, 300);
  }

  function queueSaveCapture(passwordInput) {
    if (!contextValid || !accessAllowed || !samePageOrigin()) return;
    const candidate = getLoginCandidate(passwordInput);
    if (!candidate) return;

    const captureKey = `${candidate.username}\u0000${candidate.password}`;
    if (captureKey === lastCaptureKey) return;
    lastCaptureKey = captureKey;
    if (lastCaptureTimer) clearTimeout(lastCaptureTimer);
    lastCaptureTimer = setTimeout(() => {
      lastCaptureKey = '';
      lastCaptureTimer = null;
    }, 15000);

    void send({
      type: 'STAGE_LOGIN_CAPTURE',
      username: candidate.username,
      password: candidate.password,
      intent: candidate.intent
    });

    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => {
      pendingSaveTimer = null;
      waitForLoginOutcome(candidate, passwordInput.form || document);
    }, 0);
  }

  function isSubmitControl(element, form) {
    if (!(element instanceof Element)) return false;
    const control = element.closest('button, input[type="submit"], input[type="image"]');
    if (!control || control.form !== form || control.disabled) return false;
    if (control instanceof HTMLButtonElement) return control.type === 'submit';
    return control instanceof HTMLInputElement
      && ['submit', 'image'].includes(control.type.toLowerCase());
  }

  function wirePasswordField(input) {
    if (!findUsernameField(input)) injectIcon(input);
    if (wiredPasswordFields.has(input)) return;
    wiredPasswordFields.add(input);
    input.addEventListener('keydown', (event) => {
      if (!event.isTrusted || event.isComposing || event.key !== 'Enter') return;
      queueSaveCapture(input);
    }, { capture: true });
  }

  function wireForm(form) {
    if (wiredForms.has(form)) return;
    wiredForms.add(form);

    form.addEventListener('click', (event) => {
      if (!event.isTrusted || !isSubmitControl(event.target, form)) return;
      const passwordFields = getPasswordFields(form).filter(isVisible);
      if (passwordFields.length) queueSaveCapture(passwordFields[0]);
    }, { capture: true });

    form.addEventListener('submit', (event) => {
      if (!event.isTrusted) return;
      const passwordFields = getPasswordFields(form).filter(isVisible);
      if (passwordFields.length) queueSaveCapture(passwordFields[0]);
    }, { capture: true });
  }

  function handleLoginInput(event) {
    if (!event.isTrusted) return;
    rememberUsernameFrom(event.target);
  }

  function handlePotentialLoginClick(event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest('button, [role="button"], input[type="button"], input[type="submit"]');
    if (!control || control.disabled) return;
    const label = `${control.textContent || ''} ${control.getAttribute('aria-label') || ''} ${control.value || ''}`;
    const isLoginAction = /(?:sign\s*in|log\s*in|login|đăng\s*nhập|tiếp\s*(?:tục|theo)|continue|next)/i.test(label);
    const isPasswordAction = /(?:change|update|save)\s*(?:the\s*)?password|đổi\s*mật\s*khẩu|cập\s*nhật\s*mật\s*khẩu/i.test(label);
    if (!isLoginAction && !isPasswordAction) return;
    const passwordFields = getPasswordFields().filter(isVisible);
    if (passwordFields.length) {
      queueSaveCapture(passwordFields[0]);
      return;
    }
    if (!isLoginAction || !rememberedUsername) return;
    void send({
      type: 'STAGE_LOGIN_CAPTURE',
      username: rememberedUsername,
      password: '',
      intent: 'username'
    });
  }

  function wire() {
    wireFrame = 0;
    if (!contextValid || !accessAllowed || !samePageOrigin()) return;
    ensureUi();

    const passwordFields = getPasswordFields();
    const usernameFields = [...document.querySelectorAll('input')]
      .filter(input => !passwordFields.includes(input) && isLikelyUsernameField(input));
    const passwordIconFields = passwordFields.filter(input => !findUsernameField(input));
    const fields = [...passwordIconFields, ...usernameFields];
    for (const input of passwordFields) {
      wirePasswordField(input);
      if (input.form) wireForm(input.form);
    }
    for (const input of usernameFields) injectIcon(input);

    for (const [input, icon] of icons) {
      if (!input.isConnected || !fields.includes(input)) {
        icon.remove();
        icons.delete(input);
      }
    }
    schedulePosition();
  }

  function scheduleWire() {
    if (!contextValid || wireFrame || !accessAllowed) return;
    wireFrame = requestAnimationFrame(wire);
  }

  function stopQrSelection() {
    if (!qrSelectionHost) return;
    try {
      qrSelectionHost.aegisCleanup?.();
    } catch {
      // The page may be navigating while the selector is being removed.
    }
    qrSelectionHost.remove();
    qrSelectionHost = null;
  }

  function loadQrScreenshot(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không đọc được ảnh chụp màn hình.'));
      image.src = dataUrl;
    });
  }

  async function cropQrScreenshot(dataUrl, rect) {
    const image = await loadQrScreenshot(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const sourceX = Math.max(0, Math.floor(rect.x * scaleX));
    const sourceY = Math.max(0, Math.floor(rect.y * scaleY));
    const sourceWidth = Math.min(
      image.naturalWidth - sourceX,
      Math.max(1, Math.ceil(rect.width * scaleX))
    );
    const sourceHeight = Math.min(
      image.naturalHeight - sourceY,
      Math.max(1, Math.ceil(rect.height * scaleY))
    );
    if (sourceWidth < 12 || sourceHeight < 12) {
      throw new Error('Vùng chọn QR quá nhỏ.');
    }

    const outputScale = Math.min(1, 2000 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL('image/png');
  }

  function beginQrSelection() {
    stopQrSelection();
    if (!contextValid || !samePageOrigin()) return false;

    const host = document.createElement('div');
    setImportantStyle(host, 'all', 'initial');
    setImportantStyle(host, 'display', 'block');
    setImportantStyle(host, 'position', 'fixed');
    setImportantStyle(host, 'inset', '0');
    setImportantStyle(host, 'width', '100vw');
    setImportantStyle(host, 'height', '100vh');
    setImportantStyle(host, 'margin', '0');
    setImportantStyle(host, 'padding', '0');
    setImportantStyle(host, 'z-index', '2147483647');
    setImportantStyle(host, 'pointer-events', 'auto');

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .selector {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        overflow: hidden;
        cursor: crosshair;
        background: rgba(8, 15, 28, .58);
        user-select: none;
        touch-action: none;
        font: 600 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .selector.selecting { background: transparent; }
      .selection {
        position: fixed;
        display: none;
        border: 2px solid #38bdf8;
        border-radius: 5px;
        background: rgba(255, 255, 255, .02);
        box-shadow: 0 0 0 9999px rgba(8, 15, 28, .62), 0 0 0 1px rgba(255,255,255,.7);
        pointer-events: none;
      }
      .hint {
        position: fixed;
        left: 50%;
        top: 18px;
        max-width: min(620px, calc(100vw - 120px));
        transform: translateX(-50%);
        padding: 11px 16px;
        border: 1px solid rgba(125, 211, 252, .55);
        border-radius: 10px;
        background: rgba(12, 24, 43, .94);
        box-shadow: 0 10px 32px rgba(0,0,0,.35);
        color: #f8fafc;
        text-align: center;
        pointer-events: none;
      }
      .hint.error { border-color: rgba(252, 165, 165, .7); color: #fecaca; }
      .cancel {
        position: fixed;
        right: 18px;
        top: 18px;
        min-width: 72px;
        height: 38px;
        border: 1px solid rgba(255,255,255,.34);
        border-radius: 9px;
        background: rgba(12, 24, 43, .94);
        color: #fff;
        cursor: pointer;
        font: 700 12px/1 system-ui, sans-serif;
      }
      .cancel:hover { background: #b42318; }
    `;
    const layer = document.createElement('div');
    layer.className = 'selector';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Kéo chuột khoanh đúng 1 mã QR · Nhấn Esc để hủy';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = 'Hủy';
    const selection = document.createElement('div');
    selection.className = 'selection';
    layer.append(hint, cancel, selection);
    shadow.append(style, layer);

    let startX = 0;
    let startY = 0;
    let selecting = false;
    let processing = false;

    const updateSelection = (clientX, clientY) => {
      const x = Math.max(0, Math.min(startX, clientX));
      const y = Math.max(0, Math.min(startY, clientY));
      const width = Math.min(window.innerWidth, Math.max(startX, clientX)) - x;
      const height = Math.min(window.innerHeight, Math.max(startY, clientY)) - y;
      selection.style.left = `${x}px`;
      selection.style.top = `${y}px`;
      selection.style.width = `${width}px`;
      selection.style.height = `${height}px`;
      return { x, y, width, height };
    };

    const resetForRetry = message => {
      processing = false;
      selecting = false;
      layer.classList.remove('selecting');
      layer.style.cursor = 'crosshair';
      selection.style.display = 'none';
      selection.style.borderColor = '';
      selection.style.background = '';
      hint.style.display = '';
      cancel.style.display = '';
      hint.classList.add('error');
      hint.textContent = message;
    };

    const keyHandler = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      stopQrSelection();
    };
    window.addEventListener('keydown', keyHandler, true);
    host.aegisCleanup = () => window.removeEventListener('keydown', keyHandler, true);

    cancel.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      stopQrSelection();
    };
    layer.onwheel = event => event.preventDefault();
    layer.onpointerdown = event => {
      if (processing || event.button !== 0 || event.target === cancel) return;
      event.preventDefault();
      selecting = true;
      startX = event.clientX;
      startY = event.clientY;
      hint.classList.remove('error');
      hint.textContent = 'Thả chuột khi khung chỉ chứa mã QR cần lấy';
      layer.classList.add('selecting');
      selection.style.display = 'block';
      layer.setPointerCapture(event.pointerId);
      updateSelection(event.clientX, event.clientY);
    };
    layer.onpointermove = event => {
      if (!selecting || processing) return;
      event.preventDefault();
      updateSelection(event.clientX, event.clientY);
    };
    layer.onpointerup = async event => {
      if (!selecting || processing) return;
      event.preventDefault();
      selecting = false;
      try {
        layer.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be released when the tab loses focus.
      }
      const rect = updateSelection(event.clientX, event.clientY);
      if (rect.width < 24 || rect.height < 24) {
        resetForRetry('Vùng chọn quá nhỏ. Hãy kéo khoanh trọn mã QR.');
        return;
      }

      processing = true;
      layer.style.cursor = 'wait';
      hint.classList.remove('error');
      hint.textContent = 'Đang đọc mã QR trong vùng đã chọn…';
      hint.style.display = 'none';
      cancel.style.display = 'none';
      selection.style.borderColor = 'transparent';
      selection.style.background = 'transparent';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const capture = await send({ type: 'CAPTURE_QR_SELECTION' });
      if (!capture?.ok || !capture.screenshot) {
        resetForRetry(capture?.error || 'Không chụp được vùng QR. Hãy thử lại.');
        return;
      }

      try {
        const dataUrl = await cropQrScreenshot(capture.screenshot, rect);
        hint.style.display = 'block';
        hint.textContent = 'Đang lưu mã OTP vào Aegis Vault…';
        const saved = await send({ type: 'SAVE_QR_CAPTURE', dataUrl });
        if (!saved?.ok) {
          resetForRetry(saved?.error || 'Không lưu được mã OTP.');
          return;
        }
        stopQrSelection();
      } catch (error) {
        resetForRetry(error?.message || 'Không xử lý được vùng QR đã chọn.');
      }
    };

    (document.documentElement || document.body).appendChild(host);
    qrSelectionHost = host;
    return true;
  }

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!contextValid) return;
    let runtimeId;
    try {
      runtimeId = chrome.runtime.id;
    } catch {
      invalidateExtensionContext();
      return;
    }
    if (sender.id !== runtimeId || message.origin !== PAGE_ORIGIN) return;

    if (message?.type !== 'AEGIS_AUTOFILL') return;
    if (typeof message.username !== 'string' || typeof message.password !== 'string') return;

    void (async () => {
      if (!(await refreshAccess()) || !samePageOrigin()) return;
      const fields = getPasswordFields().filter((input) => (
        isVisible(input) && !autocompleteTokens(input).includes('new-password')
      ));
      if (!fields.length) return;
      const passwordInput = fields.find((input) => autocompleteTokens(input).includes('current-password'))
        || fields[0];
      const usernameInput = findUsernameField(passwordInput);
      if (usernameInput) setNativeValue(usernameInput, message.username);
      setNativeValue(passwordInput, message.password);
    })();
  }

  function handleWindowFocus() {
    if (contextValid) {
      trackPosition();
      void refreshAccess();
    }
  }

  function handleWindowResize() {
    trackPosition();
  }

  function handleVisibilityChange() {
    if (contextValid && !document.hidden) void refreshAccess();
  }

  function handleDocumentPointerDown(event) {
    if (!contextValid || !event.isTrusted || !activeMenu || event.target === uiHost) return;
    closeMenu();
  }

  try {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  } catch {
    invalidateExtensionContext();
    return;
  }

  mutationObserver = new MutationObserver(() => {
    scheduleWire();
    trackPosition();
  });
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['type', 'style', 'class', 'disabled', 'readonly']
  });

  window.addEventListener('resize', handleWindowResize, { passive: true });
  window.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
  window.addEventListener('focus', handleWindowFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
  document.addEventListener('input', handleLoginInput, { capture: true });
  document.addEventListener('click', handlePotentialLoginClick, { capture: true });

  void (async () => {
    if (!(await refreshAccess())) return;
    const staged = await send({ type: 'TAKE_LOGIN_CAPTURE' });
    if (!staged?.ok || !staged.capture) return;
    const { username, password, intent, sourceOrigin } = staged.capture;
    if (!password) {
      rememberedUsername = username;
      rememberedUsernameAt = Date.now();
      return;
    }
    await showSaveBanner(username, password, intent, sourceOrigin || PAGE_ORIGIN);
  })();
})();
