/**
 * Data Bridge v2 — near-duplicate detection within a single upload.
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

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
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

function dedupeRows(rows, options = {}) {
  const threshold = options.threshold ?? 0.92;
  const kept = [];
  const removed = [];

  for (const row of rows) {
    let duplicateOf = null;
    for (const existing of kept) {
      if (isNearDuplicate(existing, row, threshold)) {
        duplicateOf = existing;
        break;
      }
    }

    if (duplicateOf) {
      removed.push({ row, duplicateOf });
    } else {
      kept.push(row);
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
  similarityScore,
  isNearDuplicate,
  dedupeKey,
  dedupeRows
};