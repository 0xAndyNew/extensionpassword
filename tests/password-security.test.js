import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePassword, analyzeCredentials } from '../src/vault/password-security.js';

test('classifies common and sequential passwords as weak', () => {
  assert.equal(scorePassword('password').level, 'weak');
  assert.equal(scorePassword('12345678').level, 'weak');
  assert.ok(scorePassword('abc12345').score < 45);
});

test('classifies a varied password as medium and long random password as strong', () => {
  assert.equal(scorePassword('Blue7!Sky').level, 'medium');
  assert.equal(scorePassword('Aegis!River-92-Cobalt').level, 'strong');
});

test('detects reused passwords and penalizes the overall score', () => {
  const report = analyzeCredentials([
    { id: '1', title: 'One', username: 'a', password: 'Same!Password92' },
    { id: '2', title: 'Two', username: 'b', password: 'Same!Password92' },
    { id: '3', title: 'Three', username: 'c', password: 'Unique!River84' }
  ]);
  assert.equal(report.counts.reused, 2);
  assert.equal(report.items[0].reused, true);
  assert.ok(report.overallScore < 100);
});

test('security report never returns clear passwords', () => {
  const secret = 'NeverExpose!123';
  const report = analyzeCredentials([{ id: '1', title: 'One', username: 'a', password: secret }]);
  assert.equal('password' in report.items[0], false);
  assert.equal(JSON.stringify(report).includes(secret), false);
});
