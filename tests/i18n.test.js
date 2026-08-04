import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DICTIONARY, t, setLanguage, getLanguage, localizeText, localizeRuntimeText, translateDocument } from '../src/i18n.js';

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

test('translateDocument does not rewrite values that are already localized', async () => {
  let writes = 0;
  let text = DICTIONARY.en.tabLogins;
  const element = {
    dataset: { i18n: 'tabLogins' },
    get textContent() { return text; },
    set textContent(value) { writes += 1; text = value; }
  };
  const fakeDoc = {
    querySelectorAll: selector => selector === '[data-i18n]' ? [element] : []
  };

  await setLanguage('en');
  translateDocument(fakeDoc);

  assert.equal(writes, 0);
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

test('localizeText prevents dynamic Vietnamese UI and background errors leaking into English', async () => {
  await setLanguage('en');

  assert.equal(localizeText('Đang nhận diện ảnh QR…'), 'Reading QR image…');
  assert.equal(localizeText('Vault đang khóa.'), 'Vault is locked.');
  assert.equal(localizeText('Không thể lưu: Không tìm thấy tài khoản.'), 'Could not save: Account not found.');
  assert.equal(localizeText('Kéo GitHub để đổi thứ tự'), 'Drag GitHub to reorder');
  assert.equal(localizeText('Sửa thông tin'), 'Edit login');
  assert.equal(localizeText('TÀI KHOẢN BẢO MẬT'), 'SECURE LOGIN');
  assert.equal(localizeText('Backup toàn bộ Vault đã mã hóa'), 'Full encrypted Vault backup');

  await setLanguage('vi');
  assert.equal(localizeText('Vault is locked.'), 'Vault đang khóa.');
  assert.equal(localizeText('Edit login'), 'Sửa thông tin');
  assert.equal(localizeText('🇬🇧 English'), '🇬🇧 Tiếng Anh');
  await setLanguage('en');
});

test('runtime fallback blocks untranslated Vietnamese without modifying user data in the DOM translator', () => {
  const userText = 'Tài khoản của Nguyễn';
  assert.equal(localizeText(userText, 'en'), userText);
  assert.equal(localizeRuntimeText(userText, 'en'), 'Aegis Vault could not complete this action.');
  assert.equal(localizeRuntimeText('Vault đang khóa.', 'en'), 'Vault is locked.');
  assert.equal(localizeRuntimeText(userText, 'vi'), userText);
});

test('static popup and options markup has English coverage for every Vietnamese label', async () => {
  const vietnamese = /[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/u;
  const missing = [];
  for (const relativePath of ['../src/ui/popup.html', '../src/ui/options.html']) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      const keyed = line.match(/data-i18n="([^"]+)"/);
      const hasKeyedEnglish = keyed && DICTIONARY.en[keyed[1]];
      for (const match of line.matchAll(/>([^<>]+)</g)) {
        const value = match[1].trim();
        if (vietnamese.test(value) && !hasKeyedEnglish && localizeText(value, 'en') === value) {
          missing.push(`${relativePath}:${index + 1}: ${value}`);
        }
      }
      for (const match of line.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) {
        const value = match[1].trim();
        if (vietnamese.test(value) && localizeText(value, 'en') === value) {
          missing.push(`${relativePath}:${index + 1}: ${value}`);
        }
      }
    });
  }
  assert.deepEqual(missing, []);
});

test('every data-i18n key used by popup and options exists in both dictionaries', async () => {
  const missing = [];
  for (const relativePath of ['../src/ui/popup.html', '../src/ui/options.html']) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    for (const match of source.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) {
      const key = match[1];
      if (!(key in DICTIONARY.en) || !(key in DICTIONARY.vi)) missing.push(`${relativePath}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
