import { normalizeOrigin } from './vault/domain-policy.js';

/**
 * Allow a submitted login to survive a cross-origin redirect only when the
 * background-held capture for the same tab/frame proves the original origin
 * and exact credential values. Website messages cannot choose an arbitrary
 * origin because the requested value must match this trusted capture.
 */
export function resolveTrustedCaptureOrigin({
  currentOrigin,
  requestedOrigin,
  capture,
  username,
  password
}) {
  const current = normalizeOrigin(currentOrigin);
  if (!requestedOrigin) return current;
  const requested = normalizeOrigin(requestedOrigin);
  if (requested === current) return current;
  if (
    !capture
    || normalizeOrigin(capture.sourceOrigin) !== requested
    || capture.username !== username
    || capture.password !== password
  ) {
    throw new Error('Thông tin đăng nhập tạm không khớp trang nguồn.');
  }
  return requested;
}
