import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { decodeBase32, generateTotp, parseOtpQrUri } from '../src/vault/totp.js';
import qrcode from '../src/vendor/qrcode-generator.js';
import '../src/vendor/jsqr.js';

const secret = 'JBSWY3DPEHPK3PXP';
const varint = value => {
  const bytes = [];
  let remaining = BigInt(value);
  do {
    const byte = Number(remaining & 127n);
    remaining >>= 7n;
    bytes.push(byte | (remaining ? 128 : 0));
  } while (remaining);
  return bytes;
};
const numberField = (field, value) => [...varint(field * 8), ...varint(value)];
const bytesField = (field, bytes) => [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes];
const stringField = (field, value) => bytesField(field, new TextEncoder().encode(value));
function entry({ name = 'Example:user@example.com', issuer = 'Example', algorithm = 1, digits = 1, type = 2 } = {}) {
  return [
    ...bytesField(1, decodeBase32(secret)),
    ...stringField(2, name),
    ...stringField(3, issuer),
    ...numberField(4, algorithm),
    ...numberField(5, digits),
    ...numberField(6, type)
  ];
}
function migration(entries, extra = [], version = 1) {
  const bytes = [...entries.flatMap(value => bytesField(1, value)), ...numberField(2, version), ...extra];
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(bytes).toString('base64'))}`;
}

test('QR import keeps ordinary TOTP URIs compatible', () => {
  assert.equal(parseOtpQrUri(`otpauth://totp/Example:user?secret=${secret}`)[0].secret, secret);
});

test('Google Authenticator migration imports multiple accounts and preserves OTP settings', async () => {
  const records = parseOtpQrUri(migration([
    entry(),
    entry({ name: 'Ví:người dùng', issuer: 'Ví', algorithm: 2, digits: 2 })
  ]));
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    issuer: 'Example', account: 'user@example.com', secret, algorithm: 'SHA1', digits: 6, period: 30
  });
  assert.deepEqual(records[1], {
    issuer: 'Ví', account: 'người dùng', secret, algorithm: 'SHA256', digits: 8, period: 30
  });
  assert.match(await generateTotp(records[1], 59000), /^\d{8}$/);
});

test('migration accepts label issuer fallback and URL-safe or unescaped Base64', () => {
  const uri = migration([entry({ issuer: '' })], numberField(5, 0xffffffffffffffffn));
  assert.equal(parseOtpQrUri(uri)[0].issuer, 'Example');
  const rawBase64 = new URL(uri).searchParams.get('data');
  assert.equal(parseOtpQrUri(`otpauth-migration://offline?data=${rawBase64}`)[0].secret, secret);
  const urlSafe = rawBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(parseOtpQrUri(`otpauth-migration://offline?data=${urlSafe}`)[0].secret, secret);
});

test('migration rejects unsupported entries and malformed payloads without returning partial records', () => {
  for (const unsupported of [{ type: 1 }, { algorithm: 4 }, { digits: 9 }]) {
    assert.throws(() => parseOtpQrUri(migration([entry(), entry(unsupported)])));
  }
  for (const uri of [
    'otpauth-migration://offline?data=not%21base64',
    'otpauth-migration://online?data=AA==',
    migration([]),
    migration([entry()], numberField(2, 99)),
    `otpauth-migration://offline?data=${Buffer.from([10, 255, 127]).toString('base64')}`,
    `otpauth-migration://offline?data=${Buffer.from([0]).toString('base64')}`,
    `otpauth-migration://offline?data=${Buffer.from([10, ...varint(0xffffffffffffffffn)]).toString('base64')}`,
    migration(Array.from({ length: 101 }, () => entry()))
  ]) {
    assert.throws(() => parseOtpQrUri(uri));
  }
});

test('Google Authenticator version 2 exports use the same OTP parameter schema', () => {
  assert.equal(parseOtpQrUri(migration([entry()], [], 2))[0].secret, secret);
  assert.throws(() => parseOtpQrUri(migration([entry()], [], 99)), /không được hỗ trợ/);
});

test('migration handles separate QR parts independently and ignores batch metadata', () => {
  const metadata = [...numberField(3, 2), ...numberField(4, 1), ...numberField(5, 12345)];
  assert.equal(parseOtpQrUri(migration([entry()], metadata)).length, 1);
});

