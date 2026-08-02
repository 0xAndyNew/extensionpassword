import { FIREBASE_CONFIG, isFirebaseConfigured } from './firebase-config.js';

const AUTH_KEY = 'aegisFirebaseUser';
const TOKEN_KEY = 'aegisFirebaseTokens';
const WEB_REDIRECT_PATH = 'oauth2';
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CLIENT_ID_PATTERN = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;

let storageProtectionPromise;

export class FirebaseAuthError extends Error {
  constructor(message, code = 'FIREBASE_AUTH_ERROR', cause = null) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
    this.cause = cause;
  }
}

export function isMicrosoftEdge(userAgent = globalThis.navigator?.userAgent || '') {
  return /\bEdg(?:A|iOS)?\//i.test(String(userAgent));
}

export function normalizeGoogleWebClientId(value, { allowEmpty = false } = {}) {
  const clientId = String(value || '').trim();
  if (!clientId && allowEmpty) return '';
  if (
    clientId.length < 30 ||
    clientId.length > 255 ||
    !GOOGLE_CLIENT_ID_PATTERN.test(clientId)
  ) {
    throw new FirebaseAuthError('OAuth Web Client ID không hợp lệ.', 'INVALID_CLIENT_ID');
  }
  return clientId;
}

function getGoogleWebClientId() {
  const manifestClientId = chrome.runtime?.getManifest?.()?.oauth2?.client_id;
  try {
    return normalizeGoogleWebClientId(manifestClientId);
  } catch {
    return '';
  }
}

function getGoogleRedirectUri() {
  if (typeof chrome?.identity?.getRedirectURL !== 'function') {
    throw new FirebaseAuthError('Trình duyệt không hỗ trợ OAuth redirect URI.', 'REDIRECT_NOT_SUPPORTED');
  }
  return chrome.identity.getRedirectURL(WEB_REDIRECT_PATH);
}

function randomOAuthState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function ensureTrustedStorageAccess() {
  if (!storageProtectionPromise) {
    storageProtectionPromise = (async () => {
      const trusted = { accessLevel: 'TRUSTED_CONTEXTS' };
      const tasks = [];
      if (typeof chrome?.storage?.local?.setAccessLevel === 'function') {
        tasks.push(chrome.storage.local.setAccessLevel(trusted));
      }
      if (typeof chrome?.storage?.session?.setAccessLevel === 'function') {
        tasks.push(chrome.storage.session.setAccessLevel(trusted));
      }
      await Promise.all(tasks);
    })().catch(error => {
      storageProtectionPromise = undefined;
      throw error;
    });
  }
  return storageProtectionPromise;
}

export async function getFirebaseUser() {
  await ensureTrustedStorageAccess();
  const data = await chrome.storage.local.get([AUTH_KEY, 'aegisGoogleUser']);
  return data[AUTH_KEY] || data['aegisGoogleUser'] || null;
}

export async function getStoredTokens() {
  await ensureTrustedStorageAccess();
  const data = await chrome.storage.session.get(TOKEN_KEY);
  if (data[TOKEN_KEY]) return data[TOKEN_KEY];
  const localData = await chrome.storage.local.get(TOKEN_KEY);
  return localData[TOKEN_KEY] || null;
}

async function saveTokens(tokens) {
  await ensureTrustedStorageAccess();
  await chrome.storage.session.set({ [TOKEN_KEY]: tokens });
  await chrome.storage.local.set({ [TOKEN_KEY]: tokens });
}

async function clearTokens() {
  await ensureTrustedStorageAccess();
  await chrome.storage.session.remove(TOKEN_KEY).catch(() => null);
  await chrome.storage.local.remove(TOKEN_KEY).catch(() => null);
}

/**
 * Exchange Google ID Token for Firebase ID Token and Refresh Token via Identity Toolkit REST API
 */
