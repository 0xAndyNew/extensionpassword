(() => {
  'use strict';

  const CLEANUP_KEY = '__aegisQrSelectorCleanup';
  const ORIGIN = location.origin;
  if (!['http:', 'https:'].includes(location.protocol)) return;

  try {
    globalThis[CLEANUP_KEY]?.();
  } catch {
    // A previous selector can already be detached while the page is changing.
  }

  let host = null;

  const send = async message => {
    try {
      return await chrome.runtime.sendMessage({ ...message, origin: ORIGIN });
    } catch (error) {
      return { ok: false, error: error?.message || 'Không thể kết nối với Aegis Vault.' };
    }
  };

  const setImportantStyle = (element, property, value) => {
    element.style.setProperty(property, value, 'important');
  };

  const cleanup = () => {
    if (!host) return;
    try {
      host.aegisCleanup?.();
    } catch {
      // The document can be unloading while cleanup runs.
    }
    host.remove();
    host = null;
    if (globalThis[CLEANUP_KEY] === cleanup) delete globalThis[CLEANUP_KEY];
  };
  globalThis[CLEANUP_KEY] = cleanup;

  const loadScreenshot = dataUrl => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không đọc được ảnh chụp màn hình.'));
    image.src = dataUrl;
  });

  const cropScreenshot = async (dataUrl, rect) => {
    const image = await loadScreenshot(dataUrl);
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

    const outputScale = Math.min(1, 1100 / Math.max(sourceWidth, sourceHeight));
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
    return canvas;
  };

  const makePaddedCanvas = source => {
    const padding = Math.max(12, Math.round(Math.min(source.width, source.height) * 0.06));
    const canvas = document.createElement('canvas');
    canvas.width = source.width + padding * 2;
    canvas.height = source.height + padding * 2;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, padding, padding);
    return canvas;
  };

  const highContrastImage = image => {
    const output = new Uint8ClampedArray(image.data);
    let darkest = 255;
    let lightest = 0;
    for (let index = 0; index < output.length; index += 4) {
      const luminance = Math.round(
        output[index] * 0.299 + output[index + 1] * 0.587 + output[index + 2] * 0.114
      );
      darkest = Math.min(darkest, luminance);
      lightest = Math.max(lightest, luminance);
    }
    const threshold = darkest + (lightest - darkest) * 0.56;
    for (let index = 0; index < output.length; index += 4) {
      const luminance = output[index] * 0.299 + output[index + 1] * 0.587 + output[index + 2] * 0.114;
      const value = luminance < threshold ? 0 : 255;
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = 255;
    }
    return new ImageData(output, image.width, image.height);
  };

  const decodeQrCanvas = async source => {
    const decoder = globalThis.jsQR;
    if (typeof decoder !== 'function') {
      throw new Error('Bộ nhận diện QR chưa được nạp. Hãy tải lại extension rồi thử lại.');
    }
    const padded = makePaddedCanvas(source);
    const context = padded.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, padded.width, padded.height);
    let result = decoder(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (result?.data) return result.data;

    await new Promise(resolve => requestAnimationFrame(resolve));
    const contrasted = highContrastImage(image);
    result = decoder(contrasted.data, contrasted.width, contrasted.height, {
      inversionAttempts: 'dontInvert'
    });
    return result?.data || '';
  };

  host = document.createElement('div');
  host.dataset.aegisQrSelector = 'active';
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
      border: 2px dashed #38bdf8;
      background: transparent;
      box-shadow: 0 0 0 9999px rgba(8, 15, 28, .62);
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
    .hint.success {
      border-color: rgba(134, 239, 172, .72);
      background: rgba(18, 92, 55, .96);
      color: #f0fdf4;
    }
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
    hint.style.display = '';
    cancel.style.display = '';
    hint.classList.add('error');
    hint.textContent = message;
  };

  const keyHandler = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  window.addEventListener('keydown', keyHandler, true);
  host.aegisCleanup = () => window.removeEventListener('keydown', keyHandler, true);

  cancel.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
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
      // Pointer capture can already be released when focus changes.
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
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const capture = await send({ type: 'CAPTURE_QR_SELECTION' });
    if (!capture?.ok || !capture.screenshot) {
      resetForRetry(capture?.error || 'Không chụp được vùng QR. Hãy thử lại.');
      return;
    }

    try {
      const qrCanvas = await cropScreenshot(capture.screenshot, rect);
      hint.style.display = 'block';
      hint.textContent = 'Đang nhận diện mã QR…';
      const uri = await decodeQrCanvas(qrCanvas);
      if (!uri) {
        resetForRetry('Không nhận diện được QR. Hãy khoanh sát trọn mã và chừa một ít viền trắng.');
        return;
      }
      hint.textContent = 'Đang tự lưu mã OTP…';
      const saved = await send({ type: 'SAVE_QR_URI', uri });
      if (!saved?.ok) {
        resetForRetry(saved?.error || 'Không lưu được mã OTP.');
        return;
      }
      hint.classList.add('success');
      hint.textContent = saved.duplicate
        ? 'Mã OTP này đã có trong Aegis Vault'
        : 'Đã quét xong và tự lưu mã OTP';
      selection.style.display = 'none';
      layer.classList.remove('selecting');
      layer.style.cursor = 'default';
      setTimeout(cleanup, 900);
    } catch (error) {
      resetForRetry(error?.message || 'Không xử lý được vùng QR đã chọn.');
    }
  };

  (document.documentElement || document.body).appendChild(host);
})();
