const GENERIC_FAVICON_PAGE = 'https://aegis-vault-no-favicon.invalid/';

export const DEFAULT_SITE_ICON_SVG = `<svg class="aegis-site-fallback" viewBox="0 0 32 32" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="30" height="30" rx="9" fill="#eef6ff" stroke="#c7e0fb"/>
  <path d="M16 5.2 24.5 8v6.8c0 5.2-3.3 9.1-8.5 11.8-5.2-2.7-8.5-6.6-8.5-11.8V8L16 5.2Z" fill="#fff" stroke="#8fc1f4" stroke-width="1.35"/>
  <circle cx="16" cy="15.3" r="5.6" fill="#f7fbff" stroke="#147ce5" stroke-width="1.35"/>
  <path d="M10.7 15.3h10.6M16 9.7c1.65 1.45 2.2 3.32 2.2 5.6 0 2.27-.55 4.15-2.2 5.6m0-11.2c-1.65 1.45-2.2 3.33-2.2 5.6 0 2.28.55 4.15 2.2 5.6" fill="none" stroke="#147ce5" stroke-width="1.05" stroke-linecap="round"/>
  <circle cx="23.1" cy="8.9" r="2.35" fill="#2ac769" stroke="#fff" stroke-width="1.2"/>
</svg>`;

let genericFingerprintPromise;

export function getFaviconUrl(urlStr, size = 32) {
  try {
    const pageUrl = new URL(urlStr);
    if (!['http:', 'https:'].includes(pageUrl.protocol)) return null;
    const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', pageUrl.href);
    faviconUrl.searchParams.set('size', String(size));
    return faviconUrl.href;
  } catch {
    return null;
  }
}

function loadImage(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function fingerprintImage(image) {
  if (!image?.naturalWidth || !image?.naturalHeight) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, 16, 16);
    context.drawImage(image, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    let hash = 2166136261;
    for (const value of pixels) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
    return `${image.naturalWidth}x${image.naturalHeight}:${hash >>> 0}`;
  } catch {
    return null;
  }
}

function getGenericFaviconFingerprint() {
  if (!genericFingerprintPromise) {
    genericFingerprintPromise = loadImage(getFaviconUrl(GENERIC_FAVICON_PAGE))
      .then(fingerprintImage)
      .catch(() => null);
  }
  return genericFingerprintPromise;
}

/**
 * Paint the branded fallback immediately, then replace it only when the
 * browser returns a real favicon instead of its platform-specific generic
 * globe/document image.
 */
export function setSiteIcon(container, pageUrl) {
  const generation = Number(container.dataset.siteIconGeneration || 0) + 1;
  container.dataset.siteIconGeneration = String(generation);
  container.classList.remove('has-site-favicon');
  container.innerHTML = DEFAULT_SITE_ICON_SVG;

  const source = getFaviconUrl(pageUrl);
  if (!source) return;

  loadImage(source).then(async image => {
    if (!image || Number(container.dataset.siteIconGeneration) !== generation) return;
    const [candidateFingerprint, genericFingerprint] = await Promise.all([
      Promise.resolve(fingerprintImage(image)),
      getGenericFaviconFingerprint()
    ]);
    if (
      candidateFingerprint
      && genericFingerprint
      && candidateFingerprint === genericFingerprint
    ) {
      return;
    }
    if (Number(container.dataset.siteIconGeneration) !== generation) return;
    container.replaceChildren(image);
    container.classList.add('has-site-favicon');
  });
}
