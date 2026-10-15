import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMessage, getMessageContext, isContentAction } from '../src/message-policy.js';

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

test('allows temporary login capture actions and derives their origin from sender', () => {
  for (const type of ['STAGE_LOGIN_CAPTURE', 'TAKE_LOGIN_CAPTURE']) {
    const result = authorizeMessage({
      type,
      origin: 'https://spoofed.example',
      username: 'user@example.com',
      password: 'secret'
    }, contentSender, runtimeId);
    assert.equal(result.context.kind, 'content');
    assert.equal(result.message.origin, 'https://login.example.com');
    assert.equal(isContentAction(type), true);
  }
});

test('preserves a claimed capture origin for background verification after redirects', () => {
  const result = authorizeMessage({
    type: 'CHECK_CAPTURE_ACCOUNT',
    origin: 'https://spoofed.example',
    captureOrigin: 'https://login.live.com',
    username: 'user@example.com',
    password: 'secret'
  }, {
    ...contentSender,
    url: 'https://account.microsoft.com/',
    tab: { ...contentSender.tab, url: 'https://account.microsoft.com/' }
  }, runtimeId);

  assert.equal(result.message.origin, 'https://account.microsoft.com');
  assert.equal(result.message.captureOrigin, 'https://login.live.com');
});

test('QR actions are limited to the top-frame selector', () => {
  for (const type of ['CAPTURE_QR_SELECTION', 'SAVE_QR_URI']) {
    assert.throws(() => authorizeMessage({ type }, { ...contentSender, frameId: 2 }, runtimeId), /không hợp lệ/);
  }
  assert.doesNotThrow(() => authorizeMessage({ type: 'GET_UI_LANGUAGE' }, { ...contentSender, frameId: 2 }, runtimeId));
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

test('public HTTP content is restricted to QR and language while loopback retains credential access', () => {
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
  assert.equal(getMessageContext(publicHttp, runtimeId).qrOnly, true);
  assert.equal(getMessageContext(localhost, runtimeId).kind, 'content');
  assert.doesNotThrow(() => authorizeMessage({ type: 'MATCH' }, localhost, runtimeId));
  const fileSender = { ...contentSender, url: 'file:///tmp/qr.html', tab: { id: 10, windowId: 3, url: 'file:///tmp/qr.html' } };
  for (const sender of [publicHttp, fileSender]) {
    for (const type of ['CAPTURE_QR_SELECTION', 'SAVE_QR_URI', 'GET_UI_LANGUAGE']) {
      assert.doesNotThrow(() => authorizeMessage({ type }, sender, runtimeId));
    }
    for (const type of ['MATCH', 'FILL', 'SAVE', 'STAGE_LOGIN_CAPTURE', 'LIST_ALL', 'OTP_LIST', 'GOOGLE_SIGN_OUT']) {
      assert.throws(() => authorizeMessage({ type }, sender, runtimeId), /không được phép/);
    }
  }
});
