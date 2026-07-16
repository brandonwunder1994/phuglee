'use strict';

/**
 * Extract pre-lien (civil complaint) fields from complaint/summons text.
 * Heuristic — good enough to batch complaints into Filter CSV; operator reviews.
 */

const { normalizeAddressRow } = require('./address-normalize');

const MONEY_RE = /\$\s*([\d,]+(?:\.\d{2})?)/;
const CASE_NO_RE = /(?:case\s*(?:no\.?|number|#)|cause\s*(?:no\.?|number)|file\s*(?:no\.?|number)|docket\s*(?:no\.?|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/]{3,})/i;
const FILED_RE = /(?:filed|filing\s+date|date\s+filed|commenced)\s*(?:on|:)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i;
const STREET_SUFFIX =
  '(?:street|avenue|boulevard|parkway|highway|drive|lane|court|circle|terrace|place|road|way|plaza|trail|loop|alley|ave|blvd|pkwy|hwy|dr|ln|ct|cir|ter|pl|rd|st)\\.?';
const ADDR_LINE_RE = new RegExp(
  `(\\d{1,6}\\s+[A-Za-z0-9.#/' -]{2,50}?\\s+${STREET_SUFFIX})` +
  `(?:\\s*,?\\s*([A-Za-z .'-]{2,40}))?` +
  `(?:\\s*,?\\s*([A-Z]{2}))?` +
  `(?:\\s*(\\d{5})(?:-\\d{4})?)?`,
  'i'
);

function cleanName(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[,;]+$/g, '')
    .replace(/^(the\s+)?(plaintiff|defendant|petitioner|respondent)\s*:?\s*/i, '')
    .replace(/\b(plaintiff|defendant|petitioner|respondent)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function parseMoney(text) {
  const m = String(text || '').match(MONEY_RE);
  if (!m) return '';
  return m[1].replace(/,/g, '');
}

function parseCaseNumber(text) {
  const m = String(text || '').match(CASE_NO_RE);
  return m ? m[1].trim() : '';
}

function parseFiledDate(text) {
  const m = String(text || '').match(FILED_RE);
  return m ? m[1].trim() : '';
}

function parseParties(text) {
  const block = String(text || '').slice(0, 3500);
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Caption style: NAME / Plaintiff, / v. / NAME / Defendant
  let plaintiff = '';
  let defendant = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^plaintiffs?[,.]?$/i.test(lines[i]) && i > 0) {
      const prev = cleanName(lines[i - 1]);
      if (prev && !/^(v\.|vs\.?|versus)$/i.test(prev)) plaintiff = prev;
    }
    if (/^defendants?[,.]?$/i.test(lines[i]) && i > 0) {
      const prev = cleanName(lines[i - 1]);
      if (prev && !/^(v\.|vs\.?|versus)$/i.test(prev)) defendant = prev;
    }
  }
  if (plaintiff && defendant) {
    return { plaintiff, defendant };
  }

  // Inline: Plaintiff: X / Defendant: Y
  const pLabel = block.match(/plaintiff\s*[:\-]\s*([^\n]+)/i);
  const dLabel = block.match(/defendant\s*[:\-]\s*([^\n]+)/i);
  if (pLabel || dLabel) {
    return {
      plaintiff: cleanName(pLabel ? pLabel[1] : plaintiff),
      defendant: cleanName(dLabel ? dLabel[1] : defendant)
    };
  }

  // Compact: Acme Bank v. Jane Doe
  const vs = block.match(
    /([A-Z][A-Za-z0-9&.,' -]{2,80}?)\s+(?:v\.|vs\.?|versus)\s+([A-Z][A-Za-z0-9&.,' -]{2,80}?)(?:\n|,|\bat\b|$)/
  );
  if (vs) {
    return { plaintiff: cleanName(vs[1]), defendant: cleanName(vs[2]) };
  }

  return { plaintiff: plaintiff || '', defendant: defendant || '' };
}

function findServiceAddress(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const anchors = [
    'served at',
    'service address',
    'reside',
    'residence',
    'address for service',
    'last known address',
    'defendant\'s address',
    'defendant address',
    'whose address is',
    'lives at',
    'located at'
  ];
  let bestIdx = -1;
  for (const a of anchors) {
    const i = lower.indexOf(a);
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) bestIdx = i;
  }
  const window = bestIdx >= 0
    ? raw.slice(bestIdx, bestIdx + 400)
    : raw.slice(0, 2000);

  const m = window.match(ADDR_LINE_RE);
  if (m) {
    return {
      streetAddress: m[1].replace(/\s+/g, ' ').trim(),
      city: (m[2] || '').replace(/\s+/g, ' ').trim(),
      state: (m[3] || '').toUpperCase(),
      zip: m[4] || ''
    };
  }

  // Fallback: first street-like line in whole doc
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const hit = line.match(ADDR_LINE_RE);
    if (hit) {
      return {
        streetAddress: hit[1].replace(/\s+/g, ' ').trim(),
        city: (hit[2] || '').replace(/\s+/g, ' ').trim(),
        state: (hit[3] || '').toUpperCase(),
        zip: hit[4] || ''
      };
    }
  }
  return { streetAddress: '', city: '', state: '', zip: '' };
}

