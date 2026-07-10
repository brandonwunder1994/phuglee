/**
 * Pure Type-column scorer (COL-01/02/04).
 *
 * Ranks headers with alias + value-shape features; picks exactly one winner
 * or null. Never blends/concatenates columns. Aliases are score features only —
 * toxic description aliases on the Type list do not auto-win without categorical
 * value shape.
 *
 * Tie / margin policy (documented):
 * - If top.score < minScore → null
 * - If #1 and #2 both ≥ minScore and margin < minMargin:
 *   take #1 when its header-alias tier is strictly better; else null
 * - Else take #1 (single ranked entry object — never string-concat)
 *
 * Process wire (force columnMap) is Plan 03 — this module is pure only.
 */

const {
  normalizeHeader,
  INTAKE_FIELD_ALIASES
} = require('./bridge-intake-schema');
const {
  isCategoryLikeHeader,
  NARRATIVE_HEADER_RE,
  TIMESTAMP_ONLY_RE
} = require('./bridge-category-promote');

/** Local address heuristic (STREET_HINT_RE not exported from intake-schema). */
const STREET_HINT_RE = /\d+\s+\w|^\s*\d{1,6}\s+[\w#./-]+/i;

const TYPE_ALIASES = INTAKE_FIELD_ALIASES.violationIssueType || [];
const DATE_ALIASES = INTAKE_FIELD_ALIASES.violationDate || [];

/**
 * Description-bearing labels that appear on the Type alias list.
 * Cap alias credit unless value shape is categorical (prevent Status/Violation
 * Description auto-win via exact alias alone).
 */
const TOXIC_TYPE_ALIASES = new Set([
  'violation description',
  'status description',
  'code description',
  'ordinance description',
  'case description',
  'nature of violation',
  'nature of call'
]);

const STATUS_ENUM_RE =
  /^(open|closed|yes|no|active|inactive|pending|complete|completed|new|resolved|unresolved|true|false)$/i;

const DEFAULTS = Object.freeze({
  sampleSize: 80,
  maxSamplesPerCol: 40,
  minScore: 45,
  minMargin: 8
});

// ---------------------------------------------------------------------------
// Sampling / stats helpers
// ---------------------------------------------------------------------------

function collectSamples(header, sampleRows, maxSamples) {
  const out = [];
  if (!header || !Array.isArray(sampleRows)) return out;
  for (const row of sampleRows) {
    if (out.length >= maxSamples) break;
    const raw = row && row[header];
    if (raw == null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    out.push(s);
  }
  return out;
}

function medianOf(nums) {
  if (!nums.length) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(nums, p) {
  if (!nums.length) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function isDateLike(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (TIMESTAMP_ONLY_RE.test(s)) return true;
  // ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  // US date with optional time already covered by TIMESTAMP_ONLY_RE mostly
  return false;
}

function isAddressLike(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return STREET_HINT_RE.test(s);
}

function isStatusEnumValue(value) {
  return STATUS_ENUM_RE.test(String(value || '').trim());
}

/**
 * Alias match tier for a normalized header.
 * @returns {{ tier: 0|1|2, exact: boolean, partial: boolean, toxic: boolean, matched: string|null }}
 */
function matchTypeAlias(normalized) {
  const result = {
    tier: 0,
    exact: false,
    partial: false,
    toxic: false,
    matched: null
  };
  if (!normalized) return result;

  const ordered = [...TYPE_ALIASES].sort((a, b) => b.length - a.length);

  for (const alias of ordered) {
    if (normalized === alias) {
      result.exact = true;
      result.tier = 2;
      result.matched = alias;
      result.toxic = TOXIC_TYPE_ALIASES.has(alias) || /\bdescription\b/i.test(alias);
      return result;
    }
  }

  for (const alias of ordered) {
    if (alias.length < 4) continue;
    if (alias === 'violation' || alias === 'type' || alias === 'code') continue;
    const hit =
      normalized.startsWith(`${alias} `) ||
      normalized.endsWith(` ${alias}`) ||
      normalized.includes(` ${alias} `);
    if (hit) {
      result.partial = true;
      result.tier = 1;
      result.matched = alias;
      result.toxic = TOXIC_TYPE_ALIASES.has(alias) || /\bdescription\b/i.test(alias);
      return result;
    }
  }

  // Header itself is a toxic description phrase even if only partial-ish
  if (TOXIC_TYPE_ALIASES.has(normalized) || /\bdescription\b/i.test(normalized)) {
    // Check if any type alias is a substring match the other direction
    for (const alias of ordered) {
      if (alias.length < 4) continue;
      if (normalized.includes(alias) || alias.includes(normalized)) {
        result.partial = true;
        result.tier = 1;
        result.matched = alias;
        result.toxic = true;
        return result;
      }
    }
  }

  return result;
}

function isDateHeader(normalized, original) {
  if (/\bdate\b/i.test(original || normalized)) return true;
  for (const alias of DATE_ALIASES) {
    if (normalized === alias) return true;
    if (alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized))) {
      return true;
    }
  }
  return false;
}

function isStatusHeader(original) {
  // Soft demote status-ish headers that lack strong type tokens
  if (!/\bstatus\b/i.test(original || '')) return false;
  if (/\b(type|category|cat|violation|issue|offense|charge)\b/i.test(original || '')) {
    // "status type" rare; still demote pure status description
    if (/\bdescription\b/i.test(original || '')) return true;
    return false;
  }
  return true;
}

/**
 * Whether sampled values look categorical (short, repeating-friendly, not prose/date/addr).
 */
function isCategoricalShape(stats) {
  if (!stats || stats.count === 0) return false;
  if (stats.medianLen > 40) return false;
  if (stats.dateFrac >= 0.3) return false;
  if (stats.addressFrac >= 0.3) return false;
  if (stats.longProseFrac >= 0.3) return false;
  if (stats.statusEnumFrac >= 0.6) return false;
  return true;
}

function computeValueStats(samples) {
  const count = samples.length;
  if (!count) {
    return {
      count: 0,
      medianLen: 0,
      p90Len: 0,
      dateFrac: 0,
      addressFrac: 0,
      distinctRatio: 0,
      unique: 0,
      statusEnumFrac: 0,
      timestampFrac: 0,
      longProseFrac: 0
    };
  }

  const lengths = samples.map((s) => s.length);
  const unique = new Set(samples.map((s) => s.toLowerCase())).size;
  let dateN = 0;
  let addressN = 0;
  let statusN = 0;
  let tsN = 0;
  let longN = 0;

  for (const s of samples) {
    if (isDateLike(s)) dateN += 1;
    if (isAddressLike(s)) addressN += 1;
    if (isStatusEnumValue(s)) statusN += 1;
    if (TIMESTAMP_ONLY_RE.test(s)) tsN += 1;
    if (s.length > 100) longN += 1;
  }

  return {
    count,
    medianLen: medianOf(lengths),
    p90Len: percentile(lengths, 0.9),
    dateFrac: dateN / count,
    addressFrac: addressN / count,
    distinctRatio: unique / count,
    unique,
    statusEnumFrac: statusN / count,
    timestampFrac: tsN / count,
    longProseFrac: longN / count
  };
}

// ---------------------------------------------------------------------------
// Feature scoring
// ---------------------------------------------------------------------------

/**
 * Header-only feature score.
 * @returns {{ score: number, reasons: string[], aliasTier: number, toxic: boolean }}
 */
function headerFeatureScore(header, opts = {}) {
  const reasons = [];
  let score = 0;
  const normalized = normalizeHeader(header);
  const claimed = opts.claimedHeaders;

  if (claimed && (claimed.has(header) || claimed.has(normalized))) {
    score -= 100;
    reasons.push('claimed_other_field:-100');
    return { score, reasons, aliasTier: 0, toxic: false, skip: true };
  }

  const alias = matchTypeAlias(normalized);
  let aliasTier = alias.tier;
  const categoricalUnlock = Boolean(opts.categoricalUnlock);

  if (alias.exact) {
    if (alias.toxic && !categoricalUnlock) {
      // Cap exact toxic description aliases at partial credit
      score += 22;
      reasons.push('toxic_exact_alias_capped:+22');
      aliasTier = 1;
    } else {
      score += 40;
      reasons.push(alias.toxic ? 'exact_alias_unlocked:+40' : 'exact_alias:+40');
      aliasTier = 2;
    }
  } else if (alias.partial) {
    if (alias.toxic && !categoricalUnlock) {
      score += 10;
      reasons.push('toxic_partial_alias_capped:+10');
      aliasTier = 1;
    } else {
      score += 22;
      reasons.push('partial_alias:+22');
      aliasTier = 1;
    }
  }

  if (isCategoryLikeHeader(header)) {
    score += 18;
    reasons.push('category_like_header:+18');
  }

  if (NARRATIVE_HEADER_RE.test(header)) {
    score -= 45;
    reasons.push('narrative_header:-45');
  }

  if (isDateHeader(normalized, header)) {
    score -= 35;
    reasons.push('date_header:-35');
  }

  if (isStatusHeader(header)) {
    score -= 25;
    reasons.push('status_header:-25');
  }

  return {
    score,
    reasons,
    aliasTier,
    toxic: alias.toxic,
    skip: false
  };
}

/**
 * Value-shape feature score from sample stats.
 * @returns {{ score: number, reasons: string[] }}
 */
function valueShapeScore(stats) {
  const reasons = [];
  let score = 0;

  if (!stats || stats.count === 0) {
    return { score: 0, reasons: ['no_samples:0'] };
  }

  // Median length bands
  if (stats.medianLen <= 40) {
    score += 18;
    reasons.push('median_len_short:+18');
  } else if (stats.medianLen <= 80) {
    score += 6;
    reasons.push('median_len_mid:+6');
  } else {
    score -= 25;
    reasons.push('median_len_long:-25');
  }

  if (stats.p90Len > 120) {
    score -= 20;
    reasons.push('p90_len_long:-20');
  }

  // Date-like
  if (stats.dateFrac >= 0.5) {
    score -= 40;
    reasons.push('date_like_frac_high:-40');
  } else if (stats.dateFrac <= 0.15) {
    score += 10;
    reasons.push('date_like_frac_low:+10');
  }

  // Address-like
  if (stats.addressFrac >= 0.4) {
    score -= 40;
    reasons.push('address_like_frac_high:-40');
  }

  // Distinct ratio — only demote near-unique free text when sample is large enough.
  // With 2–4 trap rows, two different categories yield ratio 1.0; that is still categorical.
  if (stats.count >= 6) {
    if (stats.distinctRatio >= 0.05 && stats.distinctRatio <= 0.55) {
      score += 16;
      reasons.push('distinct_ratio_categorical:+16');
    } else if (stats.distinctRatio > 0.85) {
      score -= 22;
      reasons.push('distinct_ratio_unique:-22');
    }
  } else if (stats.count >= 2 && stats.unique >= 1 && stats.unique <= Math.max(2, stats.count)) {
    // Small sample: short repeating-friendly vocab gets a mild categorical boost
    if (stats.medianLen <= 40 && stats.longProseFrac < 0.3) {
      score += 12;
      reasons.push('small_sample_categorical:+12');
    }
  }

  // Status enum demotion (Open/Closed/Yes/No)
  if (stats.statusEnumFrac >= 0.5 && stats.unique <= 8) {
    score -= 15;
    reasons.push('status_enum_values:-15');
  }

  if (stats.timestampFrac >= 0.5) {
    score -= 30;
    reasons.push('timestamp_only_frac:-30');
  }

  if (stats.longProseFrac >= 0.4) {
    score -= 25;
    reasons.push('long_prose_frac:-25');
  }

  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score every real header for Type candidacy.
 * @param {string[]} headers
 * @param {object[]} sampleRows
 * @param {object} [opts]
 * @returns {Array<{ header: string, score: number, reasons: string[], samples: string[], aliasTier: number }>}
 */
function scoreTypeColumns(headers, sampleRows, opts = {}) {
  const sampleSize = opts.sampleSize != null ? opts.sampleSize : DEFAULTS.sampleSize;
  const maxSamples = opts.maxSamplesPerCol != null ? opts.maxSamplesPerCol : DEFAULTS.maxSamplesPerCol;
  const rows = Array.isArray(sampleRows) ? sampleRows.slice(0, sampleSize) : [];
  const claimed = opts.claimedHeaders
    ? (opts.claimedHeaders instanceof Set
      ? opts.claimedHeaders
      : new Set(opts.claimedHeaders))
    : null;

  const ranked = [];
  const list = Array.isArray(headers) ? headers : [];

  list.forEach((header, index) => {
    if (header == null || header === '') return;
    if (header === '_meta') return;
    const h = String(header);
    if (!h.trim()) return;

    const samples = collectSamples(h, rows, maxSamples);
    const stats = computeValueStats(samples);
    const categorical = isCategoricalShape(stats);

    // First pass header with categorical unlock for toxic aliases when values support it
    const headerFeat = headerFeatureScore(h, {
      claimedHeaders: claimed,
      categoricalUnlock: categorical
    });

    const valueFeat = valueShapeScore(stats);
    const score = headerFeat.score + valueFeat.score;
    const reasons = headerFeat.reasons.concat(valueFeat.reasons);

    ranked.push({
      header: h,
      score,
      reasons,
      samples,
      aliasTier: headerFeat.aliasTier,
      _index: index
    });
  });

  // Sort desc by score; stable secondary = original header index
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a._index - b._index;
  });

  // Strip internal index from public shape (keep if useful for debug — drop for clean API)
  return ranked.map(({ header, score, reasons, samples, aliasTier }) => ({
    header,
    score,
    reasons,
    samples,
    aliasTier
  }));
}

/**
 * Pick a single Type column from ranked scores — never blend.
 * @param {Array<{ header: string, score: number, aliasTier?: number }>} ranked
 * @param {object} [opts]
 * @returns {{ header: string, score: number, reasons?: string[], samples?: string[], aliasTier?: number }|null}
 */
function pickTypeColumn(ranked, opts = {}) {
  const minScore = opts.minScore != null ? opts.minScore : DEFAULTS.minScore;
  const minMargin = opts.minMargin != null ? opts.minMargin : DEFAULTS.minMargin;

  if (!Array.isArray(ranked) || ranked.length === 0) return null;

  const top = ranked[0];
  if (!top || typeof top.score !== 'number' || top.score < minScore) return null;

  const second = ranked[1];
  if (second && second.score >= minScore) {
    const margin = top.score - second.score;
    if (margin < minMargin) {
      const tier1 = top.aliasTier != null ? top.aliasTier : 0;
      const tier2 = second.aliasTier != null ? second.aliasTier : 0;
      if (tier1 > tier2) {
        // Prefer stronger header-alias tier
        return top;
      }
      // Ambiguous near-tie without better alias tier → unresolved
      return null;
    }
  }

  return top;
}

/**
 * Compose score + pick into a resolution result.
 * @param {string[]} headers
 * @param {object[]} sampleRows
 * @param {object} [opts]
 * @returns {{ header: string|null, score: number|null, ranked: Array, source: 'scorer'|'unresolved' }}
 */
function resolveTypeColumnHeader(headers, sampleRows, opts = {}) {
  const ranked = scoreTypeColumns(headers, sampleRows, opts);
  const picked = pickTypeColumn(ranked, opts);
  return {
    header: picked ? picked.header : null,
    score: picked ? picked.score : null,
    ranked,
    source: picked ? 'scorer' : 'unresolved'
  };
}

module.exports = {
  scoreTypeColumns,
  pickTypeColumn,
  resolveTypeColumnHeader,
  DEFAULTS,
  // pure helpers for tests/debug
  headerFeatureScore,
  valueShapeScore,
  matchTypeAlias,
  computeValueStats,
  isCategoricalShape,
  TOXIC_TYPE_ALIASES
};
