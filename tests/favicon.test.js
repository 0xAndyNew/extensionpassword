import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SITE_ICON_SVG,
  getFaviconUrl
} from '../src/ui/favicon.js';

test('builds a Manifest V3 favicon URL for a safe web page', () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://test-extension${path}`;
      }
    }
  };
  try {
    const result = new URL(getFaviconUrl('https://portal.office.com/login', 32));
    assert.equal(result.origin, 'null');
    assert.equal(result.protocol, 'chrome-extension:');
    assert.equal(result.pathname, '/_favicon/');
    assert.equal(result.searchParams.get('pageUrl'), 'https://portal.office.com/login');
    assert.equal(result.searchParams.get('size'), '32');
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('rejects malformed and non-web favicon targets', () => {
  assert.equal(getFaviconUrl('not a URL'), null);
  assert.equal(getFaviconUrl('javascript:alert(1)'), null);
});

test('branded fallback is an accessible decorative shield-globe SVG', () => {
  assert.match(DEFAULT_SITE_ICON_SVG, /class="aegis-site-fallback"/);
  assert.match(DEFAULT_SITE_ICON_SVG, /aria-hidden="true"/);
  assert.match(DEFAULT_SITE_ICON_SVG, /#147ce5/);
  assert.match(DEFAULT_SITE_ICON_SVG, /#2ac769/);
});
