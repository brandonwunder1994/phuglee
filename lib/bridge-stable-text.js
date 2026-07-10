/**
 * Pure helpers for stable review-group keys.
 * Strip incidental noise (dates/times/case IDs/meta) and extract leading
 * municipal type codes so same-category free-text stacks confidently.
 * Does not mutate process rows.
 */

const { violationTypeKey } = require('./bridge-brain-store');

// Order matters: ISO first (date+optional time), then US date, then leftover times.
const DATE_ISO_RE =
  /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi;
const DATE_US_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\b/g;

/** Municipal / case-style IDs that fragment free-text keys when left in place. */
const CASE_ID_RE =
  /\b(?:PS|CE|CEV|NOV|ICS|ORR|CORA|PIR)[- ]?\d{2,4}(?:[- ]?\d{1,6}){0,3}\b/gi;

/** Month name + day + optional year (e.g. April 22, 2026). */
const MONTH_DATE_RE =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?\b/gi;

/**
 * English / free-text tokens that must never be treated as municipal type codes.
 * Keeps "HIGH GRASS", "OTHER - …", "STOP SIGN" on free-text keys.
 */
const CODE_DENYLIST = new Set([
  'other',
  'stop',
  'test',
  'none',
  'unknown',
  'signs',
  'items',
  'parking',
  'vacant',
  'yes',
  'no',
  'null',
  'n/a',
  'na',
  'see',
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'high',
  'low',
  'tall',
  'tree',
  'grass',
  'weeds',
  'weed',
  'water',
  'trash',
  'junk',
  'fence',
  'brush',
  'alley',
  'front',
  'back',
  'side',
  'move',
  'out',
  'yard',
  'lot',
  'home',
  'house',
  'pool',
  'green',
  'full',
  'dead',
  'left',
  'right',
  'near',
  'over',
  'under',
  'case',
  'code',
  'open',
  'shut',
  'only',
  'permit',
  'expired',
  'using',
  'address',
  'entire',
  'property',
  'overgrown',
  'needs',
  'mowing',
  'edging',
  'possible',
  'sweep',
  'area',
  'street',
  'block',
  'broken',
  'large',
  'small',
  'many',
  'lots',
  'into',
  'onto',
  'unit',
  'zone',
  'type',
  'desc',
  'note',
  'notes',
  'call',
  'back',
  'request',
  'update',
  'updates'
]);

/**
 * Remove incidental US/ISO dates and times from free-text or type labels.
 * Leaves category words and ordinance-like short numbers intact.
 * @param {unknown} text
 * @returns {string}
 */
function stripIncidentalTimestamps(text) {
  let s = String(text || '');
  s = s.replace(DATE_ISO_RE, ' ');
  s = s.replace(DATE_US_RE, ' ');
  s = s.replace(TIME_RE, ' ');
  // Dangling separators left after date/time removal
  s = s.replace(/\s+[-–—|,;:/]+\s+/g, ' ');
  s = s.replace(/^[-–—|,;:/]+\s*/, '').replace(/\s*[-–—|,;:/]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Broader incidental-noise strip for group keys: timestamps + case IDs +
 * asterisk meta + xN multipliers + month-name dates.
 * @param {unknown} text
 * @returns {string}
 */
function stripIncidentalNoise(text) {
  let s = String(text || '');
  s = s.replace(/\r\n|\r|\n/g, ' ');
  s = s.replace(CASE_ID_RE, ' ');
  s = s.replace(MONTH_DATE_RE, ' ');
  s = s.replace(DATE_ISO_RE, ' ');
  s = s.replace(DATE_US_RE, ' ');
  s = s.replace(TIME_RE, ' ');
  // *CALL BACK…* / **REQUESTING…** meta blocks
  s = s.replace(/\*{1,3}[^*]*\*{1,3}/g, ' ');
  // Multipliers: HGWx2 / HGW x2 / x 3 (glued or spaced)
  s = s.replace(/\b([A-Za-z]{2,5})x\d+\b/gi, '$1');
  s = s.replace(/\bx\s*\d+\b/gi, ' ');
  // Dangling separators / punctuation clusters
  s = s.replace(/\s+[-–—|,;:/]+\s+/g, ' ');
  s = s.replace(/^[-–—|,;:/]+\s*/, '').replace(/\s*[-–—|,;:/]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Normalize one raw code token (HGW | O/S) → lowercase letters only.
 * @param {string} tok
 * @returns {string}
 */
function normalizeCodeToken(tok) {
  return String(tok || '')
    .replace(/\//g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extract leading municipal type codes when confident.
 * Only the leading code *run* is considered — free-text tails are ignored.
 * Separators between codes: comma, slash, plus, ampersand (not bare spaces),
 * so "HIGH GRASS" does not become two codes and "HGW SIDEWALK" → [hgw].
 *
 * @param {unknown} text
 * @returns {string[] | null} sorted unique lowercase codes, or null
 */
function extractLeadingTypeCodes(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // Title-case English sentences are never municipal code runs
  const headProbe = raw.split(/\s+/)[0] || '';
  if (
    /^[A-Z][a-z]{2,}/.test(headProbe) &&
    !/^[A-Za-z]\/[A-Za-z]$/.test(headProbe)
  ) {
    return null;
  }

  const cleaned = stripIncidentalNoise(raw);
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();

  // Leading code run: CODE ( SEP CODE )* where SEP is , / + & (optional spaces)
  // CODE is 2–5 letters OR single-letter/single-letter (O/S)
  const CODE = '(?:[A-Z]{2,5}|[A-Z]\\/[A-Z])';
  const SEP = '\\s*[,/+&]\\s*';
  const runRe = new RegExp(`^(${CODE}(?:${SEP}${CODE})*)`);
  const m = upper.match(runRe);
  if (!m) return null;

  const run = m[1];
  // Tokenize the run only (never the free-text tail)
  const tokenRe = /[A-Z]\/[A-Z]|[A-Z]{2,5}/g;
  const tokens = [];
  let tm;
  while ((tm = tokenRe.exec(run)) !== null) {
    tokens.push(tm[0]);
  }
  if (!tokens.length) return null;

  const norm = [];
  for (const tok of tokens) {
    const n = normalizeCodeToken(tok);
    if (n.length < 2 || n.length > 5) return null;
    if (CODE_DENYLIST.has(n)) return null;
    norm.push(n);
  }

  if (!norm.length) return null;
  return [...new Set(norm)].sort();
}

/**
 * Stable type key: leading codes if confident, else strip noise then violationTypeKey.
 * @param {unknown} text
 * @returns {string}
 */
function stableTypeKey(text) {
  const codes = extractLeadingTypeCodes(text);
  if (codes && codes.length) {
    return codes.join('+');
  }
  return violationTypeKey(stripIncidentalNoise(text));
}

/**
 * Stable free-text description key for empty-type groups.
 * Leading codes if confident; else strip + lower + collapse; empty → ''.
 * @param {unknown} text
 * @returns {string}
 */
function stableDescriptionKey(text) {
  const codes = extractLeadingTypeCodes(text);
  if (codes && codes.length) {
    return codes.join('+');
  }
  const stripped = stripIncidentalNoise(String(text || ''));
  return String(stripped || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

module.exports = {
  stripIncidentalTimestamps,
  stripIncidentalNoise,
  extractLeadingTypeCodes,
  stableTypeKey,
  stableDescriptionKey
};
