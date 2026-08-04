export const ENVELOPE_VERSION = 1;
export const KDF_ITERATIONS = 600000;
export const MIN_KDF_ITERATIONS = 100000;
export const MAX_KDF_ITERATIONS = 2000000;
// storage.local has a 10 MiB quota. Base64 adds roughly 4/3 overhead, so a
// 7 MiB encrypted payload stays below quota together with the envelope fields.
export const MAX_ENVELOPE_PAYLOAD_BYTES = 7 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  // Spreading a multi-megabyte vault into fromCharCode exceeds the JavaScript
  // argument limit. Build the binary string in bounded chunks instead.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value, maxBytes = MAX_ENVELOPE_PAYLOAD_BYTES) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new Error('Dữ liệu mã hóa Base64 không hợp lệ.');
  }
  const estimatedBytes = (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  if (estimatedBytes > maxBytes) throw new Error('Dữ liệu mã hóa vượt quá giới hạn cho phép.');
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new Error('Dữ liệu mã hóa Base64 không hợp lệ.');
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate every attacker-controlled field before invoking the deliberately
 * expensive PBKDF2 operation. The upper iteration bound prevents a malicious
 * backup/Firestore file from turning unlock into an unbounded CPU task.
 */
export function validateEnvelope(envelope, { maxPayloadBytes = MAX_ENVELOPE_PAYLOAD_BYTES } = {}) {
  if (!isPlainObject(envelope) || envelope.version !== ENVELOPE_VERSION) {
    throw new Error('Định dạng vault không được hỗ trợ.');
  }
  if (!isPlainObject(envelope.kdf) || envelope.kdf.name !== 'PBKDF2-SHA-256') {
    throw new Error('Cấu hình KDF của vault không hợp lệ.');
  }
  const iterations = envelope.kdf.iterations;
  if (!Number.isSafeInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) {
    throw new Error('Số vòng lặp KDF của vault không hợp lệ.');
  }
  if (!isPlainObject(envelope.cipher) || envelope.cipher.name !== 'AES-256-GCM') {
    throw new Error('Cấu hình mã hóa của vault không hợp lệ.');
  }

  const salt = base64ToBytes(envelope.kdf.salt, 64);
  const nonce = base64ToBytes(envelope.cipher.nonce, 32);
  const payload = base64ToBytes(envelope.payload, maxPayloadBytes);
  if (salt.length < 16 || salt.length > 64) throw new Error('Salt của vault không hợp lệ.');
  if (nonce.length !== 12) throw new Error('Nonce của vault không hợp lệ.');
  // AES-GCM always contributes a 16-byte authentication tag.
  if (payload.length < 16) throw new Error('Nội dung mã hóa của vault không hợp lệ.');
  if (envelope.updatedAt !== undefined && (!Number.isFinite(Date.parse(envelope.updatedAt)))) {
    throw new Error('Thời gian cập nhật của vault không hợp lệ.');
  }

  return { iterations, salt, nonce, payload };
}

async function deriveKey(password, salt, iterations) {
  if (typeof password !== 'string' || !password.length) throw new Error('Mật khẩu chính không hợp lệ.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createEnvelope(data, password, existingSalt) {
  const salt = existingSalt ? new Uint8Array(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  if (salt.length < 16 || salt.length > 64) throw new Error('Salt của vault không hợp lệ.');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const serialized = JSON.stringify(data);
  if (serialized === undefined) throw new Error('Dữ liệu vault không hợp lệ.');
  const plaintext = encoder.encode(serialized);
  if (plaintext.length + 16 > MAX_ENVELOPE_PAYLOAD_BYTES) {
    throw new Error('Vault vượt quá dung lượng tối đa cho phép.');
  }
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext);
  const protectedUpdatedAt = data?._meta?.updatedAt;
  const updatedAt = Number.isFinite(Date.parse(protectedUpdatedAt)) ? protectedUpdatedAt : new Date().toISOString();
  return {
    version: ENVELOPE_VERSION,
    kdf: { name: 'PBKDF2-SHA-256', iterations: KDF_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-256-GCM', nonce: bytesToBase64(nonce) },
    payload: bytesToBase64(new Uint8Array(cipher)),
    // Kept only as a backward-compatible hint. Conflict decisions prefer the
    // authenticated _meta.updatedAt and _meta.revision inside the ciphertext.
    updatedAt
  };
}

export async function openEnvelope(envelope, password) {
  const validated = validateEnvelope(envelope);
  const key = await deriveKey(password, validated.salt, validated.iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: validated.nonce },
      key,
      validated.payload
    );
  } catch {
    throw new Error('Mật khẩu chính không đúng hoặc vault đã bị hỏng.');
  }
  let data;
  try {
    data = JSON.parse(decoder.decode(plain));
  } catch {
    throw new Error('Nội dung vault sau giải mã không hợp lệ.');
  }
  if (!isPlainObject(data)) throw new Error('Nội dung vault sau giải mã không hợp lệ.');
  return data;
}
