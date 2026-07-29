import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesOrigin, normalizeOrigin } from '../src/vault/domain-policy.js';

test('normalizeOrigin serializes an exact web origin', () => {
  assert.equal(normalizeOrigin('HTTPS://Example.COM:443/login?next=/'), 'https://example.com');
  assert.equal(normalizeOrigin('example.com:8443/path'), 'https://example.com:8443');
  assert.equal(normalizeOrigin('//example.com/path'), 'https://example.com');
  assert.throws(() => normalizeOrigin('ftp://example.com/file'), /Unsupported origin/);
  assert.throws(() => normalizeOrigin('javascript:alert(1)'), /Unsupported origin/);
  assert.throws(() => normalizeOrigin('mailto:user@example.com'), /Unsupported origin/);
});

test('matches only an exact host and does not infer subdomains', () => {
  const credential = { origins: ['https://example.com'] };
  assert.equal(matchesOrigin(credential, 'https://example.com/login'), true);
  assert.equal(matchesOrigin(credential, 'https://login.example.com'), false);
  assert.equal(matchesOrigin(credential, 'https://notexample.com'), false);
});

test('never downgrades an HTTPS credential to HTTP', () => {
  const credential = { origins: ['https://example.com'] };
  assert.equal(matchesOrigin(credential, 'http://example.com'), false);
  assert.equal(matchesOrigin(credential, 'https://example.com'), true);
});

test('non-default ports are distinct origins', () => {
  const credential = { origins: ['https://example.com:8443'] };
  assert.equal(matchesOrigin(credential, 'https://example.com:8443/login'), true);
  assert.equal(matchesOrigin(credential, 'https://example.com'), false);
  assert.equal(matchesOrigin(credential, 'https://example.com:9443'), false);

  // URL.origin correctly treats the protocol's default port as equivalent.
  assert.equal(matchesOrigin({ origins: ['https://example.com:443'] }, 'https://example.com'), true);
});

test('does not confuse unrelated co.uk registrable domains', () => {
  const credential = { origins: ['https://bank.co.uk'] };
  assert.equal(matchesOrigin(credential, 'https://bank.co.uk'), true);
  assert.equal(matchesOrigin(credential, 'https://attacker.co.uk'), false);
  assert.equal(matchesOrigin(credential, 'https://login.bank.co.uk'), false);
});

test('does not treat github.io sibling sites as the same website', () => {
  const credential = { origins: ['https://alice.github.io'] };
  assert.equal(matchesOrigin(credential, 'https://alice.github.io'), true);
  assert.equal(matchesOrigin(credential, 'https://bob.github.io'), false);
  assert.equal(matchesOrigin(credential, 'https://github.io'), false);
});

test('IP addresses and their ports must match exactly', () => {
  const ipv4 = { origins: ['http://192.168.1.10:8080'] };
  assert.equal(matchesOrigin(ipv4, 'http://192.168.1.10:8080/login'), true);
  assert.equal(matchesOrigin(ipv4, 'http://192.168.1.11:8080'), false);
  assert.equal(matchesOrigin(ipv4, 'http://192.168.1.10'), false);

  const ipv6 = { origins: ['https://[2001:db8::1]:8443'] };
  assert.equal(matchesOrigin(ipv6, 'https://[2001:db8::1]:8443/path'), true);
  assert.equal(matchesOrigin(ipv6, 'https://[2001:db8::2]:8443'), false);
});

test('supports legacy origin and url fields without mutating origins arrays', () => {
  const origins = ['https://one.example'];
  const credential = {
    origins,
    origin: 'https://two.example',
    url: 'https://three.example/login'
  };

  assert.equal(matchesOrigin(credential, 'https://one.example'), true);
  assert.equal(matchesOrigin(credential, 'https://two.example'), true);
  assert.equal(matchesOrigin(credential, 'https://three.example'), true);
  assert.deepEqual(origins, ['https://one.example']);
});
