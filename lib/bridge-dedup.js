/**
 * Data Bridge v2 — near-duplicate detection within a single upload.
 * Exact-key map + street-number buckets so large files stay fast (not n²).
 */

const ABBREVIATIONS = Object.freeze([
  ['street', 'st'],
  ['avenue', 'ave'],
  ['boulevard', 'blvd'],
  ['drive', 'dr'],
  ['road', 'rd'],
  ['lane', 'ln'],
  ['court', 'ct'],
  ['circle', 'cir'],
  ['place', 'pl'],
  ['terrace', 'ter'],
  ['highway', 'hwy'],
  ['north', 'n'],
  ['south', 's'],
  ['east', 'e'],
  ['west', 'w']
]);

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[#,./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAbbreviations(value) {
  let out = ` ${value} `;
  for (const [full, abbr] of ABBREVIATIONS) {
    out = out.replace(new RegExp(`\\b${abbr}\\b`, 'g'), ` ${full} `);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function normalizeAddress(address) {
  return expandAbbreviations(normalizeToken(address));
}

function normalizeIssueType(value) {
  return normalizeToken(value).replace(/[^a-z0-9 ]/g, '').trim();
}

function leadingStreetNumber(address) {
  const match = String(address || '').trim().match(/^(\d{1,6})\b/);
  return match ? match[1] : null;
}

/**
 * Bucket so fuzzy compares only run among likely peers (same house # or same street tokens).
 */
function nearDedupeBucket(row) {
  const num = leadingStreetNumber(row && row.streetAddress);
  if (num) return `n:${num}`;
  const norm = normalizeAddress(row && row.streetAddress);
  if (!norm) return 'empty';
  const parts = norm.split(' ').filter(Boolean).slice(0, 3);
  return `t:${parts.join(' ')}`;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Ensure a is shorter for less memory
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const prev = new Array(a.length + 1);
  const curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i += 1) prev[i] = i;

  for (let j = 1; j <= b.length; j += 1) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,
        curr[i - 1] + 1,
        prev[i - 1] + cost
      );
    }
    for (let i = 0; i <= a.length; i += 1) prev[i] = curr[i];
  }
  return prev[a.length];
}

function similarityScore(a, b) {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 0;
  return 1 - (levenshtein(left, right) / maxLen);
}

function isNearDuplicate(rowA, rowB, threshold = 0.92) {
  const numA = leadingStreetNumber(rowA.streetAddress);
  const numB = leadingStreetNumber(rowB.streetAddress);
  if (numA && numB && numA !== numB) return false;

  const addressScore = similarityScore(rowA.streetAddress, rowB.streetAddress);
  if (addressScore < threshold) return false;

  const issueA = normalizeIssueType(rowA.violationIssueType);
  const issueB = normalizeIssueType(rowB.violationIssueType);
  if (!issueA || !issueB) return addressScore >= threshold;
  if (issueA === issueB) return true;

  const issueMax = Math.max(issueA.length, issueB.length);
  const issueScore = issueMax
    ? 1 - (levenshtein(issueA, issueB) / issueMax)
    : 1;
  return issueScore >= 0.85;
}

function dedupeKey(row) {
  return [
    normalizeAddress(row.streetAddress),
    normalizeIssueType(row.violationIssueType),
    normalizeToken(row.violationDate)
  ].join('|');
}

/**
 * Keep first of exact key, then near-duplicates only within the same bucket.
 */
function dedupeRows(rows, options = {}) {
  const threshold = options.threshold ?? 0.92;
  const kept = [];
  const removed = [];
  const exactSeen = new Map();
  /** @type {Map<string, object[]>} */
  const buckets = new Map();

  for (const row of rows || []) {
    const exact = dedupeKey(row);
    if (exactSeen.has(exact)) {
      removed.push({ row, duplicateOf: exactSeen.get(exact) });
      continue;
    }

    const bKey = nearDedupeBucket(row);
    const peers = buckets.get(bKey) || [];
    let duplicateOf = null;
    for (const existing of peers) {
      if (isNearDuplicate(existing, row, threshold)) {
        duplicateOf = existing;
        break;
      }
    }

    if (duplicateOf) {
      removed.push({ row, duplicateOf });
    } else {
      kept.push(row);
      exactSeen.set(exact, row);
      if (!buckets.has(bKey)) buckets.set(bKey, []);
      buckets.get(bKey).push(row);
    }
  }

  return {
    rows: kept,
    removedCount: removed.length,
    removed
  };
}

/**
 * Cross-file / multi-list dedupe: one lead per address.
 * Same property with different violation wording in another export is still one lead.
 * Uses normalized address equality + near-match (street number + similarity), ignoring issue type.
 */
function isSameAddressLead(rowA, rowB, threshold = 0.92) {
  const left = normalizeAddress(rowA?.streetAddress);
  const right = normalizeAddress(rowB?.streetAddress);
  if (!left || !right) return false;
  if (left === right) return true;

  const numA = leadingStreetNumber(rowA.streetAddress);
  const numB = leadingStreetNumber(rowB.streetAddress);
  if (numA && numB && numA !== numB) return false;

  return similarityScore(rowA.streetAddress, rowB.streetAddress) >= threshold;
}

function addressExactKey(row) {
  return normalizeAddress(row && row.streetAddress);
}

function dedupeRowsByAddress(rows, options = {}) {
  const threshold = options.threshold ?? 0.92;
  const kept = [];
  const removed = [];
  const exactSeen = new Map();
  /** @type {Map<string, object[]>} */
  const buckets = new Map();

  for (const row of rows || []) {
    const exact = addressExactKey(row);
    if (exact && exactSeen.has(exact)) {
      removed.push({ row, duplicateOf: exactSeen.get(exact) });
      continue;
    }

    const bKey = nearDedupeBucket(row);
    const peers = buckets.get(bKey) || [];
    let duplicateOf = null;
    for (const existing of peers) {
      if (isSameAddressLead(existing, row, threshold)) {
        duplicateOf = existing;
        break;
      }
    }

    if (duplicateOf) {
      removed.push({ row, duplicateOf });
    } else {
      kept.push(row);
      if (exact) exactSeen.set(exact, row);
      if (!buckets.has(bKey)) buckets.set(bKey, []);
      buckets.get(bKey).push(row);
    }
  }

  return {
    rows: kept,
    removedCount: removed.length,
    removed
  };
}

module.exports = {
  normalizeAddress,
  normalizeIssueType,
  leadingStreetNumber,
  nearDedupeBucket,
  similarityScore,
  isNearDuplicate,
  isSameAddressLead,
  dedupeKey,
  dedupeRows,
  dedupeRowsByAddress
};