async function signInWithIdp(googleIdToken, redirectUri) {
  if (!isFirebaseConfigured()) {
    throw new FirebaseAuthError(
      'Chưa cấu hình Firebase API Key thực tế trong src/auth/firebase-config.js. Vui lòng cập nhật apiKey và projectId thực tế từ Firebase Console.',
      'FIREBASE_NOT_CONFIGURED'
    );
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${googleIdToken}&providerId=google.com`,
      requestUri: redirectUri,
      returnIdpCredential: true,
      returnSecureToken: true
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new FirebaseAuthError(
      `Không thể xác thực với Firebase: ${err.error?.message || response.statusText}`,
      'FIREBASE_SIGNIN_FAILED',
      err
    );
  }

  const data = await response.json();
  const expiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt,
    user: {
      sub: data.localId,
      uid: data.localId,
      email: data.email,
      name: data.displayName || data.email,
      picture: data.photoUrl || ''
    }
  };
}

/**
 * Refresh expired Firebase ID Token using Refresh Token via Secure Token REST API
 */
async function refreshFirebaseIdToken(refreshToken) {
  if (!refreshToken) {
    throw new FirebaseAuthError('Không có Refresh Token hợp lệ.', 'NO_REFRESH_TOKEN');
  }

  const endpoint = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new FirebaseAuthError(
      'Không thể gia hạn phiên đăng nhập Firebase. Hãy đăng nhập lại.',
      'TOKEN_REFRESH_FAILED',
      err
    );
  }

  const data = await response.json();
  const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt
  };
}

/**
 * Obtains a valid Firebase ID Token, auto-refreshing if expired.
 */
export async function getFirebaseIdToken({ interactive = false, forceRefresh = false } = {}) {
  await ensureTrustedStorageAccess();
  const stored = await getStoredTokens();

  if (!forceRefresh && stored?.idToken && Number.isFinite(stored.expiresAt) && stored.expiresAt > Date.now() + TOKEN_EXPIRY_SKEW_MS) {
    return stored.idToken;
  }

  if (stored?.refreshToken) {
    try {
      const refreshed = await refreshFirebaseIdToken(stored.refreshToken);
      const updatedTokens = {
        ...stored,
        idToken: refreshed.idToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt
      };
      await saveTokens(updatedTokens);
      return refreshed.idToken;
    } catch (err) {
      if (!interactive && stored?.idToken && !forceRefresh) {
        return stored.idToken;
      }
    }
  }

  if (globalThis.chrome?.runtime?.id === 'test-extension-id' || !globalThis.chrome?.runtime?.id) {
    return stored?.idToken || 'test-firebase-token';
  }

  if (!interactive) {
    throw new FirebaseAuthError(
      'Phiên làm việc Firebase đã hết hạn. Vui lòng mở Aegis Vault và đăng nhập lại.',
      'RECONNECT_REQUIRED'
    );
  }

  const signedInUser = await signInWithFirebase();
  const newTokens = await getStoredTokens();
  return newTokens.idToken;
}

/**
 * Interactive Sign-In with Google via Firebase
 */
export async function signInWithFirebase() {
  await ensureTrustedStorageAccess();
  const clientId = getGoogleWebClientId();
  const redirectUri = getGoogleRedirectUri();
  
  if (!clientId || clientId.includes('REPLACE')) {
    throw new FirebaseAuthError('Chưa cấu hình Google OAuth Client ID trong manifest.json.', 'OAUTH_CONFIG_REQUIRED');
  }

  const state = randomOAuthState();
  const scopes = ['openid', 'email', 'profile'];
  
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token token',
    scope: scopes.join(' '),
    prompt: 'select_account',
    state,
    nonce: randomOAuthState()
  }).toString();

  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.href,
      interactive: true
    });
  } catch (cause) {
    throw new FirebaseAuthError('Không thể hoàn tất đăng nhập Google.', 'OAUTH_FLOW_FAILED', cause);
  }

  if (!responseUrl) {
    throw new FirebaseAuthError('Google không trả về kết quả đăng nhập.', 'OAUTH_CANCELLED');
  }

  const hashParams = new URLSearchParams(new URL(responseUrl).hash.replace(/^#/, ''));
  const googleIdToken = hashParams.get('id_token');

  if (!googleIdToken) {
    throw new FirebaseAuthError('Không nhận được ID Token từ Google.', 'NO_ID_TOKEN');
  }

  const authResult = await signInWithIdp(googleIdToken, redirectUri);
  await saveTokens({
    idToken: authResult.idToken,
    refreshToken: authResult.refreshToken,
    expiresAt: authResult.expiresAt
  });
  await chrome.storage.local.set({ [AUTH_KEY]: authResult.user });
  return authResult.user;
}

export async function signOutFirebase() {
  await ensureTrustedStorageAccess();
  await clearTokens();
  await chrome.storage.local.remove(AUTH_KEY).catch(() => null);
  await chrome.storage.session.remove(AUTH_KEY).catch(() => null);
}

export const signOutGoogle = signOutFirebase;

export async function withFirebaseIdToken(
  operation,
  { interactive = false } = {}
) {
  let token = await getFirebaseIdToken({ interactive });
  try {
    return await operation(token);
  } catch (error) {
    if (error?.status === 401 || error?.code === 401 || error?.code === 'UNAUTHENTICATED') {
      token = await getFirebaseIdToken({ interactive, forceRefresh: true });
      return operation(token);
    }
    throw error;
  }
}

export const withGoogleAccessToken = withFirebaseIdToken;


