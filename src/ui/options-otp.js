import { generateTotp, parseOtpAuthUri, parseOtpQrUri, serializeOtpAuthUri } from '../vault/totp.js';
import qrcode from '../vendor/qrcode-generator.js';
import '../vendor/jsqr.js';
import { localizeRuntimeText } from '../i18n.js';
import { armQrScanIntent, cancelQrScanIntent, isQrScanTargetMatching } from './qr-handoff.js';

/** OTP controls for the options dashboard. The caller owns the surrounding markup. */
export function initOptionsOtp({ send, getLanguage, onAccountsChanged = () => {} }) {
  const $ = id => document.getElementById(id);
  const language = () => getLanguage() === 'vi' ? 'vi' : 'en';
  const l = (en, vi) => language() === 'vi' ? vi : en;
  const runtimeText = value => localizeRuntimeText(String(value || ''), language());
  const fields = ['otpUri', 'otpIssuer', 'otpAccount', 'otpSecret', 'otpAlgorithm', 'otpDigits', 'otpPeriod'];
  const controls = [...fields, 'otpSaveBtn', 'otpCancelBtn', 'otpImageBtn', 'otpCameraBtn',
    'otpDeleteBtn', 'otpDeleteCancelBtn', 'otpDeleteConfirmBtn', 'addOtpBtn',
    'scanScreenMenuBtn', 'scanImportMenuBtn', 'otpScanStartBtn', 'otpScanCancelBtn', 'otpScanTab'];
  let accounts = [];
  let active = false;
  let disposed = false;
  let timer = null;
  let renderGeneration = 0;
  let loadGeneration = 0;
  let revision = 0;
  let busy = '';
  let applyingUri = false;
  let dragging = false;
  let dragArmedId = null;
  let dragCard = null;
  let dragRevision = 0;
  let editorTitle = 'add';
  let statusMessage = null;
  let errorMessage = null;
  let toastMessage = null;
  let scanFromEditor = false;
  let scanTargets = [];
  let pendingScanIntent = null;
  let lockedControls = [];
  let loadError = null;

  // These labels depend on editor state, not the static document translation keys.
  for (const id of ['otpDialogTitle', 'otpSaveBtn', 'otpDeleteConfirmBtn', 'otpQrTitle']) $(id)?.removeAttribute('data-i18n');

  const isOpen = id => Boolean($(id) && !$(id).classList.contains('hidden'));
  const editorOpen = () => isOpen('otpModal');
  const canRender = () => active && !disposed && !document.hidden && !busy && !dragging
    && !editorOpen() && !isOpen('otpQrModal') && !isOpen('otpScanPicker');
  const text = (en, vi) => () => l(en, vi);
  const setText = (id, value) => { if ($(id)) $(id).textContent = value; };
  const bind = (id, event, handler) => $(id)?.addEventListener(event, handler);

  async function request(message) {
    try {
      const response = await send(message);
      if (!response || typeof response !== 'object') throw new Error(l('No response from Vault.', 'Vault không phản hồi.'));
      return response;
    } catch (error) {
      return { ok: false, error: error?.message || l('Could not connect to Vault.', 'Không thể kết nối với Vault.') };
    }
  }

  function failure(response, en, vi) {
    return response?.error ? runtimeText(response.error) : l(en, vi);
  }

  function setStatus(message = null) {
    statusMessage = message;
    setText('otpFormStatus', message ? message() : '');
  }

  function setError(message = null) {
    errorMessage = message;
    setText('otpFormError', message ? message() : '');
  }

  function showToast(message, tone = '') {
    toastMessage = message;
    const toast = $('otpCopyToast');
    if (!toast) return;
    toast.textContent = message();
    if (tone) toast.dataset.tone = tone;
    else delete toast.dataset.tone;
    toast.classList.add('show');
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastMessage = null;
    }, tone === 'error' ? 4200 : 2400);
  }

  function reportError(error, en, vi, inEditor = editorOpen()) {
    const raw = error?.message || error;
    const message = raw ? () => runtimeText(raw) : text(en, vi);
    if (inEditor) { setStatus(); setError(message); }
    showToast(message, 'error');
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function syncTimer() {
    stopTimer();
    if (canRender()) {
      void render();
      if (!loadError) timer = setInterval(() => { void render(); }, 1000);
    }
  }

  function cancelDrag() {
    dragCard?.classList.remove('dragging');
    dragging = false;
    dragCard = null;
    dragArmedId = null;
  }

  function updateAccounts(value) {
    accounts = Array.isArray(value) ? value.slice() : [];
    loadError = null;
    revision += 1;
    loadGeneration += 1;
    renderGeneration += 1;
    cancelDrag();
    onAccountsChanged(accounts.slice());
  }

  function setAccounts(value) {
    updateAccounts(value);
    syncTimer();
  }

  function updateDynamicLabels() {
    setText('otpDialogTitle', editorTitle === 'edit'
      ? l('Edit authenticator code', 'Sửa mã xác thực')
      : editorTitle === 'scanned' ? l('OTP code scanned', 'Đã quét được mã OTP')
        : l('Add authenticator code', 'Thêm mã xác thực'));
    setText('otpSaveBtn', busy === 'save' ? l('Saving…', 'Đang lưu…') : l('Save OTP', 'Lưu OTP'));
    setText('otpDeleteConfirmBtn', busy === 'delete' ? l('Deleting…', 'Đang xóa…') : l('Confirm delete', 'Đồng ý xóa'));
    if (statusMessage) setText('otpFormStatus', statusMessage());
    if (errorMessage) setText('otpFormError', errorMessage());
    if (toastMessage) setText('otpCopyToast', toastMessage());
  }

  function beginBusy(kind) {
    if (busy || disposed) return false;
    busy = kind;
    renderGeneration += 1;
    loadGeneration += 1;
    stopTimer();
    lockedControls = controls.map(id => $(id)).filter(Boolean).map(element => [element, element.disabled]);
    lockedControls.forEach(([element]) => { element.disabled = true; });
    $('otpSaveBtn')?.setAttribute('aria-busy', String(kind === 'save'));
    updateDynamicLabels();
    return true;
  }

  function endBusy() {
    busy = '';
    lockedControls.forEach(([element, disabled]) => { element.disabled = disabled; });
    lockedControls = [];
    $('otpSaveBtn')?.setAttribute('aria-busy', 'false');
    updateDynamicLabels();
    syncTimer();
  }

  async function refreshAccounts() {
    if (!active || disposed || busy || editorOpen() || isOpen('otpQrModal') || isOpen('otpScanPicker')) return;
    const generation = ++loadGeneration;
    const startRevision = revision;
    const response = await request({ type: 'OTP_LIST' });
    if (generation !== loadGeneration || startRevision !== revision || !active || disposed || busy || editorOpen()) return;
    if (!response.ok) {
      updateAccounts([]);
      loadError = response.error ? () => runtimeText(response.error)
        : text('Could not load OTP accounts.', 'Không tải được danh sách OTP.');
      showToast(loadError, 'error');
      syncTimer();
      return;
    }
    setAccounts(response.otpAccounts);
  }

  async function adoptMutation(response, fallback) {
    if (Array.isArray(response.otpAccounts)) {
      updateAccounts(response.otpAccounts);
      return;
    }
    const startRevision = revision;
    const refreshed = await request({ type: 'OTP_LIST' });
    if (startRevision !== revision) return;
    if (refreshed.ok && Array.isArray(refreshed.otpAccounts)) updateAccounts(refreshed.otpAccounts);
    else {
      // Never report a committed write as a failed write merely because its refresh failed.
      if (fallback) updateAccounts(fallback());
      showToast(text('OTP saved changes, but the list could not be refreshed. Reopen this tab to retry.',
        'Đã lưu thay đổi OTP nhưng chưa tải lại được danh sách. Mở lại thẻ này để thử lại.'), 'error');
    }
  }

  async function render() {
    if (!canRender()) return;
    const generation = ++renderGeneration;
    if (loadError) {
      const panel = document.createElement('div');
      panel.className = 'otp-load-error';
      panel.style.gridColumn = '1 / -1';
      const message = document.createElement('p');
      message.textContent = loadError();
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = l('Retry', 'Thử lại');
      retry.onclick = () => { void refreshAccounts(); };
      panel.append(message, retry);
      $('otpList')?.replaceChildren(panel);
      return;
    }
    const query = String($('dashboardSearch')?.value || '').trim().toLowerCase();
    const visible = accounts.filter(item => `${item.issuer || ''} ${item.account || ''}`.toLowerCase().includes(query));
    const nodes = await Promise.all(visible.map(async item => {
      const card = document.createElement('article');
      card.className = 'otp-card';
      card.dataset.id = item.id;
      card.draggable = true;
      const issuer = document.createElement('div');
      issuer.className = 'otp-issuer';
      issuer.textContent = item.issuer || item.account || l('OTP account', 'Tài khoản OTP');
      const code = document.createElement('div');
      code.className = 'otp-code';
      let valid = true;
      try { code.textContent = await generateTotp(item); }
      catch {
        valid = false;
        code.textContent = l('Invalid OTP', 'OTP không hợp lệ');
        code.classList.add('invalid');
        code.setAttribute('aria-label', l('Invalid OTP. Edit the secret and settings.', 'OTP không hợp lệ. Hãy sửa mã bí mật và thông số.'));
      }
      const account = document.createElement('div');
      account.className = 'otp-account';
      account.textContent = item.account || '';
      const side = document.createElement('div');
      side.className = 'otp-side';
      const tools = document.createElement('div');
      tools.className = 'otp-card-tools';
      function tool(className, label, symbol, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `otp-icon-btn ${className}`;
        button.title = label;
        button.setAttribute('aria-label', `${label} — ${item.issuer || item.account || 'OTP'}`);
        button.textContent = symbol;
        button.onclick = event => { event.stopPropagation(); if (!busy && active) action(); };
        tools.append(button);
        return button;
      }
      const handle = tool('otp-drag-btn', l('Drag to reorder', 'Kéo để đổi thứ tự'), '⠿', () => {});
      handle.onpointerdown = event => { event.stopPropagation(); if (!busy) dragArmedId = item.id; };
      const qr = tool('otp-qr-btn', l('Show QR code', 'Hiển thị mã QR'), '▦', () => showQr(item));
      qr.disabled = !valid;
      if (!valid) qr.title = l('Edit OTP before creating a QR code', 'Sửa OTP trước khi tạo mã QR');
      tool('', l('Edit or delete OTP', 'Sửa hoặc xóa OTP'), '✎', () => openEditor(item));
      const countdown = document.createElement('span');
      countdown.className = 'otp-timer';
      const configured = Number(item.period ?? 30);
      const period = Number.isInteger(configured) && configured >= 5 && configured <= 300 ? configured : 30;
      const remaining = period - (Math.floor(Date.now() / 1000) % period);
      const seconds = document.createElement('span');
      seconds.textContent = String(remaining);
      countdown.append(seconds);
      countdown.title = l(`${remaining} seconds remaining (${period} seconds per code)`, `Còn ${remaining} giây (mỗi mã ${period} giây)`);
      countdown.setAttribute('aria-label', countdown.title);
      countdown.style.setProperty('--timer-angle', `${remaining / period * 360}deg`);
      countdown.classList.toggle('expiring', remaining <= 5);
      code.classList.toggle('expiring', remaining <= 5);
      side.append(tools, countdown);
      card.append(issuer, code, account, side);
      card.onpointerdown = event => { if (!event.target.closest('.otp-drag-btn')) dragArmedId = null; };
      card.onclick = async event => {
        if (event.target.closest('button') || busy || dragging || !active) return;
        if (!valid) { showToast(text('Invalid OTP — check the secret and settings.', 'OTP không hợp lệ — hãy kiểm tra mã bí mật và thông số.'), 'error'); return; }
        try {
          // Generate again: a displayed code can expire between rendering and clicking.
          await navigator.clipboard.writeText(await generateTotp(item));
          showToast(text('OTP code copied', 'Đã sao chép mã OTP'), 'success');
        } catch { showToast(text('Could not copy OTP code', 'Không thể sao chép mã OTP'), 'error'); }
      };
      card.ondragstart = event => {
        if (!canRender() || dragArmedId !== item.id) { event.preventDefault(); return; }
        dragging = true;
        dragCard = card;
        dragRevision = revision;
        renderGeneration += 1;
        stopTimer();
        event.dataTransfer?.setData('text/plain', item.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      };
      card.ondragover = event => {
        if (!dragging || !dragCard || busy) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (card === dragCard) return;
        const rect = card.getBoundingClientRect();
        card.parentNode.insertBefore(dragCard, event.clientY < rect.top + rect.height / 2 ? card : card.nextSibling);
      };
      card.ondrop = event => event.preventDefault();
      card.ondragend = () => { void finishDrag(); };
      return card;
    }));
    if (generation !== renderGeneration || !canRender()) return;
    if (!nodes.length) {
      const empty = document.createElement('div');
      empty.className = 'otp-empty';
      empty.style.gridColumn = '1 / -1';
      empty.textContent = query ? l('No matching OTP accounts.', 'Không có tài khoản OTP phù hợp.')
        : l('No OTP codes yet. Select Add code to get started.', 'Chưa có mã OTP. Chọn Thêm mã để bắt đầu.');
      nodes.push(empty);
    }
    $('otpList')?.replaceChildren(...nodes);
  }

  async function finishDrag() {
    if (!dragging) return;
    const visibleIds = [...$('otpList').querySelectorAll('.otp-card')].map(card => card.dataset.id);
    const visibleSet = new Set(visibleIds);
    let cursor = 0;
    const ids = accounts.map(item => visibleSet.has(item.id) ? visibleIds[cursor++] : item.id);
    const changed = ids.some((id, index) => id !== accounts[index]?.id);
    const stillValid = dragRevision === revision && active;
    cancelDrag();
    if (!stillValid || !changed || !beginBusy('reorder')) { syncTimer(); return; }
    try {
      const response = await request({ type: 'OTP_REORDER', ids });
      if (!response.ok) throw new Error(failure(response, 'Could not save OTP order.', 'Không thể lưu thứ tự OTP.'));
      await adoptMutation(response, () => ids.map(id => accounts.find(item => item.id === id)).filter(Boolean));
    } catch (error) { reportError(error, 'Could not save OTP order.', 'Không thể lưu thứ tự OTP.'); }
    finally { endBusy(); }
  }

  function resetEditor() {
    ['otpEditId', 'otpUri', 'otpIssuer', 'otpAccount', 'otpSecret'].forEach(id => { if ($(id)) $(id).value = ''; });
    $('otpAlgorithm').value = 'SHA1';
    $('otpDigits').value = '6';
    $('otpPeriod').value = '30';
    editorTitle = 'add';
    $('otpDeleteBtn')?.classList.remove('visible');
    $('otpDeleteConfirm')?.classList.add('hidden');
    setStatus();
    setError();
    updateDynamicLabels();
  }

  function openEditor(item = null) {
    if (busy || !active) return;
    cancelDrag();
    renderGeneration += 1;
    stopTimer();
    resetEditor();
    if (item) {
      $('otpEditId').value = item.id;
      for (const [id, key, fallback] of [['otpIssuer', 'issuer', ''], ['otpAccount', 'account', ''],
        ['otpSecret', 'secret', ''], ['otpAlgorithm', 'algorithm', 'SHA1'],
        ['otpDigits', 'digits', 6], ['otpPeriod', 'period', 30]]) {
        $(id).value = String(item[key] ?? fallback);
      }
      $('otpAlgorithm').value = String(item.algorithm || 'SHA1').toUpperCase().replaceAll('-', '');
      try { $('otpUri').value = serializeOtpAuthUri(item); } catch { /* Invalid entries remain editable. */ }
      editorTitle = 'edit';
      $('otpDeleteBtn')?.classList.add('visible');
    }
    updateDynamicLabels();
    $('otpModal').classList.remove('hidden');
    $('otpIssuer')?.focus();
  }

  function closeEditor(force = false) {
    if (busy && !force) return;
    if (scanFromEditor) cancelPendingScanSafely();
    $('otpModal')?.classList.add('hidden');
    // Secrets remain in the locked editor until the operation actually completes.
    resetEditor();
    syncTimer();
  }

  function applyUri(value, showError = false) {
    try {
      const parsed = parseOtpAuthUri(value);
      applyingUri = true;
      $('otpUri').value = value;
      for (const [id, key] of [['otpIssuer', 'issuer'], ['otpAccount', 'account'], ['otpSecret', 'secret'],
        ['otpAlgorithm', 'algorithm'], ['otpDigits', 'digits'], ['otpPeriod', 'period']]) $(id).value = String(parsed[key]);
      setError();
      return true;
    } catch (error) {
      if (showError) setError(() => runtimeText(error.message));
      return false;
    } finally { applyingUri = false; }
  }

  function mutationToast(response, deleted = false) {
    const state = String(response.syncStatus?.state || '').toLowerCase();
    showToast(deleted
      ? state && state !== 'synced'
        ? text('OTP deleted · Firebase sync pending', 'Đã xóa OTP · đang tự đồng bộ Firebase')
        : text('OTP code deleted', 'Đã xóa mã OTP')
      : state && state !== 'synced'
        ? text('OTP saved · Firebase sync pending', 'Đã lưu OTP · đang tự đồng bộ Firebase')
        : state === 'synced' ? text('OTP saved and synced with Firebase', 'Đã lưu OTP và đồng bộ Firebase')
          : text('OTP saved', 'Đã lưu OTP'), 'success');
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (busy || !editorOpen() || !active) return;
    const uri = $('otpUri').value.trim();
    if (uri && !applyUri(uri, true)) return;
    const payload = { type: 'OTP_SAVE', id: $('otpEditId').value, issuer: $('otpIssuer').value.trim(),
      account: $('otpAccount').value.trim(), secret: $('otpSecret').value.trim(), algorithm: $('otpAlgorithm').value,
      digits: Number($('otpDigits').value), period: Number($('otpPeriod').value) };
    try { serializeOtpAuthUri(payload); }
    catch (error) { setError(() => runtimeText(error.message)); return; }
    if (!beginBusy('save')) return;
    setError();
    setStatus(text('Encrypting and saving securely on this device…', 'Đang mã hóa và lưu an toàn trên máy…'));
    try {
      const response = await request(payload);
      if (!response.ok) throw new Error(failure(response, 'Could not save OTP.', 'Không thể lưu OTP.'));
      await adoptMutation(response);
      closeEditor(true);
      mutationToast(response);
    } catch (error) { setStatus(); setError(() => runtimeText(error.message)); }
    finally { endBusy(); }
  }

  async function deleteEditor(event) {
    event.preventDefault();
    const id = $('otpEditId').value;
    if (!id || !active || !editorOpen() || !isOpen('otpDeleteConfirm') || !beginBusy('delete')) return;
    setError();
    setStatus(text('Deleting OTP…', 'Đang xóa OTP…'));
    try {
      const response = await request({ type: 'OTP_DELETE', id });
      if (!response.ok) throw new Error(failure(response, 'Could not delete OTP.', 'Không thể xóa OTP.'));
      await adoptMutation(response, () => accounts.filter(item => item.id !== id));
      closeEditor(true);
      mutationToast(response, true);
    } catch (error) { setStatus(); setError(() => runtimeText(error.message)); }
    finally { endBusy(); }
  }

  function showQr(item) {
    if (busy || !active) return;
    try {
      const qr = (globalThis.qrcode || qrcode)(0, 'M');
      qr.addData(serializeOtpAuthUri(item));
      qr.make();
      const canvas = $('otpQrCanvas');
      canvas.width = canvas.height = 230;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(l('QR canvas is not available.', 'Không thể hiển thị ảnh QR.'));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 230, 230);
      context.fillStyle = '#000000';
      const count = qr.getModuleCount();
      const scale = 230 / (count + 8);
      for (let row = 0; row < count; row += 1) for (let col = 0; col < count; col += 1) {
        if (!qr.isDark(row, col)) continue;
        const x = Math.round((col + 4) * scale), y = Math.round((row + 4) * scale);
        context.fillRect(x, y, Math.round((col + 5) * scale) - x, Math.round((row + 5) * scale) - y);
      }
      $('otpQrTitle').textContent = item.issuer || l('OTP QR code', 'Mã QR OTP');
      $('otpQrTitle').dataset.otpFallbackTitle = item.issuer ? '' : 'true';
      setText('otpQrLabel', item.account || '');
      renderGeneration += 1;
      stopTimer();
      $('otpQrModal').classList.remove('hidden');
    } catch (error) { reportError(error, 'Could not display OTP QR code.', 'Không thể hiển thị QR OTP.'); }
  }

  function closeQr() {
    $('otpQrModal')?.classList.add('hidden');
    const canvas = $('otpQrCanvas');
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    syncTimer();
  }

  async function decodeImage(source) {
    if (typeof globalThis.jsQR !== 'function') throw new Error(l('QR decoder is not ready.', 'Bộ nhận diện QR chưa sẵn sàng.'));
    const width = source.width, height = source.height;
    if (!width || !height) throw new Error(l('The image is empty.', 'Ảnh không có nội dung.'));
    const scale = Math.min(1, 1200 / Math.max(width, height));
    const drawnWidth = Math.max(1, Math.round(width * scale));
    const drawnHeight = Math.max(1, Math.round(height * scale));
    const padding = Math.max(12, Math.round(Math.min(drawnWidth, drawnHeight) * 0.06));
    const canvas = document.createElement('canvas');
    canvas.width = drawnWidth + padding * 2;
    canvas.height = drawnHeight + padding * 2;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error(l('Could not read image pixels.', 'Không đọc được dữ liệu ảnh.'));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, padding, padding, drawnWidth, drawnHeight);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let result = globalThis.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    if (result?.data) return result.data;
    await new Promise(resolve => setTimeout(resolve, 0));
    let darkest = 255, lightest = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      const luminance = image.data[index] * .299 + image.data[index + 1] * .587 + image.data[index + 2] * .114;
      darkest = Math.min(darkest, luminance);
      lightest = Math.max(lightest, luminance);
    }
    const threshold = darkest + (lightest - darkest) * .56;
    for (let index = 0; index < image.data.length; index += 4) {
      const value = image.data[index] * .299 + image.data[index + 1] * .587 + image.data[index + 2] * .114 < threshold ? 0 : 255;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    result = globalThis.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    if (!result?.data) throw new Error(l('No QR code was found. Choose a clear, uncropped image.', 'Không tìm thấy QR. Hãy chọn ảnh rõ và không bị cắt.'));
    return result.data;
  }

  async function saveImported(uri) {
    const response = await request({ type: 'SAVE_QR_URI', uri });
    if (!response.ok) throw new Error(failure(response, 'Could not import the QR code.', 'Không thể nhập mã QR.'));
    await adoptMutation(response);
    showToast(() => response.importedCount > 1
      ? l(`Imported ${response.importedCount} OTP accounts`, `Đã nhập ${response.importedCount} tài khoản OTP`)
      : response.duplicate ? l('This OTP code already exists in Vault', 'Mã OTP này đã có trong Vault')
        : l('QR scanned and OTP saved automatically', 'Đã quét xong và tự lưu OTP'), 'success');
  }

  async function importImage(event, fromEditor) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || (fromEditor && !editorOpen()) || !beginBusy('image')) { input.value = ''; return; }
    let bitmap;
    try {
      if (fromEditor) { setError(); setStatus(text('Reading QR image…', 'Đang nhận diện ảnh QR…')); }
      else showToast(text('Reading QR image…', 'Đang nhận diện ảnh QR…'));
      bitmap = await createImageBitmap(file);
      const uri = await decodeImage(bitmap);
      const records = parseOtpQrUri(uri);
      if (fromEditor && records.length === 1) {
        if (!applyUri(serializeOtpAuthUri(records[0]), true)) return;
        editorTitle = 'scanned';
        setStatus(text('QR detected. Check the details, then select Save OTP.', 'Đã nhận diện QR. Kiểm tra thông tin rồi bấm Lưu OTP.'));
        showToast(text('QR code detected', 'Đã nhận diện mã QR'), 'success');
      } else {
        await saveImported(uri);
        if (fromEditor) closeEditor(true);
      }
    } catch (error) { reportError(error, 'Could not import the QR image.', 'Không nhập được ảnh QR.', fromEditor); }
    finally { bitmap?.close(); input.value = ''; endBusy(); }
  }

  function hideScanMenu() {
    $('headerScanMenu')?.classList.add('hidden');
    $('headerScanButton')?.setAttribute('aria-expanded', 'false');
  }

  function renderScanTargets(selected = $('otpScanTab')?.value) {
    const select = $('otpScanTab');
    if (!select) return;
    select.replaceChildren(...scanTargets.map(tab => {
      const option = document.createElement('option');
      option.value = String(tab.id);
      option.textContent = tab.title || tab.url || l(`Tab ${tab.id}`, `Thẻ ${tab.id}`);
      return option;
    }));
    if (scanTargets.some(tab => String(tab.id) === selected)) select.value = selected;
  }

  async function openScanPicker(fromEditor) {
    if (!active || !beginBusy('tabs')) return;
    hideScanMenu();
    scanFromEditor = fromEditor;
    try {
      await cancelPendingScan();
      if (!$('otpScanTab') || !$('otpScanPicker') || !$('otpScanStartBtn')) throw new Error(l(
        'The QR tab chooser is unavailable.', 'Không có công cụ chọn thẻ để quét QR.'));
      const [tabs, current] = await Promise.all([chrome.tabs.query({ currentWindow: true }), chrome.tabs.getCurrent()]);
      if (!active || disposed) return;
      scanTargets = tabs.filter(tab => Number.isInteger(tab.id) && tab.id !== current?.id
        && !(tab.url && tab.url.split('#')[0].split('?')[0] === location.href.split('#')[0].split('?')[0]));
      if (!scanTargets.length) throw new Error(l('Open a website tab before scanning QR.', 'Hãy mở một thẻ trang web trước khi quét QR.'));
      renderScanTargets();
      $('otpScanPicker').classList.remove('hidden');
      $('otpScanTab').focus();
    } catch (error) { reportError(error, 'Could not list tabs for scanning.', 'Không lấy được danh sách thẻ để quét.', fromEditor); }
    finally { endBusy(); }
  }

  async function cancelPendingScan() {
    const intent = pendingScanIntent;
    pendingScanIntent = null;
    if (intent) await cancelQrScanIntent(intent.id);
  }

  function cancelPendingScanSafely() {
    void cancelPendingScan().catch(error => reportError(error,
      'Could not cancel the QR scan request.', 'Không thể hủy yêu cầu quét QR.', false));
  }

  function closeScanPicker() {
    if (busy) return;
    cancelPendingScanSafely();
    $('otpScanPicker')?.classList.add('hidden');
    scanTargets = [];
    syncTimer();
  }

  async function startScan(event) {
    event.preventDefault();
    const tabId = Number($('otpScanTab')?.value);
    if (!active || !isOpen('otpScanPicker') || !scanTargets.some(tab => tab.id === tabId) || !beginBusy('scan')) return;
    let intent;
    const instruction = text(
      'On the selected tab, click the extension icon in the browser toolbar within 60 seconds to grant access and select a QR region. Keep this dashboard open.',
      'Trên thẻ đã chọn, bấm biểu tượng tiện ích trên thanh công cụ trình duyệt trong 60 giây để cấp quyền và khoanh vùng QR. Giữ bảng điều khiển này mở.');
    try {
      // Acknowledge before switching tabs: a toast on the hidden dashboard is not sufficient.
      window.alert(instruction());
      const selected = scanTargets.find(tab => tab.id === tabId);
      const target = await chrome.tabs.get(tabId);
      if (!active || disposed) return;
      if (!isQrScanTargetMatching({ tabId, windowId: selected.windowId, url: selected.url }, target)) throw new Error(l(
        'The selected tab changed. Choose the tab again.', 'Thẻ đã chọn đã thay đổi. Hãy chọn lại thẻ.'));
      intent = await armQrScanIntent(target);
      pendingScanIntent = intent;
      if (!active || disposed) { await cancelPendingScan(); return; }
      await chrome.tabs.update(tabId, { active: true });
      const activated = await chrome.tabs.get(tabId);
      if (!active || disposed || !isQrScanTargetMatching(intent, activated)) throw new Error(l(
        'The selected tab changed. Choose the tab again.', 'Thẻ đã chọn đã thay đổi. Hãy chọn lại thẻ.'));
      $('otpScanPicker').classList.add('hidden');
      scanTargets = [];
      if (scanFromEditor) { setError(); setStatus(instruction); }
      showToast(instruction);
    } catch (error) {
      if (intent) {
        try { await cancelQrScanIntent(intent.id); } catch { /* TTL also expires failed handoffs. */ }
        if (pendingScanIntent?.id === intent.id) pendingScanIntent = null;
      }
      try {
        const current = await chrome.tabs.getCurrent();
        if (Number.isInteger(current?.id)) await chrome.tabs.update(current.id, { active: true });
      } catch { /* The dashboard can be closing while the target tab changes. */ }
      // Include localized recovery guidance even when the browser supplies an untranslated error.
      const detail = typeof error?.message === 'string' ? error.message : '';
      reportError(l('Could not prepare QR scanning. Choose the tab and try again.',
        'Không thể chuẩn bị quét QR. Hãy chọn thẻ và thử lại.') + (detail ? ` ${runtimeText(detail)}` : ''),
      'Could not prepare QR scanning.', 'Không thể chuẩn bị quét QR.', scanFromEditor);
    } finally { endBusy(); }
  }

  function refreshLanguage() {
    updateDynamicLabels();
    renderScanTargets();
    if ($('otpQrTitle')?.dataset.otpFallbackTitle === 'true') setText('otpQrTitle', l('OTP QR code', 'Mã QR OTP'));
    // Static labels use the dashboard's data-i18n bindings; never translate user labels.
    renderGeneration += 1;
    syncTimer();
  }

  function setActive(value) {
    active = Boolean(value) && !disposed;
    renderGeneration += 1;
    loadGeneration += 1;
    cancelDrag();
    if (!active) { cancelPendingScanSafely(); if (!busy) closeScanPicker(); }
    syncTimer();
    if (active) void refreshAccounts();
  }

  bind('dashboardSearch', 'input', () => { cancelDrag(); renderGeneration += 1; syncTimer(); });
  bind('addOtpBtn', 'click', () => openEditor());
  bind('otpSaveBtn', 'click', saveEditor);
  bind('otpCancelBtn', 'click', event => { event.preventDefault(); closeEditor(); });
  bind('otpDeleteBtn', 'click', event => {
    event.preventDefault();
    if (busy || !$('otpEditId').value) return;
    $('otpDeleteBtn').classList.remove('visible');
    $('otpDeleteConfirm').classList.remove('hidden');
  });
  bind('otpDeleteCancelBtn', 'click', event => {
    event.preventDefault();
    if (busy) return;
    $('otpDeleteConfirm').classList.add('hidden');
    if ($('otpEditId').value) $('otpDeleteBtn').classList.add('visible');
  });
  bind('otpDeleteConfirmBtn', 'click', deleteEditor);
  bind('otpUri', 'input', () => { if (!busy && $('otpUri').value.trim()) applyUri($('otpUri').value.trim()); });
  for (const id of fields.filter(id => id !== 'otpUri')) {
    for (const event of ['input', 'change']) bind(id, event, () => { if (!applyingUri && !busy) $('otpUri').value = ''; });
  }
  bind('otpImageBtn', 'click', event => { event.preventDefault(); if (!busy) $('otpQrFile')?.click(); });
  bind('otpQrFile', 'change', event => { void importImage(event, true); });
  bind('headerQrFile', 'change', event => { void importImage(event, false); });
  bind('scanImportMenuBtn', 'click', () => { hideScanMenu(); if (!busy) $('headerQrFile')?.click(); });
  bind('scanScreenMenuBtn', 'click', () => { void openScanPicker(false); });
  bind('otpCameraBtn', 'click', event => { event.preventDefault(); void openScanPicker(true); });
  bind('otpScanStartBtn', 'click', event => { void startScan(event); });
  bind('otpScanCancelBtn', 'click', event => { event.preventDefault(); closeScanPicker(); });
  bind('otpQrCloseBtn', 'click', closeQr);
  bind('otpQrModal', 'click', event => { if (event.target === $('otpQrModal')) closeQr(); });
  bind('otpModal', 'click', event => { if (event.target === $('otpModal')) closeEditor(); });
  document.addEventListener('keydown', event => {
    if (!active || busy || event.key !== 'Escape') return;
    if (isOpen('otpScanPicker')) closeScanPicker();
    else if (isOpen('otpQrModal')) closeQr();
    else if (editorOpen()) closeEditor();
  });
  const onReturn = () => {
    if (document.hidden) { stopTimer(); renderGeneration += 1; return; }
    syncTimer();
    void refreshAccounts();
  };
  window.addEventListener('focus', onReturn);
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('pagehide', () => {
    disposed = true;
    active = false;
    cancelPendingScanSafely();
    renderGeneration += 1;
    loadGeneration += 1;
    cancelDrag();
    stopTimer();
    clearTimeout($('otpCopyToast')?.hideTimer);
  });
  refreshLanguage();
  return { setAccounts, setActive, refreshLanguage };
}
