import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARY, t, setLanguage, getLanguage, translateDocument } from '../src/i18n.js';

test('i18n dictionary has matching keys for vi and en', () => {
  const viKeys = Object.keys(DICTIONARY.vi).sort();
  const enKeys = Object.keys(DICTIONARY.en).sort();

  assert.deepEqual(viKeys, enKeys, 'Both Vietnamese and English dictionaries must have identical keys');
  assert.ok(viKeys.length > 20, 'Dictionary should contain all essential UI keys');
});

test('default language is English', async () => {
  const lang = await getLanguage();
  assert.equal(lang, 'en', 'Default language must be English (en)');
});

test('t() returns correct translation for selected language', async () => {
  await setLanguage('en');
  assert.equal(t('searchPlaceholder'), 'Search Aegis Vault...');
  assert.equal(t('tabLogins'), '🔑 Logins');
  assert.equal(t('topDonateBtn'), '☕ Buy me a coffee');

  await setLanguage('vi');
  assert.equal(t('searchPlaceholder'), 'Tìm kiếm Aegis Vault...');
  assert.equal(t('tabLogins'), '🔑 Tài khoản đăng nhập');
  assert.equal(t('topDonateBtn'), '☕ Mời tôi một ly cà phê');

  // Fallback to key or fallback string if missing key
  assert.equal(t('nonExistentKey', 'Default Fallback'), 'Default Fallback');

  // Reset to default en
  await setLanguage('en');
});

test('translateDocument updates DOM elements correctly', async () => {
  // Mock simple DOM elements
  const elements = [
    { dataset: { i18n: 'tabLogins' }, textContent: '' },
    { dataset: { i18nPlaceholder: 'searchPlaceholder' }, placeholder: '' },
    { dataset: { i18nTitle: 'topHelp' }, title: '' }
  ];

  const fakeDoc = {
    querySelectorAll: (selector) => {
      if (selector === '[data-i18n]') return [elements[0]];
      if (selector === '[data-i18n-placeholder]') return [elements[1]];
      if (selector === '[data-i18n-title]') return [elements[2]];
      return [];
    }
  };

  await setLanguage('en');
  translateDocument(fakeDoc);

  assert.equal(elements[0].textContent, '🔑 Logins');
  assert.equal(elements[1].placeholder, 'Search Aegis Vault...');
  assert.equal(elements[2].title, 'Help');

  await setLanguage('vi');
  translateDocument(fakeDoc);

  assert.equal(elements[0].textContent, '🔑 Tài khoản đăng nhập');
  assert.equal(elements[1].placeholder, 'Tìm kiếm Aegis Vault...');
  assert.equal(elements[2].title, 'Trợ giúp');
});