test('jsQR decodes migration images and the shared OTP parser accepts the result', () => {
  const uri = migration([entry()]);
  const qr = qrcode(0, 'M');
  qr.addData(uri);
  qr.make();
  const moduleSize = 5;
  const width = (qr.getModuleCount() + 8) * moduleSize;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < qr.getModuleCount(); row += 1) {
    for (let column = 0; column < qr.getModuleCount(); column += 1) {
      if (!qr.isDark(row, column)) continue;
      for (let y = 0; y < moduleSize; y += 1) {
        for (let x = 0; x < moduleSize; x += 1) {
          const offset = (((row + 4) * moduleSize + y) * width + (column + 4) * moduleSize + x) * 4;
          pixels.fill(0, offset, offset + 3);
        }
      }
    }
  }
  const decoded = globalThis.jsQR(pixels, width, width, { inversionAttempts: 'attemptBoth' });
  assert.equal(decoded?.data, uri);
  assert.equal(parseOtpQrUri(decoded.data)[0].account, 'user@example.com');
});

async function qrHandler(existingAccounts = []) {
  const source = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');
  const start = source.indexOf("  if (message.type === 'SAVE_QR_URI') {");
  const end = source.indexOf("  if (message.type === 'LIST')", start);
  assert.ok(start >= 0 && end > start);
  const writes = [];
  const mutations = [];
  const pending = [];
  const context = {
    parseOtpQrUri,
    asText: value => value,
    otpIdentity: item => `${item.secret}|${item.account}|${item.issuer}`,
    vault: { otpAccounts: [...existingAccounts] },
    user: { sub: 'test-user' },
    password: 'test-password',
    context: { kind: 'extension' },
    crypto: { randomUUID: () => `otp-${mutations.length}-${pending.length}-${context.vault.otpAccounts.length}-${context.nextId++}` },
    nextId: 0,
    writeVaultLocal: async vault => writes.push(structuredClone(vault)),
    appendPendingMutations: async (uid, operations) => mutations.push(...operations),
    rememberPendingQrSync: async id => pending.push(id),
    scheduleDeferredQrSync: async () => {},
    chrome: { storage: { session: { set: async () => {} } } },
    OPEN_OTP_TAB_SESSION_KEY: 'open',
    LAST_QR_SAVED_SESSION_KEY: 'last',
    setQrActionBadge: async () => {}
  };
  runInNewContext(`async function handle(message) { ${source.slice(start, end)} }`, context);
  return { handle: context.handle, writes, mutations, pending };
}

test('shared QR save handler imports all entries, skips duplicates, and queues each new account', async () => {
  const uri = migration([entry(), entry({ name: 'Example:second' }), entry()]);
  const handler = await qrHandler();
  const response = await handler.handle({ type: 'SAVE_QR_URI', uri });
  assert.equal(response.importedCount, 2);
  assert.equal(response.duplicateCount, 1);
  assert.equal(response.otpAccounts.length, 2);
  assert.equal(handler.writes.length, 1);
  assert.equal(handler.mutations.length, 2);
  assert.equal(handler.pending.length, 2);
  assert.equal(response.queueAutomaticSync, true);
  const repeated = await handler.handle({ type: 'SAVE_QR_URI', uri });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.importedCount, 0);
  assert.equal(handler.writes.length, 1);
});

test('shared QR save handler leaves the vault unchanged if any migration entry is unsupported', async () => {
  const handler = await qrHandler();
  await assert.rejects(handler.handle({
    type: 'SAVE_QR_URI', uri: migration([entry(), entry({ type: 1 })])
  }));
  assert.equal(handler.writes.length, 0);
  assert.equal(handler.mutations.length, 0);
});

test('editor image import and scan button use the migration-aware QR flow', async () => {
  const popup = await readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
  assert.match(popup, /const records = parseOtpQrUri\(result\.data\)/);
  assert.match(popup, /records\.length > 1[\s\S]*?await saveImportedQr\(result\.data\)/);
  assert.match(popup, /acceptQr\(serializeOtpAuthUri\(records\[0\]\)\)/);
  assert.match(popup, /otpCameraButton\.onclick = \(\) => \{ void scanVisibleTabForOtp\(otpCameraButton\); \}/);
});
