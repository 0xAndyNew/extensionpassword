const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MIN_SECRET_BYTES = 10;
const MAX_SECRET_CHARS = 4096;
const MAX_OTP_URI_CHARS = 16384;
const MAX_ISSUER_CHARS = 512;
const MAX_ACCOUNT_CHARS = 4096;
const SUPPORTED_ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);
const SUPPORTED_DIGITS = new Set([6, 7, 8]);
const VALID_UNPADDED_LENGTH_REMAINDERS = new Set([0, 2, 4, 5, 7]);

function decodeNormalizedBase32(secret) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const character of secret) {
    buffer = (buffer << 5) | BASE32.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

export function normalizeSecret(value = '') {
  const raw = String(value).toUpperCase().trim().replace(/[\s-]+/g, '');
  const secret = raw.replace(/=+$/, '');
  if (
    !secret
    || secret.length > MAX_SECRET_CHARS
    || secret.includes('=')
    || [...secret].some(character => !BASE32.includes(character))
  ) {
    throw new Error('Secret Base32 không hợp lệ.');
  }
  if (decodeNormalizedBase32(secret).length < MIN_SECRET_BYTES) {
    throw new Error('Secret OTP phải có ít nhất 80 bit (16 ký tự Base32).');
  }
  const lengthRemainder = secret.length % 8;
  const trailingBits = (secret.length * 5) % 8;
  const lastValue = BASE32.indexOf(secret.at(-1));
  if (
    !VALID_UNPADDED_LENGTH_REMAINDERS.has(lengthRemainder)
    || (trailingBits && (lastValue & ((1 << trailingBits) - 1)) !== 0)
  ) {
    throw new Error('Secret Base32 có độ dài hoặc bit đệm không hợp lệ.');
  }
  return secret;
}

export function decodeBase32(value) {
  return decodeNormalizedBase32(normalizeSecret(value));
}

function normalizeAlgorithm(value = 'SHA1') {
  const algorithm = String(value).toUpperCase().replaceAll('-', '');
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
    throw new Error('Thuật toán OTP không được hỗ trợ.');
  }
  return algorithm;
}

function normalizeDigits(value = 6) {
  const digits = Number(value);
  if (!SUPPORTED_DIGITS.has(digits)) {
    throw new Error('OTP phải có từ 6 đến 8 chữ số.');
  }
  return digits;
}

function normalizePeriod(value = 30) {
  const period = Number(value);
  if (!Number.isInteger(period) || period < 5 || period > 300) {
    throw new Error('Chu kỳ OTP không hợp lệ.');
  }
  return period;
}

export function parseOtpAuthUri(value) {
  const rawValue = String(value).trim();
  if (!rawValue || rawValue.length > MAX_OTP_URI_CHARS) {
    throw new Error('URI OTP không hợp lệ.');
  }
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error('URI OTP không hợp lệ.');
  }
  if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
    throw new Error('Chỉ hỗ trợ URI TOTP.');
  }

  let label;
  try {
    label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Nhãn tài khoản OTP không hợp lệ.');
  }
  const separator = label.indexOf(':');
  const labelIssuer = separator >= 0 ? label.slice(0, separator).trim() : '';
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim();
  const issuer = (url.searchParams.get('issuer') || labelIssuer || account).trim();
  if (
    (!issuer && !account)
    || issuer.length > MAX_ISSUER_CHARS
    || account.length > MAX_ACCOUNT_CHARS
  ) {
    throw new Error('Nhãn tài khoản OTP không hợp lệ.');
  }
  return {
    issuer,
    account,
    secret: normalizeSecret(url.searchParams.get('secret') || ''),
    algorithm: normalizeAlgorithm(url.searchParams.get('algorithm') || 'SHA1'),
    digits: normalizeDigits(url.searchParams.get('digits') || 6),
    period: normalizePeriod(url.searchParams.get('period') || 30)
  };
}

function encodeBase32(bytes) {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) result += BASE32[(buffer << (5 - bits)) & 31];
  return result;
}

