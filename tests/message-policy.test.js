import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMessage, getMessageContext } from '../src/message-policy.js';

const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';
const contentSender = {
  id: runtimeId,
  url: 'https://login.example.com/path',
  tab: { id: 7, windowId: 3, url: 'https://login.example.com/path' },
  frameId: 0,
  documentId: 'doc-1'
};

test('derives content origin from sender instead of trusting the message', () => {
  const result = authorizeMessage(
    { type: 'FILL', id: 'credential-1', origin: 'https://attacker.example' },
    contentSender,
    runtimeId
  );
  assert.equal(result.message.origin, 'https://login.example.com');
  assert.equal(result.context.tabId, 7);
  assert.equal(result.context.windowId, 3);
});

test('allows only the narrow content-script action list', () => {
  assert.throws(
    () => authorizeMessage({ type: 'LIST_DECRYPTED' }, contentSender, runtimeId),
    /không được phép/
  );
  assert.doesNotThrow(
    () => authorizeMessage({ type: 'MATCH' }, contentSender, runtimeId)
  );
  assert.doesNotThrow(
    () => authorizeMessage({ type: 'CAPTURE_QR_SELECTION' }, contentSender, runtimeId)
  );
  assert.doesNotThrow(
    () => authorizeMessage({ type: 'SAVE_QR_URI' }, contentSender, runtimeId)
  );
});

test('trusts extension pages belonging to this runtime', () => {
  const sender = {
    id: runtimeId,
    url: `chrome-extension://${runtimeId}/src/ui/popup.html`
  };
  assert.equal(getMessageContext(sender, runtimeId).kind, 'extension');
  assert.equal(authorizeMessage({ type: 'EXPORT_ENCRYPTED_BACKUP' }, sender, runtimeId).context.kind, 'extension');
});

test('rejects other extensions and unsupported sender protocols', () => {
  assert.equal(getMessageContext({ ...contentSender, id: 'other' }, runtimeId).kind, 'denied');
  assert.equal(getMessageContext({ id: runtimeId, url: 'file:///tmp/test.html' }, runtimeId).kind, 'denied');
});

test('rejects public HTTP content but permits loopback development origins', () => {
  const publicHttp = {
    ...contentSender,
    url: 'http://example.com/login',
    tab: { id: 8, url: 'http://example.com/login' }
  };
  const localhost = {
    ...contentSender,
    url: 'http://localhost:3000/login',
    tab: { id: 9, url: 'http://localhost:3000/login' }
  };
  assert.equal(getMessageContext(publicHttp, runtimeId).kind, 'denied');
  assert.equal(getMessageContext(localhost, runtimeId).kind, 'content');
});
