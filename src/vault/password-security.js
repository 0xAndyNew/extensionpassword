const COMMON_PASSWORDS = new Set([
  '123456', '12345678', '123456789', 'password', 'password1', 'qwerty',
  'qwerty123', 'abc123', 'admin', 'admin123', 'letmein', 'welcome',
  'iloveyou', '111111', '000000', '123123', 'dragon', 'monkey'
]);

const SEQUENCES = [
  '0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'poiuytrewq',
  'asdfghjkl', 'lkjhgfdsa'
];

function hasSequence(value) {
  const lower = value.toLowerCase();
  return SEQUENCES.some(sequence => {
    for (let length = 4; length <= sequence.length; length += 1) {
      for (let start = 0; start <= sequence.length - length; start += 1) {
        if (lower.includes(sequence.slice(start, start + length))) return true;
      }
    }
    return false;
  });
}

export function scorePassword(password = '') {
  const value = String(password);
  if (!value) return { score: 0, level: 'weak', reasons: ['empty'] };

  let score = Math.min(48, value.length * 4);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(value)).length;
  score += classes * 8;
  if (value.length >= 12) score += 8;
  if (value.length >= 16) score += 8;

  const reasons = [];
  if (value.length < 8) { score -= 28; reasons.push('too-short'); }
  else if (value.length < 12) reasons.push('short');
  if (classes < 3) { score -= 14; reasons.push('low-variety'); }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) { score = Math.min(score, 8); reasons.push('common'); }
  if (/(.)\1{2,}/.test(value)) { score -= 18; reasons.push('repeated'); }
  if (hasSequence(value)) { score -= 18; reasons.push('sequence'); }
  if (/^(\w{1,4})\1{2,}$/i.test(value)) { score -= 18; reasons.push('pattern'); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 75 ? 'strong' : score >= 45 ? 'medium' : 'weak';
  return { score, level, reasons: [...new Set(reasons)] };
}

export function analyzeCredentials(credentials = []) {
  const passwordCounts = new Map();
  credentials.forEach(item => {
    const password = String(item.password || '');
    if (password) passwordCounts.set(password, (passwordCounts.get(password) || 0) + 1);
  });

  const items = credentials.map(item => {
    const password = String(item.password || '');
    const result = scorePassword(password);
    const reused = Boolean(password && passwordCounts.get(password) > 1);
    return {
      id: item.id,
      title: item.title || 'Không tiêu đề',
      username: item.username || '',
      url: item.url || item.origins?.[0] || '',
      score: result.score,
      level: result.level,
      reasons: result.reasons,
      reused
    };
  });

  const counts = {
    total: items.length,
    strong: items.filter(item => item.level === 'strong').length,
    medium: items.filter(item => item.level === 'medium').length,
    weak: items.filter(item => item.level === 'weak').length,
    reused: items.filter(item => item.reused).length
  };

  const average = counts.total
    ? items.reduce((sum, item) => sum + item.score, 0) / counts.total
    : 100;
  const reusePenalty = counts.total ? (counts.reused / counts.total) * 25 : 0;
  const overallScore = Math.max(0, Math.min(100, Math.round(average - reusePenalty)));

  return { overallScore, counts, items };
}
