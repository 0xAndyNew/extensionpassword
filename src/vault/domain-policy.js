const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const EXPLICIT_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
const ANY_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const BARE_HOST_WITH_PORT = /^[^/:?#\s]+:\d+(?:[/?#]|$)/i;

/**
 * Return the serialized web origin for a URL.
 *
 * Bare host names are treated as HTTPS for compatibility with credentials
 * created by older versions of Aegis. Explicit non-web schemes are rejected.
 */
export function normalizeOrigin(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Unsupported origin: ' + raw);

  let url;
  try {
    if (raw.startsWith('//')) {
      url = new URL(`https:${raw}`);
    } else if (EXPLICIT_SCHEME.test(raw)) {
      url = new URL(raw);
    } else if (ANY_SCHEME.test(raw) && !BARE_HOST_WITH_PORT.test(raw)) {
      throw new Error('Unsupported scheme');
    } else {
      url = new URL(`https://${raw}`);
    }
  } catch {
    throw new Error('Unsupported origin: ' + raw);
  }

  if (!WEB_PROTOCOLS.has(url.protocol) || !url.hostname) {
    throw new Error('Unsupported origin: ' + raw);
  }

  return url.origin;
}

function getCredentialOrigins(credential) {
  if (!credential || typeof credential !== 'object') return [];

  const values = [];
  // `origins` is the current format. Keep accepting the legacy singular
  // `origin` and `url` fields so existing vaults continue to work.
  if (Array.isArray(credential.origins)) values.push(...credential.origins);
  else if (typeof credential.origins === 'string') values.push(credential.origins);
  values.push(credential.origin, credential.url);

  const normalized = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    try {
      normalized.add(normalizeOrigin(value));
    } catch {
      // One malformed legacy entry must not make other valid entries unusable.
    }
  }
  return normalized;
}

/**
 * Credentials match only the exact URL origin: scheme, host and effective
 * port. In particular, no base-domain or sibling-subdomain inference is made.
 */
export function matchesOrigin(credential, origin) {
  try {
    return getCredentialOrigins(credential).has(normalizeOrigin(origin));
  } catch {
    return false;
  }
}
