import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLastPassCsv, serializeLastPassCsv } from '../src/vault/csv.js';

test('parses LastPass CSV with quoted fields and BOM', () => {
  const csv = '\uFEFFurl,username,password,extra,name,grouping,fav\n"https://example.com/login","user@example.com","p,a ss","ghi chú","Example","Work",1';
  const result = parseLastPassCsv(csv);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].password, 'p,a ss');
  assert.equal(result.records[0].favorite, true);
});

test('reports invalid URL without exposing password', () => {
  const csv = 'url,username,password,extra,name,grouping,fav\nnot-a-url,user,Secret123!,note,Bad,,0';
  const result = parseLastPassCsv(csv);
  assert.equal(result.records.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(JSON.stringify(result.errors).includes('Secret123!'), false);
});

test('round trips exported credentials', () => {
  const source = [{ url: 'https://example.com', username: 'user@example.com', password: 'Aegis!42', notes: 'note', title: 'Example', grouping: 'Work', favorite: true }];
  const parsed = parseLastPassCsv(serializeLastPassCsv(source));
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].username, source[0].username);
  assert.equal(parsed.records[0].password, source[0].password);
});

test('rejects public HTTP credentials but keeps localhost available for development', () => {
  const publicHttp = parseLastPassCsv(
    'url,username,password,extra,name,grouping,fav\nhttp://example.com,user,Secret123!,,Example,,0'
  );
  const localHttp = parseLastPassCsv(
    'url,username,password,extra,name,grouping,fav\nhttp://127.0.0.1:3000,user,Secret123!,,Local,,0'
  );
  assert.equal(publicHttp.records.length, 0);
  assert.match(publicHttp.errors[0].reason, /HTTPS/);
  assert.equal(localHttp.records.length, 1);
});
