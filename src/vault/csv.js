export const LASTPASS_HEADERS = ['url', 'username', 'password', 'extra', 'name', 'grouping', 'fav'];

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('CSV có trường dấu nháy chưa đóng.');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(values => values.some(Boolean));
}

export function parseLastPassCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('File CSV trống.');
  const headers = rows.shift().map(value => value.trim().toLowerCase());
  if (!LASTPASS_HEADERS.every(header => headers.includes(header))) throw new Error('CSV không đúng định dạng export của LastPass.');
  const records = []; const errors = [];
  rows.forEach((values, index) => {
    const raw = Object.fromEntries(headers.map((header, column) => [header, values[column] || '']));
    try {
      const url = new URL(raw.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL không dùng HTTP/HTTPS');
      if (!raw.username && !raw.password) throw new Error('Thiếu username và password');
      records.push({ origin: url.origin, url: raw.url, username: raw.username, password: raw.password, notes: raw.extra, title: raw.name || url.hostname, grouping: raw.grouping, favorite: raw.fav === '1' });
    } catch (error) { errors.push({ row: index + 2, reason: error.message }); }
  });
  return { records, errors, total: rows.length };
}

const escapeField = value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
export function serializeLastPassCsv(credentials) {
  const rows = [LASTPASS_HEADERS];
  credentials.forEach(item => rows.push([item.url || item.origins?.[0] || '', item.username, item.password, item.notes || '', item.title || '', item.grouping || '', item.favorite ? '1' : '0']));
  return `\uFEFF${rows.map(row => row.map(escapeField).join(',')).join('\r\n')}`;
}
