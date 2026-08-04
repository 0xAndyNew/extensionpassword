const CONTENT_ACTIONS = new Set([
  'OPEN_OPTIONS',
  'MATCH',
  'CHECK_EXISTS',
  'FILL',
  'SAVE',
  'CHECK_CAPTURE_ACCOUNT',
  'UPDATE_CAPTURE_PASSWORD',
  'STAGE_LOGIN_CAPTURE',
  'TAKE_LOGIN_CAPTURE',
  'DISMISS_LOGIN_CAPTURE',
  'CAPTURE_QR_SELECTION',
  'SAVE_QR_URI'
]);

function parseSenderUrl(sender) {
  const value = sender?.url || sender?.tab?.url || '';
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '[::1]';
}

export function getMessageContext(sender, runtimeId) {
  if (!sender || sender.id !== runtimeId) {
    return { kind: 'denied' };
  }

  const url = parseSenderUrl(sender);
  if (!url) return { kind: 'denied' };

  if (url.protocol === 'chrome-extension:' && url.hostname === runtimeId) {
    return { kind: 'extension', url: url.href };
  }

  if (sender.tab && (url.protocol === 'https:' || url.protocol === 'http:')) {
    if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
      return { kind: 'denied' };
    }
    return {
      kind: 'content',
      origin: url.origin,
      tabId: sender.tab.id,
      windowId: sender.tab.windowId,
      frameId: sender.frameId ?? 0,
      documentId: sender.documentId || null,
      url: url.href
    };
  }

  return { kind: 'denied' };
}

export function authorizeMessage(message, sender, runtimeId) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    throw new Error('Yêu cầu không hợp lệ.');
  }

  const context = getMessageContext(sender, runtimeId);
  if (context.kind === 'denied') {
    throw new Error('Nguồn yêu cầu không được phép.');
  }

  if (context.kind === 'content' && !CONTENT_ACTIONS.has(message.type)) {
    throw new Error('Trang web không được phép thực hiện hành động này.');
  }

  const normalizedMessage = context.kind === 'content'
    ? { ...message, origin: context.origin }
    : { ...message };

  return { message: normalizedMessage, context };
}

export function isContentAction(type) {
  return CONTENT_ACTIONS.has(type);
}
