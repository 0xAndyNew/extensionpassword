import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseOtpAuthUri, parseOtpQrUri, serializeOtpAuthUri } from '../src/vault/totp.js';
import { localizeRuntimeText } from '../src/i18n.js';
import { armQrScanIntent, cancelQrScanIntent, isQrScanTargetMatching, QR_SCAN_INTENT_KEY } from '../src/ui/qr-handoff.js';

const source = (await readFile(new URL('../src/ui/options-otp.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initOptionsOtp', 'function initOptionsOtp');
const html = await readFile(new URL('../src/ui/options.html', import.meta.url), 'utf8');
const account = { id: 'otp-1', issuer: 'GitHub', account: 'person@example.com', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30 };
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function harness(responder = () => ({ ok: true, otpAccounts: [account] }), extra = {}) {
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.value = ''; this.textContent = '';
      this.dataset = {}; this.disabled = false; this.listeners = {}; this.attributes = {};
      const classes = new Set();
      this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)),
        contains: v => classes.has(v), toggle: (v, force) => { const on = force ?? !classes.has(v); on ? classes.add(v) : classes.delete(v); return on; } };
      this.style = { setProperty() {} };
    }
    set className(value) { this._className = value; value.split(/\s+/).forEach(v => this.classList.add(v)); }
    get className() { return this._className || ''; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...nodes) { nodes.forEach(n => { n.parentNode = this; }); this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); if (this.tagName === 'SELECT') this.value = nodes[0]?.value || ''; }
    querySelectorAll(selector) { return this.children.flatMap(n => [...(selector === '.otp-card' && n.classList.contains('otp-card') ? [n] : []), ...n.querySelectorAll(selector)]); }
    closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; }
    focus() {}
    getContext() { return { clearRect() {}, fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }) }; }
    async fire(name, overrides = {}) {
      const event = { target: this, preventDefault() {}, stopPropagation() {}, ...overrides };
      for (const fn of this.listeners[name] || []) await fn(event);
      if (this[`on${name}`]) await this[`on${name}`](event);
      await settle();
    }
  }
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[1]); element.id = match[3];
    const classes = match[2].match(/class="([^"]+)"/); if (classes) element.className = classes[1];
    elements.set(element.id, element);
  }
  const $ = id => elements.get(id);
  const intervals = new Map(); let nextTimer = 0; let lang = 'en';
  const requests = [], copied = [], injections = [], updated = [], alerts = [];
  const docListeners = {}, windowListeners = {};
  const stored = {};
  const storage = { get: async key => ({ [key]: stored[key] }), set: async values => Object.assign(stored, values),
    remove: async key => { delete stored[key]; } };
  const target = { id: 2, windowId: 10, title: 'HTTP QR tab', url: 'http://example.com' };
  const context = {
    document: { hidden: false, getElementById: $, createElement: tag => new Element(tag),
      addEventListener: (name, fn) => { docListeners[name] = fn; } },
    window: { alert: message => { assert.equal(updated.length, 0, 'instructions precede activation'); alerts.push(message); },
      addEventListener: (name, fn) => { windowListeners[name] = fn; } },
    navigator: { clipboard: { writeText: async value => copied.push(value) } },
    location: { href: 'chrome-extension://test/src/ui/options.html' },
    chrome: { tabs: { query: async () => [{ id: 1, windowId: 10 }, target], get: async () => ({ ...target }),
      getCurrent: async () => ({ id: 1 }), update: async (...args) => updated.push(args) },
      scripting: { executeScript: async value => { injections.push(value); return [{ result: true }]; } } },
    setInterval: fn => { const id = ++nextTimer; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    setTimeout: () => ++nextTimer, clearTimeout() {},
    armQrScanIntent: tab => armQrScanIntent(tab, { storage }),
    cancelQrScanIntent: id => cancelQrScanIntent(id, { storage }), isQrScanTargetMatching,
    generateTotp: async () => '123456', parseOtpAuthUri, parseOtpQrUri, serializeOtpAuthUri, localizeRuntimeText,
    qrcode: () => ({ addData() {}, make() {}, getModuleCount: () => 21, isDark: () => false }),
    ...extra
  };
  runInNewContext(source, context);
  const changed = [];
  const api = context.initOptionsOtp({ getLanguage: () => lang,
    send: async message => { requests.push(message); return responder(message); },
    onAccountsChanged: value => changed.push(value) });
  return { $, api, requests, intervals, context, changed, copied, injections, updated, windowListeners, stored, alerts,
    setLanguage: value => { lang = value; api.refreshLanguage(); } };
}