function guessCaseType(text, plaintiff) {
  const t = `${text} ${plaintiff}`.toLowerCase();
  if (/\bhoa\b|homeowners?\s+assoc/i.test(t)) return 'HOA';
  if (/\bcity of\b|\bcounty of\b|municipality|code\s+enforcement/i.test(t)) return 'City / municipal';
  if (/\btax\b|irs|department of revenue/i.test(t)) return 'Tax collection';
  if (/capital one|discover|amex|american express|chase|citibank|synchrony|credit\s+card|bank\b/i.test(t)) {
    return 'Credit card / consumer debt';
  }
  if (/small\s+claims/i.test(t)) return 'Small claims';
  return 'Civil complaint';
}

/**
 * @param {string} text
 * @param {{ sourceFile?: string }} [opts]
 */
function extractComplaintFromText(text, opts = {}) {
  const raw = String(text || '').replace(/\u0000/g, ' ');
  const parties = parseParties(raw);
  const addr = findServiceAddress(raw);
  const caseNumber = parseCaseNumber(raw);
  const filedDate = parseFiledDate(raw);
  const amount = parseMoney(raw);
  const caseType = guessCaseType(raw, parties.plaintiff);

  const notes = [
    caseNumber ? `Case ${caseNumber}` : '',
    parties.plaintiff ? `Plaintiff: ${parties.plaintiff}` : '',
    amount ? `Claimed $${amount}` : '',
    parties.defendant ? `Defendant: ${parties.defendant}` : '',
    'Owner-match unchecked — confirm defendant owns this address before outreach'
  ].filter(Boolean).join(' · ');

  return {
    streetAddress: addr.streetAddress,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    defendantName: parties.defendant,
    plaintiff: parties.plaintiff,
    caseNumber,
    filedDate,
    amountClaimed: amount,
    caseType,
    violationIssueType: caseType,
    violationDate: filedDate,
    descriptionNotes: notes,
    sourceFile: opts.sourceFile || '',
    ownerMatch: 'unchecked',
    confidence: addr.streetAddress && parties.defendant ? 'medium' : 'low'
  };
}

/**
 * Convert extract rows to Filter-ready objects (canonical columns + extras).
 */
