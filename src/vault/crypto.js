export const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
export const base64ToBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createEnvelope(data, password, existingSalt) {
  const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const key = await deriveKey(password, salt, iterations);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, encoder.encode(JSON.stringify(data)));
  return { version: 1, kdf: { name: 'PBKDF2-SHA-256', iterations, salt: bytesToBase64(salt) }, cipher: { name: 'AES-256-GCM', nonce: bytesToBase64(nonce) }, payload: bytesToBase64(new Uint8Array(cipher)), updatedAt: new Date().toISOString() };
}

export async function openEnvelope(envelope, password) {
  const key = await deriveKey(password, base64ToBytes(envelope.kdf.salt), envelope.kdf.iterations);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.nonce) }, key, base64ToBytes(envelope.payload));
  return JSON.parse(decoder.decode(plain));
}