test('OTP dashboard renders codes, copies a fresh code, and stops timer outside OTP', async () => {
  const h = harness(); h.api.setActive(true); await settle();
  const card = h.$('otpList').children[0];
  assert.equal(card.children[1].textContent, '123456');
  assert.equal(card.children[2].textContent, account.account);
  const countdown = card.children[3].children[1];
  assert.equal(countdown.children.length, 1, 'countdown text must sit above the ring center');
  await card.fire('click'); assert.deepEqual(h.copied, ['123456']);
  assert.equal(h.intervals.size, 1);
  h.api.setActive(false); assert.equal(h.intervals.size, 0);
});

test('OTP editor Cancel never writes, saving uses edited fields rather than the original URI', async () => {
  const h = harness(); h.api.setActive(true); await settle();
  await h.$('addOtpBtn').fire('click');
  h.$('otpSecret').value = account.secret;
  await h.$('otpCancelBtn').fire('click');
  assert.equal(h.$('otpSecret').value, '');
  assert.equal(h.requests.some(m => m.type === 'OTP_SAVE'), false);
  await h.$('addOtpBtn').fire('click');
  h.$('otpUri').value = serializeOtpAuthUri(account); await h.$('otpUri').fire('input');
  h.$('otpIssuer').value = 'Changed issuer'; await h.$('otpIssuer').fire('input');
  assert.equal(h.$('otpUri').value, '');
  await h.$('otpSaveBtn').fire('click');
  const payload = h.requests.find(m => m.type === 'OTP_SAVE');
  assert.equal(payload.issuer, 'Changed issuer'); assert.equal(payload.secret, account.secret);
  assert.equal(h.$('otpModal').classList.contains('hidden'), true);
});

test('OTP deletion requires confirmation and failed deletion keeps editor and accounts intact', async () => {
  const h = harness(message => message.type === 'OTP_DELETE' ? { ok: false, error: 'Cannot delete' } : { ok: true, otpAccounts: [account] });
  h.api.setActive(true); await settle();
  await h.$('otpList').children[0].children[3].children[0].children[2].fire('click');
  await h.$('otpDeleteBtn').fire('click');
  assert.equal(h.requests.some(m => m.type === 'OTP_DELETE'), false);
  await h.$('otpDeleteCancelBtn').fire('click');
  assert.equal(h.$('otpDeleteConfirm').classList.contains('hidden'), true);
  await h.$('otpDeleteBtn').fire('click'); await h.$('otpDeleteConfirmBtn').fire('click');
  assert.equal(h.requests.filter(m => m.type === 'OTP_DELETE').length, 1);
  assert.equal(h.$('otpModal').classList.contains('hidden'), false);
  assert.equal(h.$('otpSecret').value, account.secret);
  assert.equal(h.$('otpFormError').textContent, 'Cannot delete');
  assert.equal(h.changed.at(-1).length, 1);
});

test('OTP save disables duplicate requests until the first write completes', async () => {
  let resolveSave;
  const h = harness(message => message.type === 'OTP_SAVE' ? new Promise(resolve => { resolveSave = resolve; }) : { ok: true, otpAccounts: [] });
  h.api.setActive(true); await settle(); await h.$('addOtpBtn').fire('click');
  h.$('otpIssuer').value = account.issuer; h.$('otpSecret').value = account.secret;
  const first = h.$('otpSaveBtn').fire('click'); await settle();
  assert.equal(h.$('otpCancelBtn').disabled, true);
  await h.$('otpSaveBtn').fire('click');
  assert.equal(h.requests.filter(m => m.type === 'OTP_SAVE').length, 1);
  resolveSave({ ok: true, otpAccounts: [account] }); await first;
  assert.equal(h.$('otpCancelBtn').disabled, false);
});

test('drag reorder changes only visible accounts and preserves filtered-out positions', async () => {
  const second = { ...account, id: 'otp-2', account: 'second@example.com' };
  const hidden = { ...account, id: 'otp-hidden', issuer: 'Microsoft' };
  const h = harness(() => ({ ok: true, otpAccounts: [account, hidden, second] }));
  h.api.setActive(true); await settle();
  h.$('dashboardSearch').value = 'GitHub'; await h.$('dashboardSearch').fire('input');
  const [firstCard, secondCard] = h.$('otpList').children;
  await firstCard.children[3].children[0].children[0].fire('pointerdown');
  await firstCard.fire('dragstart');
  h.$('otpList').replaceChildren(secondCard, firstCard);
  await firstCard.fire('dragend');
  const reorder = h.requests.find(m => m.type === 'OTP_REORDER');
  assert.deepEqual(Array.from(reorder.ids), ['otp-2', 'otp-hidden', 'otp-1']);
});