function toFilterRows(rows) {
  return (rows || []).map((r) => ({
    streetAddress: r.streetAddress || '',
    city: r.city || '',
    state: r.state || '',
    zip: r.zip || '',
    county: r.county || '',
    violationIssueType: r.violationIssueType || r.caseType || 'Pre-lien',
    violationDate: r.violationDate || r.filedDate || '',
    descriptionNotes: r.descriptionNotes || '',
    defendantName: r.defendantName || '',
    plaintiff: r.plaintiff || '',
    caseNumber: r.caseNumber || '',
    amountClaimed: r.amountClaimed || '',
    ownerName: r.ownerName || r.ownerMatchOwner || '',
    mailingAddress: r.mailingAddress || '',
    ownerMatch: r.ownerMatch || 'unchecked',
    ownerMatchScore: r.ownerMatchScore != null ? r.ownerMatchScore : '',
    ownerMatchReason: r.ownerMatchReason || '',
    sourceFile: r.sourceFile || '',
    uploadType: 'pre_lien'
  }));
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  const cols = [
    'Street Address',
    'City',
    'State',
    'Zip',
    'County',
    'Violation/Issue Type',
    'Violation Date',
    'Description/Notes',
    'Defendant Name',
    'Plaintiff',
    'Case Number',
    'Amount Claimed',
    'Owner Name',
    'Mailing Address',
    'Owner Match',
    'Owner Match Score',
    'Owner Match Reason'
  ];
  const keys = [
    'streetAddress', 'city', 'state', 'zip', 'county', 'violationIssueType', 'violationDate',
    'descriptionNotes', 'defendantName', 'plaintiff', 'caseNumber', 'amountClaimed',
    'ownerName', 'mailingAddress', 'ownerMatch', 'ownerMatchScore', 'ownerMatchReason'
  ];
  const lines = [cols.join(',')];
  for (const row of toFilterRows(rows)) {
    lines.push(keys.map((k) => csvEscape(row[k])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Keep rows worth sending to an external skip-trace tool.
 * Default: matched only. Pass includePossible:true to add soft matches.
 */
function filterOwnerMatchedRows(rows, opts = {}) {
  const includePossible = opts.includePossible === true;
  return (rows || []).filter((r) => {
    const v = String(r.ownerMatch || '');
    if (v === 'matched') return true;
    if (includePossible && v === 'possible') return true;
    return false;
  });
}

/**
 * Slim CSV for external skip tools — owner + property + case basics only.
 */
function rowsToSkipCsv(rows, opts = {}) {
  const selected = filterOwnerMatchedRows(rows, opts);
  const cols = [
    'Owner Name',
    'Street Address',
    'City',
    'State',
    'Zip',
    'County',
    'Mailing Address',
    'Defendant Name',
    'Plaintiff',
    'Case Number',
    'Amount Claimed',
    'Owner Match',
    'Owner Match Score'
  ];
  const keys = [
    'ownerName', 'streetAddress', 'city', 'state', 'zip', 'county', 'mailingAddress',
    'defendantName', 'plaintiff', 'caseNumber', 'amountClaimed',
    'ownerMatch', 'ownerMatchScore'
  ];
  const lines = [cols.join(',')];
  for (const row of toFilterRows(selected)) {
    lines.push(keys.map((k) => csvEscape(row[k])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Fill blank place fields from the selected county playbook.
 * Never invents city from county — only uses place.city when explicitly provided.
 */
function stampPlaybookPlace(rows, place = {}) {
  const state = String(place.state || '').trim().toUpperCase().slice(0, 2);
  const county = String(place.county || '').trim();
  const city = String(place.city || '').trim();
  if (!state && !county && !city) {
    return { rows: Array.isArray(rows) ? rows.slice() : [], stamped: 0 };
  }

  let stamped = 0;
  const out = (rows || []).map((row) => {
    const next = { ...row };
    let changed = false;
    if (!String(next.state || '').trim() && state) {
      next.state = state;
      changed = true;
    }
    if (!String(next.city || '').trim() && city) {
      next.city = city;
      changed = true;
    }
    if (!String(next.county || '').trim() && county) {
      next.county = county;
      changed = true;
    }
    if (changed) {
      stamped += 1;
      const note = 'Place from playbook';
      if (!String(next.descriptionNotes || '').includes(note)) {
        next.descriptionNotes = [next.descriptionNotes, note]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 400);
      }
    }
    return next;
  });

  return { rows: out, stamped };
}

const MATCH_RANK = {
  matched: 4,
  possible: 3,
  no_match: 2,
  no_owner: 1,
  unchecked: 0
};

function addressDedupeKey(row) {
  const n = normalizeAddressRow(row || {});
  const street = String(n.streetAddress || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!street) return '';
  const city = String(n.city || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const state = String(n.state || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  // Zip omitted: clerk PDFs often drop it on one copy — street+city+state is the property.
  return `${street}|${city}|${state}`;
}

function rowQuality(row) {
  const rank = MATCH_RANK[String(row.ownerMatch || 'unchecked')] || 0;
  const score = Number(row.ownerMatchScore) || 0;
  const filled = [
    'ownerName', 'defendantName', 'plaintiff', 'caseNumber', 'amountClaimed', 'zip', 'mailingAddress'
  ].reduce((n, k) => n + (String(row[k] || '').trim() ? 1 : 0), 0);
  return rank * 1000 + score * 10 + filled;
}

function mergeDedupeNotes(keeper, dup) {
  const files = [keeper.sourceFile, dup.sourceFile]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const uniqueFiles = [...new Set(files)];
  const next = { ...keeper };
  if (uniqueFiles.length) next.sourceFile = uniqueFiles.join('; ');

  const fillIfEmpty = [
    'zip', 'city', 'state', 'ownerName', 'mailingAddress', 'defendantName',
    'plaintiff', 'caseNumber', 'amountClaimed', 'violationDate', 'violationIssueType'
  ];
  for (const key of fillIfEmpty) {
    if (!String(next[key] || '').trim() && String(dup[key] || '').trim()) {
      next[key] = dup[key];
    }
  }

  if (rowQuality(dup) > rowQuality(keeper)) {
    next.ownerMatch = dup.ownerMatch;
    next.ownerMatchScore = dup.ownerMatchScore;
    next.ownerMatchReason = dup.ownerMatchReason || next.ownerMatchReason;
    if (dup.ownerName) next.ownerName = dup.ownerName;
    if (dup.mailingAddress) next.mailingAddress = dup.mailingAddress;
  }

  const noteBits = [next.descriptionNotes, dup.descriptionNotes]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (uniqueFiles.length > 1) {
    noteBits.push(`Deduped sources: ${uniqueFiles.join(', ')}`);
  }
  next.descriptionNotes = [...new Set(noteBits)].join(' · ').slice(0, 400);
  return next;
}

/**
 * One row per property address in a batch.
 * Prefers stronger owner-match when collapsing duplicates.
 */
function dedupePreLienRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map();
  const noKey = [];
  let removed = 0;

  for (const row of list) {
    const key = addressDedupeKey(row);
    if (!key) {
      noKey.push(row);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    removed += 1;
    byKey.set(key, rowQuality(row) >= rowQuality(prev)
      ? mergeDedupeNotes(row, prev)
      : mergeDedupeNotes(prev, row));
  }

  return {
    rows: [...byKey.values(), ...noKey],
    removed,
    before: list.length
  };
}

module.exports = {
  extractComplaintFromText,
  toFilterRows,
  rowsToCsv,
  filterOwnerMatchedRows,
  rowsToSkipCsv,
  dedupePreLienRows,
  addressDedupeKey,
  stampPlaybookPlace,
  parseParties,
  findServiceAddress,
  parseCaseNumber
};
