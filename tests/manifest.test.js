import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest host permissions are limited to the Firebase APIs used in production', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.host_permissions, [
    'https://identitytoolkit.googleapis.com/*',
    'https://securetoken.googleapis.com/*',
    'https://firestore.googleapis.com/*'
  ]);
  assert.equal(manifest.content_scripts[0].matches.includes('http://*/*'), false);
});