test('locked OTP list clears previously decrypted accounts and stops the countdown timer', async () => {
  let locked = false;
  const h = harness(() => locked ? { ok: false, error: 'Vault is locked.' } : { ok: true, otpAccounts: [account] });
  h.api.setActive(true); await settle(); locked = true;
  h.windowListeners.focus(); await settle();
  assert.equal(h.changed.at(-1).length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.$('otpList').children[0].className, 'otp-load-error');
});

test('dashboard scan arms a toolbar handoff without injecting or closing the dashboard', async () => {
  const h = harness(); h.api.setActive(true); await settle();
  await h.$('scanScreenMenuBtn').fire('click');
  assert.equal(h.$('otpScanPicker').classList.contains('hidden'), false);
  h.$('otpScanTab').value = '2'; await h.$('otpScanStartBtn').fire('click');
  assert.equal(h.updated[0][0], 2);
  assert.match(h.alerts[0], /click the extension icon.*60 seconds/);
  assert.equal(h.injections.length, 0);
  assert.equal(h.stored[QR_SCAN_INTENT_KEY].tabId, 2);
  assert.equal(h.stored[QR_SCAN_INTENT_KEY].windowId, 10);
  assert.equal(h.stored[QR_SCAN_INTENT_KEY].url, 'http://example.com');
  assert.equal(h.$('otpScanPicker').classList.contains('hidden'), true);
  assert.match(h.$('otpCopyToast').textContent, /click the extension icon.*60 seconds/);
  h.setLanguage('vi');
  assert.match(h.$('otpCopyToast').textContent, /bấm biểu tượng tiện ích.*60 giây/);
  assert.doesNotMatch(source, /window\.close\(|scripting\.executeScript/);
  h.api.setActive(false); await settle();
  assert.equal(h.stored[QR_SCAN_INTENT_KEY], undefined, 'leaving OTP cancels a pending handoff');
});

for (const language of ['en', 'vi']) test(`handoff activation failure clears pending intent and reports ${language}`, async () => {
  const h = harness(); h.api.setActive(true); await settle(); h.setLanguage(language);
  await h.$('scanScreenMenuBtn').fire('click');
  h.context.chrome.tabs.update = async id => { if (id === 2) throw new Error(''); h.updated.push([id]); };
  h.$('otpScanTab').value = '2'; await h.$('otpScanStartBtn').fire('click');
  assert.equal(h.stored[QR_SCAN_INTENT_KEY], undefined);
  assert.equal(h.updated.at(-1)[0], 1);
  assert.match(h.$('otpCopyToast').textContent, language === 'vi' ? /Không thể chuẩn bị quét QR/ : /Could not prepare QR scanning/);
  assert.equal(h.$('otpScanStartBtn').disabled, false);
});

test('dashboard rejects navigation between choosing and arming a target', async () => {
  const h = harness(); h.api.setActive(true); await settle();
  await h.$('scanScreenMenuBtn').fire('click');
  h.context.chrome.tabs.get = async () => ({ id: 2, windowId: 10, url: 'https://changed.example/' });
  h.$('otpScanTab').value = '2'; await h.$('otpScanStartBtn').fire('click');
  assert.equal(h.stored[QR_SCAN_INTENT_KEY], undefined);
  assert.match(h.$('otpCopyToast').textContent, /selected tab changed/);
});

test('dashboard OTP dynamic editor labels support Vietnamese and English', async () => {
  const h = harness(); h.api.setActive(true); await settle(); await h.$('addOtpBtn').fire('click');
  h.setLanguage('vi'); assert.equal(h.$('otpDialogTitle').textContent, 'Thêm mã xác thực');
  assert.equal(h.$('otpSaveBtn').textContent, 'Lưu OTP');
  h.setLanguage('en'); assert.equal(h.$('otpSaveBtn').textContent, 'Save OTP');
});

test('QR import saves through the existing migration-aware background handler', async () => {
  let closed = false;
  const h = harness(() => ({ ok: true, otpAccounts: [account] }), {
    createImageBitmap: async () => ({ width: 20, height: 20, close() { closed = true; } }),
    jsQR: () => ({ data: serializeOtpAuthUri(account) })
  });
  h.api.setActive(true); await settle();
  h.$('headerQrFile').files = [{}]; await h.$('headerQrFile').fire('change');
  assert.equal(h.requests.filter(m => m.type === 'SAVE_QR_URI').length, 1);
  assert.equal(closed, true); assert.equal(h.$('headerQrFile').value, '');
});