function readMigrationFields(bytes) {
  let offset = 0;
  function readVarint() {
    let value = 0n;
    for (let index = 0; index < 10; index += 1) {
      if (offset >= bytes.length) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      const byte = bytes[offset++];
      if (index === 9 && byte > 1) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      value |= BigInt(byte & 127) << BigInt(index * 7);
      if (!(byte & 128)) return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
    throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
  }
  const fields = new Map();
  while (offset < bytes.length) {
    const tag = readVarint();
    if (typeof tag !== 'number') throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (!field || field > 0x1fffffff) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
    let value;
    if (wire === 0) {
      value = readVarint();
    } else if (wire === 2) {
      const length = readVarint();
      if (typeof length !== 'number' || length > bytes.length - offset) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      value = bytes.subarray(offset, offset + length);
      offset += length;
    } else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > bytes.length) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      continue;
    } else {
      throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return fields;
}

export function parseOtpQrUri(value) {
  const raw = String(value).trim();
  if (!raw.toLowerCase().startsWith('otpauth-migration:')) return [parseOtpAuthUri(raw)];
  if (raw.length > MAX_OTP_URI_CHARS) throw new Error('URI OTP không hợp lệ.');
  const url = new URL(raw);
  if (url.hostname.toLowerCase() !== 'offline') throw new Error('URI OTP không hợp lệ.');
  const data = (url.searchParams.get('data') || '').replace(/ /g, '+');
  if (!data || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) {
    throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
  }
  let bytes;
  try {
    bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
  } catch {
    throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
  }
  const fields = readMigrationFields(bytes);
  const entries = fields.get(1) || [];
  if (!entries.length || entries.length > 100) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
  const versions = fields.get(2);
  if (versions && (versions.length !== 1 || ![1, 2].includes(versions[0]))) {
    throw new Error('Phiên bản QR Google Authenticator không được hỗ trợ.');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return entries.map(entry => {
    if (!(entry instanceof Uint8Array)) throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
    const parameters = readMigrationFields(entry);
    function getBytes(field) {
      const values = parameters.get(field);
      if (!values) return new Uint8Array();
      if (values.length !== 1 || !(values[0] instanceof Uint8Array)) {
        throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      }
      return values[0];
    }
    function getNumber(field) {
      const values = parameters.get(field);
      if (!values) return 0;
      if (values.length !== 1 || typeof values[0] !== 'number') {
        throw new Error('Dữ liệu QR Google Authenticator không hợp lệ.');
      }
      return values[0];
    }
    if (getNumber(6) !== 2) throw new Error('Chỉ hỗ trợ URI TOTP.');
    const algorithm = { 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' }[getNumber(4)];
    if (!algorithm) throw new Error('Thuật toán OTP không được hỗ trợ.');
    const digits = { 1: 6, 2: 8 }[getNumber(5)];
    if (!digits) throw new Error('OTP phải có từ 6 đến 8 chữ số.');
    let name;
    let issuer;
    try {
      name = decoder.decode(getBytes(2)).trim();
      issuer = decoder.decode(getBytes(3)).trim();
    } catch {
      throw new Error('Nhãn tài khoản OTP không hợp lệ.');
    }
    const separator = name.indexOf(':');
    const account = (separator >= 0 ? name.slice(separator + 1) : name).trim();
    issuer ||= separator >= 0 ? name.slice(0, separator).trim() : account;
    return parseOtpAuthUri(serializeOtpAuthUri({
      issuer,
      account,
      secret: encodeBase32(getBytes(1)),
      algorithm,
      digits,
      period: 30
    }));
  });
}

export function serializeOtpAuthUri(item) {
  const issuer = String(item.issuer || '').trim();
  const account = String(item.account || '').trim();
  if (
    (!issuer && !account)
    || issuer.length > MAX_ISSUER_CHARS
    || account.length > MAX_ACCOUNT_CHARS
  ) {
    throw new Error('Nhãn tài khoản OTP không hợp lệ.');
  }
  const label = issuer && account ? `${issuer}:${account}` : (account || issuer);
  const algorithm = normalizeAlgorithm(item.algorithm || 'SHA1');
  const digits = normalizeDigits(item.digits ?? 6);
  const period = normalizePeriod(item.period ?? 30);
  const params = new URLSearchParams({ secret: normalizeSecret(item.secret) });
  if (issuer) params.set('issuer', issuer);
  if (algorithm !== 'SHA1') params.set('algorithm', algorithm);
  if (digits !== 6) params.set('digits', String(digits));
  if (period !== 30) params.set('period', String(period));
  return `otpauth://totp/${encodeURIComponent(label).replace(/%3A/g, ':')}?${params}`;
}

export function parseAuthenticatorText(text) {
  const records = [];
  const errors = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      records.push(parseOtpAuthUri(line));
    } catch (error) {
      errors.push({ row: index + 1, reason: error.message });
    }
  });
  return {
    total: lines.filter(line => line.trim()).length,
    records,
    errors
  };
}

export function serializeAuthenticatorText(items) {
  return items.map(serializeOtpAuthUri).join('\r\n');
}

export function reorderOtpAccounts(accounts, requestedIds) {
  if (!Array.isArray(accounts) || !Array.isArray(requestedIds)) {
    throw new Error('Thứ tự OTP không hợp lệ.');
  }
  const itemById = new Map(accounts.map(item => [item.id, item]));
  const seen = new Set();
  const requestedExistingIds = [];
  for (const id of requestedIds) {
    if (seen.has(id)) throw new Error('Thứ tự OTP không hợp lệ.');
    seen.add(id);
    if (itemById.has(id)) requestedExistingIds.push(id);
  }
  if (accounts.length && !requestedExistingIds.length) {
    throw new Error('Danh sách OTP đã thay đổi trên Firestore. Hãy thử kéo lại.');
  }

  const requestedSet = new Set(requestedExistingIds);
  let cursor = 0;
  return accounts.map(item => (
    requestedSet.has(item.id)
      ? itemById.get(requestedExistingIds[cursor++])
      : item
  ));
}

export async function generateTotp(item, timestamp = Date.now()) {
  const period = normalizePeriod(item.period ?? 30);
  const digits = normalizeDigits(item.digits ?? 6);
  const algorithm = normalizeAlgorithm(item.algorithm || 'SHA1')
    .replace('SHA1', 'SHA-1')
    .replace('SHA256', 'SHA-256')
    .replace('SHA512', 'SHA-512');
  const instant = Number(timestamp);
  if (!Number.isFinite(instant) || instant < 0) {
    throw new Error('Thời gian OTP không hợp lệ.');
  }

  const counter = Math.floor(instant / 1000 / period);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase32(item.secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer));
  const offset = hash[hash.length - 1] & 15;
  const binary = ((hash[offset] & 127) << 24)
    | (hash[offset + 1] << 16)
    | (hash[offset + 2] << 8)
    | hash[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, '0');
}
