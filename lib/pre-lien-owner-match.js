'use strict';

/**
 * Pre-lien owner-match: score defendant name vs assessor / REAPI owner.
 * Pure matching is always available; live lookup needs REALESTATE_API_KEY.
 */

const NOISE_TOKENS = new Set([
  'LLC', 'L.L.C', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY',
  'LTD', 'LIMITED', 'LP', 'LLP', 'PLC', 'TRUST', 'TRUSTEE', 'ETAL', 'ET', 'AL',
  'JR', 'SR', 'II', 'III', 'IV', 'MR', 'MRS', 'MS', 'DR', 'THE', 'AND', 'OF',
  'A', 'AN', 'DBA', 'AKA'
]);

function normalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[.,/#'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizeName(value)
    .split(' ')
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t && !NOISE_TOKENS.has(t) && t.length > 1);
}

/**
 * @returns {{ score: number, verdict: 'matched'|'possible'|'no_match'|'no_owner', reason: string }}
 */
function scoreDefendantVsOwner(defendantName, ownerName) {
  const defTokens = nameTokens(defendantName);
  const ownTokens = nameTokens(ownerName);
  if (!defTokens.length) {
    return { score: 0, verdict: 'no_match', reason: 'No defendant name' };
  }
  if (!ownTokens.length) {
    return { score: 0, verdict: 'no_owner', reason: 'No owner on record' };
  }

  const defSet = new Set(defTokens);
  const ownSet = new Set(ownTokens);
  const overlap = [...defSet].filter((t) => ownSet.has(t));
  const lastDef = defTokens[defTokens.length - 1];
  const lastOwn = ownTokens[ownTokens.length - 1];
  const lastMatch = lastDef === lastOwn;

  if (normalizeName(defendantName) === normalizeName(ownerName)) {
    return { score: 100, verdict: 'matched', reason: 'Exact name match' };
  }

  // Same last name + at least one other shared token (first/middle)
  if (lastMatch && overlap.length >= 2) {
    return { score: 92, verdict: 'matched', reason: 'Last name + given name token match' };
  }

  // Same last name + first initial
  if (lastMatch && defTokens[0] && ownTokens[0] && defTokens[0][0] === ownTokens[0][0]) {
    return { score: 85, verdict: 'matched', reason: 'Last name + first initial match' };
  }

  if (lastMatch) {
    return { score: 70, verdict: 'possible', reason: 'Last name only — verify manually' };
  }

  // High token overlap without shared last (hyphenated / order swap)
  const union = new Set([...defSet, ...ownSet]);
  const jaccard = overlap.length / Math.max(1, union.size);
  if (jaccard >= 0.6 && overlap.length >= 2) {
    return { score: 80, verdict: 'matched', reason: 'Strong name token overlap' };
  }
  if (jaccard >= 0.4 && overlap.length >= 1) {
    return { score: 55, verdict: 'possible', reason: 'Partial name overlap — verify' };
  }

  return { score: 10, verdict: 'no_match', reason: 'Defendant does not match owner' };
}

function extractOwnersFromDetailRaw(raw) {
  const data = raw?.data ?? raw?.property ?? raw ?? {};
  const info = data.ownerInfo || {};
  const names = [];

  const push = (full, first, last) => {
    const composed = String(full || '').trim()
      || [first, last].filter(Boolean).join(' ').trim();
    if (composed) names.push(composed);
  };

  push(info.owner1FullName, info.owner1FirstName, info.owner1LastName);
  push(info.owner2FullName, info.owner2FirstName, info.owner2LastName);
  push(data.owner1FullName, data.owner1FirstName, data.owner1LastName);
  push(data.owner2FullName, data.owner2FirstName, data.owner2LastName);
  if (info.companyName) names.push(String(info.companyName));
  if (data.companyName) names.push(String(data.companyName));

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const n of names) {
    const key = normalizeName(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }

  const mail = info.mailAddress || data.mailAddress || {};
  return {
    ownerNames: unique,
    ownerName: unique[0] || '',
    mailingAddress: mail.label
      || [mail.address, mail.city, mail.state, mail.zip].filter(Boolean).join(', '),
    ownerType: info.owner1Type || data.owner1Type || '',
    corporateOwned: Boolean(info.corporateOwned || data.corporateOwned)
  };
}

function bestScoreAgainstOwners(defendantName, ownerNames) {
  let best = { score: 0, verdict: 'no_owner', reason: 'No owner on record', matchedOwner: '' };
  for (const owner of ownerNames || []) {
    const scored = scoreDefendantVsOwner(defendantName, owner);
    if (scored.score > best.score) {
      best = { ...scored, matchedOwner: owner };
    }
  }
  if (!ownerNames?.length) {
    return { score: 0, verdict: 'no_owner', reason: 'No owner on record', matchedOwner: '' };
  }
  return best;
}

function ownerMatchStatusFromVerdict(verdict) {
  if (verdict === 'matched') return 'matched';
  if (verdict === 'possible') return 'possible';
  if (verdict === 'no_owner') return 'no_owner';
  return 'no_match';
}

/**
 * Apply match result onto a Filter/pre-lien row (mutates copy).
 */
function applyOwnerMatchToRow(row, match) {
  const next = { ...(row || {}) };
  next.ownerName = match.ownerName || next.ownerName || '';
  next.ownerNames = match.ownerNames || next.ownerNames || [];
  next.mailingAddress = match.mailingAddress || next.mailingAddress || '';
  next.ownerMatch = ownerMatchStatusFromVerdict(match.verdict);
  next.ownerMatchScore = match.score;
  next.ownerMatchReason = match.reason;
  next.ownerMatchOwner = match.matchedOwner || match.ownerName || '';
  return next;
}

module.exports = {
  normalizeName,
  nameTokens,
  scoreDefendantVsOwner,
  extractOwnersFromDetailRaw,
  bestScoreAgainstOwners,
  ownerMatchStatusFromVerdict,
  applyOwnerMatchToRow
};
