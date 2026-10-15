import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function createHarness({ send = async () => ({ ok: true }), confirmAction = async () => true } = {}) {
  const source = await readFile(new URL('../src/ui/options.js', import.meta.url), 'utf8');
  const start = source.indexOf("$('backupFile').onchange");
  const end = source.indexOf("$('otpTextFile').onchange", start);
  assert.ok(start >= 0 && end > start);
  const elements = new Map();
  const messages = [];
  let confirmations = 0;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: {}, disabled: false, focus() {} });
    return elements.get(id);
  };
  const context = {
    $, backupImportPayload: null, backupReadGeneration: 0, backupImportPending: false,
    MAX_BACKUP_FILE_BYTES: 10 * 1024 * 1024,
    l: english => english,
    lf: (english, vietnamese, values) => english.replace(/\{(\w+)\}/g, (_, key) => values[key]),
    formatBackupCounts: () => 'backup items',
    confirmAction: options => { confirmations++; return confirmAction(options); },
    send: message => { messages.push(message); return send(message); },
    loadManager: async () => {}, refreshSyncStatus: async () => {}
  };
  runInNewContext(source.slice(start, end), context);
  const select = file => {
    $('backupFile').files = file ? [file] : [];
    $('backupFile').value = file?.name || '';
    return $('backupFile').onchange({ target: $('backupFile') });
  };
  $('backupImportPassword').value = 'original-password';
  return { $, context, messages, select, get confirmations() { return confirmations; } };
}

const file = (name, text = JSON.stringify({ name })) => ({ name, size: 100, text: async () => text });

test('Latest backup selection wins over an older delayed read', async () => {
  const older = deferred();
  const harness = await createHarness();
  const { $, context, select } = harness;
  const pending = select({ ...file('older'), text: () => older.promise });
  await select(file('newer'));
  older.resolve('{"name":"older"}');
  await pending;
  assert.equal(context.backupImportPayload.name, 'newer');
  assert.equal($('backupFileName').textContent, 'newer');
  assert.equal($('backupImportButton').disabled, false);
});

for (const selection of ['oversized', 'error', 'empty', 'none']) {
  test(`Latest ${selection} backup invalidates the previous payload and pending read`, async () => {
    const older = deferred();
    const { $, context, select } = await createHarness();
    await select(file('ready'));
    const pending = select({ ...file('older'), text: () => older.promise });
    assert.equal(context.backupImportPayload, null);
    assert.equal($('backupImportButton').disabled, true);
    const latest = selection === 'none' ? null : selection === 'oversized'
      ? { ...file('latest'), size: 11 * 1024 * 1024, text: () => assert.fail('Oversized files must not be read') }
      : selection === 'error' ? { ...file('latest'), text: async () => { throw new Error('Read failed'); } }
        : file('latest', '  ');
    await select(latest);
    const status = $('backupImportResult').textContent;
    older.resolve('{"name":"older"}');
    await pending;
    assert.equal(context.backupImportPayload, null);
    assert.equal($('backupImportButton').disabled, true);
    assert.equal($('backupImportResult').textContent, status);
    await $('backupImportButton').onclick();
    assert.equal(context.backupImportPending, false);
    assert.equal($('backupFile').disabled, false);
    assert.equal($('backupImportPassword').disabled, false);
  });
}

test('Older backup read failures cannot overwrite the latest valid selection', async () => {
  const older = deferred();
  const { $, context, select } = await createHarness();
  const pending = select({ ...file('older'), text: () => older.promise });
  await select(file('latest'));
  older.reject(new Error('Stale error'));
  await pending;
  assert.equal(context.backupImportPayload.name, 'latest');
  assert.equal($('backupImportResult').textContent, '');
  assert.equal($('backupImportButton').disabled, false);
});

test('Backup confirmation captures exact payload and password, blocks duplicate imports, preserves a newer selection', async () => {
  const confirm = deferred();
  const response = deferred();
  let confirmationMessage;
  const harness = await createHarness({
    confirmAction: options => { confirmationMessage = options.message; return confirm.promise; },
    send: () => response.promise
  });
  const { $, select, messages, context } = harness;
  await select(file('first'));
  const capturedPayload = context.backupImportPayload;
  const pending = $('backupImportButton').onclick();
  assert.match(confirmationMessage, /"first"/);
  assert.equal($('backupFile').disabled, true);
  assert.equal($('backupImportPassword').disabled, true);
  assert.equal($('backupImportButton').disabled, true);
  await $('backupImportButton').onclick();
  assert.equal(harness.confirmations, 1);
  await select(file('second'));
  $('backupImportPassword').value = 'second-password';
  assert.equal($('backupImportButton').disabled, true);
  await $('backupImportButton').onclick();
  assert.equal(harness.confirmations, 1);
  confirm.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].backup, capturedPayload);
  assert.equal(messages[0].masterPassword, 'original-password');
  assert.match(confirmationMessage, /"first"/);
  assert.equal($('backupFile').disabled, true);
  assert.equal($('backupImportPassword').disabled, true);
  await $('backupImportButton').onclick();
  assert.equal(messages.length, 1);
  response.resolve({ ok: true });
  await pending;
  assert.equal($('backupFile').value, 'second');
  assert.equal($('backupFileName').textContent, 'second');
  assert.equal($('backupImportPassword').value, 'second-password');
  assert.equal($('backupFile').disabled, false);
  assert.equal($('backupImportPassword').disabled, false);
  assert.equal(context.backupImportPayload.name, 'second');
  assert.equal($('backupImportResult').textContent, '');
  assert.equal($('backupImportButton').disabled, false);
});

for (const ok of [true, false]) {
  test(`Backup import ${ok ? 'success' : 'failure'} cannot disturb a newer pending read`, async () => {
    const response = deferred();
    const read = deferred();
    const { $, context, select, messages } = await createHarness({ send: () => response.promise });
    await select(file('first'));
    const pending = $('backupImportButton').onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    const reading = select({ ...file('second'), text: () => read.promise });
    response.resolve({ ok, error: 'Old failure' });
    await pending;
    assert.equal($('backupFile').value, 'second');
    assert.equal($('backupFileName').textContent, 'second');
    assert.equal($('backupImportResult').textContent, '');
    assert.equal($('backupImportButton').disabled, true);
    read.resolve('{"name":"second"}');
    await reading;
    assert.equal(context.backupImportPayload.name, 'second');
    assert.equal($('backupImportButton').disabled, false);
  });
}

test('Cancel backup confirmation releases the guard without importing or clearing the selection', async () => {
  const confirm = deferred();
  const { $, select, messages, context } = await createHarness({ confirmAction: () => confirm.promise });
  await select(file('first'));
  const pending = $('backupImportButton').onclick();
  confirm.resolve(false);
  await pending;
  assert.equal(messages.length, 0);
  assert.equal(context.backupImportPending, false);
  assert.equal($('backupFile').disabled, false);
  assert.equal($('backupImportPassword').disabled, false);
  assert.equal(context.backupImportPayload.name, 'first');
  assert.equal($('backupImportButton').disabled, false);
});

test('Successful backup import clears only its current selection', async () => {
  const { $, select, messages, context } = await createHarness();
  await select(file('first'));
  await $('backupImportButton').onclick();
  assert.equal(messages.length, 1);
  assert.equal(context.backupImportPayload, null);
  assert.equal(context.backupImportPending, false);
  assert.equal($('backupFile').disabled, false);
  assert.equal($('backupImportPassword').disabled, false);
  assert.equal($('backupFile').value, '');
  assert.equal($('backupImportPassword').value, '');
  assert.equal($('backupImportButton').disabled, true);
});
