import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function createHarness({ send, loadManager = async () => {}, refreshSyncStatus = async () => {}, language = 'en' } = {}) {
  const source = await readFile(new URL('../src/ui/options.js', import.meta.url), 'utf8');
  const start = source.indexOf('function openNoteDrawer(');
  const end = source.indexOf('function renderCards()', start);
  const closeStart = source.indexOf('function closeDrawer()');
  const closeEnd = source.indexOf("$('drawerCancel').onclick = closeDrawer;", closeStart);
  assert.ok(start >= 0 && end > start && closeStart >= 0 && closeEnd > closeStart);
  const elements = new Map();
  const timers = [];
  const messages = [];
  const $ = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: '', textContent: '', style: {}, disabled: false,
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          contains: name => classes.has(name)
        }
      });
    }
    return elements.get(id);
  };
  const context = {
    $, noteDrawerGeneration: 0, noteSaveGeneration: null,
    send: message => { messages.push(message); return send?.(message) ?? Promise.resolve({ ok: true }); },
    loadManager, refreshSyncStatus,
    l: (english, vietnamese) => language === 'vi' ? vietnamese : english,
    lf: (english, vietnamese, values) => (language === 'vi' ? vietnamese : english).replace(/\{(\w+)\}/g, (_, key) => values[key]),
    setTimeout: callback => timers.push(callback)
  };
  runInNewContext(source.slice(start, end) + source.slice(closeStart, closeEnd), context);
  return { $, context, messages, timers };
}

for (const mode of ['add', 'edit']) {
  test(`Notes Cancel closes the ${mode} drawer without saving changes`, async () => {
    const { $, context, messages } = await createHarness();
    const item = { id: 'note-1', title: 'Original title', notes: 'Original content' };
    context.openNoteDrawer(mode === 'edit' ? item : null);
    assert.equal($('overlay').classList.contains('open'), true);
    assert.equal($('noteDrawer').classList.contains('open'), true);
    $('editNoteTitle').value = 'Unsaved title';
    $('editNoteContent').value = 'Unsaved content';
    $('noteSaveResult').textContent = 'Previous feedback';
    $('noteDrawerCancel').onclick();
    assert.equal($('overlay').classList.contains('open'), false);
    assert.equal($('noteDrawer').classList.contains('open'), false);
    assert.equal($('noteSaveResult').textContent, '');
    assert.equal(messages.length, 0);
    assert.deepEqual(item, { id: 'note-1', title: 'Original title', notes: 'Original content' });
    context.openNoteDrawer(mode === 'edit' ? item : null);
    assert.equal($('editNoteTitle').value, mode === 'edit' ? item.title : '');
    assert.equal($('editNoteContent').value, mode === 'edit' ? item.notes : '');
  });
}

test('Notes ignore duplicate saves through request, refresh, and delayed close', async () => {
  const response = deferred();
  const refresh = deferred();
  const { $, context, messages, timers } = await createHarness({
    send: () => response.promise, loadManager: () => refresh.promise
  });
  context.openNoteDrawer();
  $('editNoteTitle').value = 'New title';
  $('editNoteContent').value = 'New content';
  const save = $('noteDrawerSave').onclick();
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].title, 'New title');
  assert.equal(messages[0].notes, 'New content');
  assert.equal($('noteDrawerSave').disabled, true);
  response.resolve({ ok: true });
  await Promise.resolve();
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 1);
  refresh.resolve();
  await save;
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 1);
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.equal($('noteDrawer').classList.contains('open'), false);
  assert.equal($('noteDrawerSave').disabled, false);
});

for (const close of ['cancel', 'overlay']) {
  for (const ok of [true, false]) {
    test(`Stale note ${ok ? 'success' : 'error'} after ${close} cannot change another session`, async () => {
      const response = deferred();
      const { $, context, messages, timers } = await createHarness({ send: () => response.promise });
      context.openNoteDrawer({ id: 'first', title: 'First', notes: 'First content' });
      const save = $('noteDrawerSave').onclick();
      $(close === 'cancel' ? 'noteDrawerCancel' : 'overlay').onclick();
      context.openNoteDrawer({ id: 'second', title: 'Second', notes: 'Second content' });
      $('noteSaveResult').textContent = 'Second session status';
      response.resolve({ ok, error: 'Old failure' });
      await save;
      for (const timer of timers) timer();
      assert.equal(messages.length, 1);
      assert.equal($('noteSaveResult').textContent, 'Second session status');
      assert.equal($('noteDrawer').classList.contains('open'), true);
      assert.equal($('editNoteId').value, 'second');
      assert.equal($('noteDrawerSave').disabled, false);
    });
  }
}

test('Old note delayed close cannot close a reopened drawer or unlock its pending save', async () => {
  const second = deferred();
  const { $, context, messages, timers } = await createHarness({
    send: message => message.id === 'second' ? second.promise : Promise.resolve({ ok: true })
  });
  context.openNoteDrawer({ id: 'first', title: 'First' });
  await $('noteDrawerSave').onclick();
  $('noteDrawerCancel').onclick();
  context.openNoteDrawer({ id: 'second', title: 'Second' });
  const save = $('noteDrawerSave').onclick();
  timers.shift()();
  assert.equal($('noteDrawer').classList.contains('open'), true);
  assert.equal($('noteDrawerSave').disabled, true);
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 2);
  second.resolve({ ok: true });
  await save;
});

