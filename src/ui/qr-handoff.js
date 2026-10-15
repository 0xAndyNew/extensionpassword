// A toolbar click grants activeTab; selecting a tab in the dashboard does not.
// Store only navigation metadata here, never QR contents or vault secrets.
export const QR_SCAN_INTENT_KEY = 'aegisPendingQrScanIntent';
export const QR_SCAN_INTENT_TTL_MS = 60_000;

const session = options => options.storage || globalThis.chrome?.storage?.session;
const clock = options => (options.now || Date.now)();
const validTarget = tab => Number.isInteger(tab?.id) && tab.id >= 0
  && Number.isInteger(tab.windowId) && tab.windowId >= 0;

export function isQrScanTargetMatching(target, tab) {
  return validTarget(tab) && target?.tabId === tab.id && target.windowId === tab.windowId
    && (!target.url || target.url === tab.url) && tab.status !== 'loading';
}

function isFresh(intent, now) {
  return intent && typeof intent.id === 'string' && intent.id.length > 0
    && Number.isInteger(intent.tabId) && intent.tabId >= 0
    && Number.isInteger(intent.windowId) && intent.windowId >= 0
    && Number.isFinite(intent.createdAt) && now >= intent.createdAt
    && now - intent.createdAt < QR_SCAN_INTENT_TTL_MS
    && (intent.url === undefined || typeof intent.url === 'string');
}

export async function armQrScanIntent(tab, options = {}) {
  if (!validTarget(tab) || tab.status === 'loading') throw new Error('The selected tab is no longer available.');
  const storage = session(options);
  if (!storage) throw new Error('QR scan handoff is unavailable.');
  const intent = { id: globalThis.crypto.randomUUID(), tabId: tab.id, windowId: tab.windowId,
    createdAt: clock(options), ...(tab.url ? { url: tab.url } : {}) };
  await storage.set({ [QR_SCAN_INTENT_KEY]: intent });
  return intent;
}

export async function cancelQrScanIntent(intentId, options = {}) {
  const storage = session(options);
  if (!storage) return;
  const intent = (await storage.get(QR_SCAN_INTENT_KEY))[QR_SCAN_INTENT_KEY];
  if (intent && (!intentId || intent.id === intentId)) await storage.remove(QR_SCAN_INTENT_KEY);
}

// Serialize competing popup consumers; Web Locks also cover separate extension contexts.
const consumeQueues = new WeakMap();
export async function consumeQrScanIntent(tab, options = {}) {
  const storage = session(options);
  if (!storage) return null;
  const consume = () => consumeIntent(tab, storage, options);
  if (globalThis.navigator?.locks?.request) {
    return navigator.locks.request(QR_SCAN_INTENT_KEY, consume);
  }
  const pending = (consumeQueues.get(storage) || Promise.resolve()).then(consume, consume);
  consumeQueues.set(storage, pending.catch(() => {}));
  return pending;
}

async function consumeIntent(tab, storage, options) {
  const intent = (await storage.get(QR_SCAN_INTENT_KEY))[QR_SCAN_INTENT_KEY];
  if (!intent) return null;
  if (!isFresh(intent, clock(options))) {
    await cancelQrScanIntent(intent.id, options);
    return null;
  }
  if (!isQrScanTargetMatching(intent, tab)) {
    if (intent.tabId === tab?.id) await cancelQrScanIntent(intent.id, options);
    return null;
  }
  await cancelQrScanIntent(intent.id, options);
  return intent;
}

// Background hooks: onUpdated(id, info), onRemoved(id) (no changeInfo).
export async function invalidateQrScanIntent(tabId, changeInfo = null, options = {}) {
  if (changeInfo && !Object.hasOwn(changeInfo, 'url') && changeInfo.status !== 'loading') return;
  const storage = session(options);
  if (!storage) return;
  const intent = (await storage.get(QR_SCAN_INTENT_KEY))[QR_SCAN_INTENT_KEY];
  if (intent?.tabId === tabId) await cancelQrScanIntent(intent.id, options);
}
