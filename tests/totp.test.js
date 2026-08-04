import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBase32,
  generateTotp,
  normalizeSecret,
  parseOtpAuthUri,
  parseAuthenticatorText,
  reorderOtpAccounts,
  serializeAuthenticatorText
} from '../src/vault/totp.js';

test('RFC 6238 SHA1 vector', async () => {
  assert.equal(
    await generateTotp({
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      algorithm: 'SHA1',
      digits: 8,
      period: 30
    }, 59000),
    '94287082'
  );
});

test('parses and serializes authenticator text in order', () => {
  const text = 'otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP&issuer=GitHub\ninvalid';
  const parsed = parseAuthenticatorText(text);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.errors[0].row, 2);
  assert.equal(parseOtpAuthUri(serializeAuthenticatorText(parsed.records)).account, 'user');
});

test('reorders known OTP entries while preserving newer Firestore-only entries', () => {
  const accounts = [
    { id: 'a' },
    { id: 'drive-only' },
    { id: 'b' },
    { id: 'c' }
  ];
  assert.deepEqual(
    reorderOtpAccounts(accounts, ['c', 'stale-local', 'a', 'b']).map(item => item.id),
    ['c', 'drive-only', 'a', 'b']
  );
  assert.throws(
    () => reorderOtpAccounts(accounts, ['a', 'a']),
    /không hợp lệ/
  );
});

test('normalizes formatted Base32 secrets and decodes a usable key', () => {
  const secret = normalizeSecret('jbsw-y3dp ehpk3pxp====');
  assert.equal(secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(decodeBase32(secret).length, 10);
});

test('rejects Base32 values that decode to an empty or undersized OTP key', () => {
  assert.throws(() => normalizeSecret('A'), /ít nhất 80 bit/);
  assert.throws(
    () => parseOtpAuthUri('otpauth://totp/Test?secret=ABCDEF'),
    /ít nhất 80 bit/
  );
});

test('rejects impossible Base32 lengths and non-zero trailing pad bits', () => {
  assert.throws(
    () => normalizeSecret('JBSWY3DPEHPK3PXPA'),
    /độ dài hoặc bit đệm/
  );
  assert.equal(normalizeSecret('JBSWY3DPEHPK3PXPAA'), 'JBSWY3DPEHPK3PXPAA');
  assert.throws(
    () => normalizeSecret('JBSWY3DPEHPK3PXPAB'),
    /độ dài hoặc bit đệm/
  );
});

test('rejects empty or oversized OTP labels and oversized URIs', () => {
  assert.throws(
    () => parseOtpAuthUri('otpauth://totp/?secret=JBSWY3DPEHPK3PXP'),
    /Nhãn tài khoản/
  );
  assert.throws(
    () => parseOtpAuthUri(
      `otpauth://totp/${'a'.repeat(4097)}?secret=JBSWY3DPEHPK3PXP`
    ),
    /Nhãn tài khoản/
  );
  assert.throws(
    () => parseOtpAuthUri(
      `otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&issuer=${'a'.repeat(17000)}`
    ),
    /URI OTP/
  );
});
