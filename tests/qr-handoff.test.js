import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { armQrScanIntent, cancelQrScanIntent, consumeQrScanIntent, invalidateQrScanIntent,
  QR_SCAN_INTENT_KEY, QR_SCAN_INTENT_TTL_MS } from '../src/ui/qr-handoff.js';

const tab = { id: 12, windowId: 3, url: 'http://example.com/qr', status: 'complete' };
function session() {
  const data = {};
  return { data, get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, values),
    remove: async key => { delete data[key]; } };
}

test('handoff is session-only metadata, bound to tab/window/URL and consumed once', async () => {
  const storage = session(), options = { storage, now: () => 100 };
  const intent = await armQrScanIntent(tab, options);
  assert.deepEqual(Object.keys(intent).sort(), ['createdAt', 'id', 'tabId', 'url', 'windowId']);
  assert.equal(await consumeQrScanIntent({ ...tab, id: 13 }, options), null);
  assert.equal(await consumeQrScanIntent({ ...tab, windowId: 4, id: 13 }, options), null);
  assert.deepEqual(await consumeQrScanIntent(tab, options), intent);
  assert.equal(await consumeQrScanIntent(tab, options), null);
});

test('concurrent consumers cannot reuse a one-shot intent', async () => {
  const storage = session();
  await armQrScanIntent(tab, { storage });
  const results = await Promise.all([consumeQrScanIntent(tab, { storage }), consumeQrScanIntent(tab, { storage })]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('handoff accepts missing URL metadata but cancels navigation or moved targets', async () => {
  const storage = session(), options = { storage, now: () => 100 };
  await armQrScanIntent({ id: tab.id, windowId: tab.windowId }, options);
  assert.ok(await consumeQrScanIntent(tab, options));
  for (const changed of [{ ...tab, url: 'https://other.example/' }, { ...tab, windowId: 9 }, { ...tab, status: 'loading' }]) {
    await armQrScanIntent(tab, options);
    assert.equal(await consumeQrScanIntent(changed, options), null);
    assert.equal(storage.data[QR_SCAN_INTENT_KEY], undefined);
  }
});

test('stale, future, malformed, cancelled and replaced handoffs cannot scan', async () => {
  const storage = session();
  const intent = await armQrScanIntent(tab, { storage, now: () => 100 });
  assert.equal(await consumeQrScanIntent(tab, { storage, now: () => 100 + QR_SCAN_INTENT_TTL_MS }), null);
  assert.equal(storage.data[QR_SCAN_INTENT_KEY], undefined);
  await storage.set({ [QR_SCAN_INTENT_KEY]: intent });
  assert.equal(await consumeQrScanIntent(tab, { storage, now: () => 99 }), null);
  await storage.set({ [QR_SCAN_INTENT_KEY]: { tabId: tab.id } });
  assert.equal(await consumeQrScanIntent(tab, { storage, now: () => 100 }), null);
  const first = await armQrScanIntent(tab, { storage });
  const second = await armQrScanIntent(tab, { storage });
  await cancelQrScanIntent(first.id, { storage });
  assert.equal(storage.data[QR_SCAN_INTENT_KEY].id, second.id);
  await cancelQrScanIntent(second.id, { storage });
  assert.equal(storage.data[QR_SCAN_INTENT_KEY], undefined);
});

test('background helper invalidates URL/loading/removal only for the intended tab', async () => {
  const storage = session();
  await armQrScanIntent(tab, { storage });
  await invalidateQrScanIntent(99, null, { storage });
  await invalidateQrScanIntent(tab.id, { title: 'new title', status: 'complete' }, { storage });
  assert.ok(storage.data[QR_SCAN_INTENT_KEY]);
  for (const change of [{ status: 'loading' }, { url: tab.url }, null]) {
    await armQrScanIntent(tab, { storage });
    await invalidateQrScanIntent(tab.id, change, { storage });
    assert.equal(storage.data[QR_SCAN_INTENT_KEY], undefined);
  }
});

const popupSource = await readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
const scanSource = popupSource.slice(popupSource.indexOf('async function currentScanTab('), popupSource.indexOf('const otpCameraButton'));
function popupHarness() {
  let current = { ...tab }, unlocked = true;
  const storage = session(), injections = [], toasts = [];
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { textContent: id, disabled: false });
    return elements.get(id);
  };
  const context = { $, screenScanInFlight: false, otpSaveInFlight: false, vaultUnlocked: true, popupClosed: false,
    l: en => en, showOtpToast: (...args) => toasts.push(args), window: { close: () => { context.closed = true; } },
    send: async () => ({ ok: true, unlocked }),
    chrome: { tabs: { query: async () => [{ ...current }] }, scripting: { executeScript: async payload => { injections.push(payload); } } },
    consumeQrScanIntent: value => consumeQrScanIntent(value, { storage }),
    isQrScanTargetMatching: (target, value) => target?.tabId === value?.id && target.windowId === value.windowId
      && (!target.url || target.url === value.url) && value.status !== 'loading' };
  runInNewContext(scanSource, context);
  return { context, storage, injections, toasts, $, setTab: value => { current = value; }, setUnlocked: value => { unlocked = value; } };
}

test('only unlocked target popup consumes and scans pending handoff', async () => {
  const h = popupHarness();
  await armQrScanIntent(tab, { storage: h.storage });
  h.context.vaultUnlocked = false;
  await h.context.startPendingQrScan();
  assert.ok(h.storage.data[QR_SCAN_INTENT_KEY]);
  h.context.vaultUnlocked = true;
  h.setTab({ ...tab, id: 99 });
  await h.context.startPendingQrScan();
  assert.equal(h.injections.length, 0);
  assert.ok(h.storage.data[QR_SCAN_INTENT_KEY]);
  h.setTab(tab);
  await h.context.startPendingQrScan();
  assert.equal(h.injections.length, 1);
  assert.equal(h.injections[0].target.tabId, tab.id);
  assert.equal(h.storage.data[QR_SCAN_INTENT_KEY], undefined);
  assert.equal(h.context.closed, true);
  await h.context.startPendingQrScan();
  assert.equal(h.injections.length, 1);
});

test('popup checks backend lock status before consumption', async () => {
  const h = popupHarness();
  await armQrScanIntent(tab, { storage: h.storage });
  h.setUnlocked(false);
  await h.context.startPendingQrScan();
  assert.ok(h.storage.data[QR_SCAN_INTENT_KEY]);
  assert.equal(h.injections.length, 0);
});

test('popup rejects target changes during async status and revalidates after injection', async () => {
  const h = popupHarness();
  const target = { tabId: tab.id, windowId: tab.windowId, url: tab.url };
  h.context.send = async () => { h.setTab({ ...tab, url: 'https://changed.example/' }); return { ok: true, unlocked: true }; };
  await h.context.scanVisibleTabForOtp(undefined, target);
  assert.equal(h.injections.length, 0);
  assert.match(h.$('otpFormError').textContent, /selected tab changed/);
  assert.equal(h.context.screenScanInFlight, false);
  h.setTab(tab);
  h.context.send = async () => ({ ok: true, unlocked: true });
  h.context.chrome.scripting.executeScript = async () => { h.setTab({ ...tab, id: 88 }); };
  await h.context.scanVisibleTabForOtp(undefined, target);
  assert.equal(h.context.closed, undefined);
  assert.match(h.$('otpFormError').textContent, /selected tab changed/);
});

test('handoff and scanner failures resolve without unhandled promise rejections', async () => {
  const h = popupHarness();
  h.context.consumeQrScanIntent = async () => { throw new Error('Session unavailable'); };
  await assert.doesNotReject(h.context.startPendingQrScan());
  assert.match(h.toasts.at(-1)[0], /Session unavailable/);
  h.context.chrome.scripting.executeScript = async () => { throw new Error('Cannot access contents of page'); };
  await assert.doesNotReject(h.context.scanVisibleTabForOtp());
  assert.match(h.$('otpFormError').textContent, /browser does not allow/);
  assert.equal(h.context.screenScanInFlight, false);
  assert.equal(h.$('otpCameraBtn').disabled, false);
  assert.match(popupSource, /await init\(\);\s*await startPendingQrScan\(\)/);
  assert.match(popupSource, /await showVault\(\);\s*await startPendingQrScan\(\)/);
});