test('Note completion after a delayed refresh cannot schedule a close for another session', async () => {
  const refresh = deferred();
  const { $, context, timers } = await createHarness({ loadManager: () => refresh.promise });
  context.openNoteDrawer({ id: 'first', title: 'First' });
  const save = $('noteDrawerSave').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match($('noteSaveResult').textContent, /Đã lưu/);
  $('noteDrawerCancel').onclick();
  context.openNoteDrawer({ id: 'second', title: 'Second' });
  $('noteSaveResult').textContent = 'Second session';
  refresh.resolve();
  await save;
  assert.equal(timers.length, 0);
  assert.equal($('noteSaveResult').textContent, 'Second session');
  assert.equal($('noteDrawer').classList.contains('open'), true);
});

test('Stale note response cannot unlock or overwrite a new session pending save', async () => {
  const first = deferred();
  const second = deferred();
  const { $, context, messages } = await createHarness({
    send: message => message.id === 'first' ? first.promise : second.promise
  });
  context.openNoteDrawer({ id: 'first', title: 'First' });
  const firstSave = $('noteDrawerSave').onclick();
  $('noteDrawerCancel').onclick();
  context.openNoteDrawer({ id: 'second', title: 'Second' });
  const secondSave = $('noteDrawerSave').onclick();
  const status = $('noteSaveResult').textContent;
  first.resolve({ ok: false, error: 'Old failure' });
  await firstSave;
  assert.equal($('noteDrawerSave').disabled, true);
  assert.equal($('noteSaveResult').textContent, status);
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 2);
  second.resolve({ ok: true });
  await secondSave;
});

test('Thrown note save errors show feedback and release the save guard for retry', async () => {
  const { $, context, messages } = await createHarness({ send: async () => { throw new Error('Connection lost'); } });
  context.openNoteDrawer({ id: 'first', title: 'First' });
  await $('noteDrawerSave').onclick();
  assert.equal($('noteSaveResult').textContent, 'Could not save: Connection lost');
  assert.equal($('noteDrawerSave').disabled, false);
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 2);
});

for (const refreshStep of ['loadManager', 'refreshSyncStatus']) {
  for (const language of ['en', 'vi']) {
    test(`Saved new note keeps duplicate guard when ${refreshStep} rejects (${language})`, async () => {
      const { $, context, messages, timers } = await createHarness({
        language,
        [refreshStep]: async () => { throw new Error('Refresh unavailable'); }
      });
      context.openNoteDrawer();
      $('editNoteTitle').value = 'New note';
      await $('noteDrawerSave').onclick();
      assert.equal(messages.length, 1);
      assert.equal(messages[0].id, '');
      assert.equal($('editNoteId').value, '');
      assert.equal($('noteDrawerSave').disabled, true);
      assert.equal($('noteDrawer').classList.contains('open'), true);
      assert.equal(timers.length, 0);
      assert.equal($('noteSaveResult').style.color, '#b45309');
      assert.equal($('noteSaveResult').textContent, language === 'vi'
        ? 'Đã lưu ghi chú, nhưng không thể làm mới dữ liệu Vault hoặc trạng thái đồng bộ: Refresh unavailable'
        : 'Note saved, but could not refresh Vault data or sync status: Refresh unavailable');
      await $('noteDrawerSave').onclick();
      assert.equal(messages.length, 1);
      $('noteDrawerCancel').onclick();
      context.openNoteDrawer();
      $('editNoteTitle').value = 'Another new note';
      assert.equal($('noteDrawerSave').disabled, false);
      await $('noteDrawerSave').onclick();
      assert.equal(messages.length, 2);
    });
  }
}

test('Saved old-session note refresh rejection cannot alter a new pending save', async () => {
  let failRefresh;
  const refresh = new Promise((resolve, reject) => { failRefresh = reject; });
  const second = deferred();
  const { $, context, messages, timers } = await createHarness({
    send: message => message.id === 'second' ? second.promise : Promise.resolve({ ok: true }),
    loadManager: () => refresh
  });
  context.openNoteDrawer();
  $('editNoteTitle').value = 'First';
  const firstSave = $('noteDrawerSave').onclick();
  await new Promise(resolve => setImmediate(resolve));
  $('noteDrawerCancel').onclick();
  context.openNoteDrawer({ id: 'second', title: 'Second' });
  const secondSave = $('noteDrawerSave').onclick();
  const status = $('noteSaveResult').textContent;
  failRefresh(new Error('Old refresh failure'));
  await firstSave;
  assert.equal($('noteSaveResult').textContent, status);
  assert.equal($('noteDrawerSave').disabled, true);
  assert.equal($('noteDrawer').classList.contains('open'), true);
  assert.equal(timers.length, 0);
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 2);
  second.resolve({ ok: false, error: 'Second save rejected' });
  await secondSave;
});

test('Current note save failure permits retry and validation never sends a write', async () => {
  const { $, context, messages } = await createHarness({ send: async () => ({ ok: false, error: 'Try again' }) });
  context.openNoteDrawer();
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 0);
  assert.equal($('noteDrawerSave').disabled, false);
  $('editNoteTitle').value = 'Title';
  await $('noteDrawerSave').onclick();
  assert.match($('noteSaveResult').textContent, /Try again/);
  assert.equal($('noteDrawerSave').disabled, false);
  await $('noteDrawerSave').onclick();
  assert.equal(messages.length, 2);
});
