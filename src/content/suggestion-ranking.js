(function installSuggestionRanking(root) {
  'use strict';

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([@._+\-])\s*/g, '$1')
      .trim();
  }

  function textContainsIdentity(text, identity) {
    const normalizedText = normalizeText(text);
    const normalizedIdentity = normalizeText(identity);
    if (!normalizedText || normalizedIdentity.length < 3) return false;

    const index = normalizedText.indexOf(normalizedIdentity);
    if (index < 0) return false;
    const isWordCharacter = character => /[\p{L}\p{N}_]/u.test(character || '');
    const before = normalizedText[index - 1] || '';
    const after = normalizedText[index + normalizedIdentity.length] || '';
    return !isWordCharacter(before) && !isWordCharacter(after);
  }

  function extractIdentityCandidates(text) {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    const matches = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}._+\-]*@[\p{L}\p{N}](?:[\p{L}\p{N}\-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}\-]*[\p{L}\p{N}])?)+/gu) || [];
    return [...new Set(matches)];
  }

  function urlMatchScore(credential, pageUrl) {
    let current;
    try {
      current = new URL(pageUrl);
    } catch {
      return 0;
    }

    const candidates = [
      credential?.url,
      ...(Array.isArray(credential?.origins) ? credential.origins : [])
    ];
    let best = 0;
    for (const value of candidates) {
      if (!value) continue;
      try {
        const saved = new URL(value);
        if (saved.origin !== current.origin) continue;
        best = Math.max(best, 100);
        if (saved.pathname === current.pathname) best = Math.max(best, 300);
        if (
          saved.pathname !== '/'
          && current.pathname.startsWith(saved.pathname.replace(/\/$/, '') + '/')
        ) {
          best = Math.max(best, 220);
        }
        if (saved.search && saved.search === current.search) best += 20;
      } catch {
        // Invalid legacy URLs do not influence ranking.
      }
    }
    return best;
  }

  function rankCredentials(credentials, { identityHints = [], pageUrl = '' } = {}) {
    const normalizedHints = identityHints.map(normalizeText).filter(Boolean);
    return [...credentials]
      .map((credential, index) => {
        const username = normalizeText(credential?.username);
        const identityIndex = username ? normalizedHints.indexOf(username) : -1;
        const identityScore = identityIndex >= 0 ? 10_000 - identityIndex * 100 : 0;
        return {
          credential,
          index,
          score: identityScore + urlMatchScore(credential, pageUrl)
        };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(entry => entry.credential);
  }

  function matchCredentialsToIdentityHints(credentials, identityHints = []) {
    const normalizedHints = new Set(identityHints.map(normalizeText).filter(Boolean));
    if (!normalizedHints.size) return [];
    return credentials.filter(credential => normalizedHints.has(normalizeText(credential?.username)));
  }

  root.AegisSuggestionRanking = Object.freeze({
    extractIdentityCandidates,
    matchCredentialsToIdentityHints,
    rankCredentials,
    textContainsIdentity
  });
})(globalThis);
