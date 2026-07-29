import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('popup keeps the password screen hidden until session status is known', async () => {
  const html = await readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8');
  assert.match(html, /id="authView"\s+class="auth-panel hidden"/);
});

test('popup omits the unused per-site autofill toggle', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../src/ui/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/popup.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /siteAccessRow|siteAccessToggle/);
  assert.doesNotMatch(source, /renderSiteAccess|loadSiteAccess|notifySiteAccessChanged/);
});

test('content script keeps autofill available without a per-site switch', async () => {
  const source = await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8');
  assert.match(source, /accessAllowed = true;\s*ensureUi\(\);\s*scheduleWire\(\);/);
  assert.doesNotMatch(source, /IS_EXCLUDED|AEGIS_SITE_ACCESS_CHANGED/);
});
