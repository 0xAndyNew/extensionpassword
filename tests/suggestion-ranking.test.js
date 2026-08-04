import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadRanking() {
  const source = await readFile(new URL('../src/content/suggestion-ranking.js', import.meta.url), 'utf8');
  const context = vm.createContext({ URL });
  context.globalThis = context;
  vm.runInContext(source, context);
  return context.AegisSuggestionRanking;
}

test('displayed account identity takes priority over vault order', async () => {
  const ranking = await loadRanking();
  const credentials = [
    { id: 'one', username: 'first@example.com', url: 'https://login.example.com/' },
    { id: 'current', username: 'admin@xuanhieuvn.onmicrosoft.com', url: 'https://login.example.com/' }
  ];

  const result = ranking.rankCredentials(credentials, {
    identityHints: ['admin@xuanhieuvn.onmicrosoft.com'],
    pageUrl: 'https://login.example.com/password'
  });
  assert.equal(result[0].id, 'current');
});

test('login URL is the fallback when no displayed identity is available', async () => {
  const ranking = await loadRanking();
  const credentials = [
    { id: 'generic', username: 'one@example.com', url: 'https://login.example.com/' },
    { id: 'path-match', username: 'two@example.com', url: 'https://login.example.com/tenant/password' }
  ];

  const result = ranking.rankCredentials(credentials, {
    pageUrl: 'https://login.example.com/tenant/password'
  });
  assert.equal(result[0].id, 'path-match');
});

test('visible identity matching requires text boundaries', async () => {
  const ranking = await loadRanking();
  assert.equal(ranking.textContainsIdentity(
    'Back admin@xuanhieuvn.onmicrosoft.com Enter password',
    'admin@xuanhieuvn.onmicrosoft.com'
  ), true);
  assert.equal(ranking.textContainsIdentity('notadmin@example.com', 'admin@example.com'), false);
});
