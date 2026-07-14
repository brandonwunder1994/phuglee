/**
 * Type-column keep preview — estimate Strong Distressed keep rate from a
 * single candidate column's values (isolates Type choice for the confirm UI).
 */

const {
  collectMatches,
  isNonResidentialLead
} = require('./bridge-distress-tagger');

const DEFAULT_SAMPLE = 40;

/**
 * @param {string} header
 * @param {object[]} rows
 * @param {object} [opts]
 * @returns {{ strongDistressed: number, discarded: number, sampleSize: number, nonProperty: number }}
 */
function previewKeepForTypeColumn(header, rows, opts = {}) {
  const limit = opts.sampleSize != null ? opts.sampleSize : DEFAULT_SAMPLE;
  const h = String(header || '');
  let strongDistressed = 0;
  let discarded = 0;
  let nonProperty = 0;
  let sampleSize = 0;

  if (!h || !Array.isArray(rows)) {
    return { strongDistressed: 0, discarded: 0, sampleSize: 0, nonProperty: 0 };
  }

  for (const row of rows) {
    if (sampleSize >= limit) break;
    if (!row || typeof row !== 'object') continue;
    const text = String(row[h] ?? '').trim();
    if (!text) continue;
    sampleSize += 1;

    if (isNonResidentialLead(text)) {
      nonProperty += 1;
      discarded += 1;
      continue;
    }

    const matches = collectMatches(text);
    if (matches.length) {
      strongDistressed += 1;
    } else {
      discarded += 1;
    }
  }

  return { strongDistressed, discarded, sampleSize, nonProperty };
}

/**
 * Attach keepPreview to ranked Type candidates (mutates shallow copies).
 * @param {Array<{ header: string, samples?: string[] }>} ranked
 * @param {object[]} rows
 * @param {object} [opts]
 */
function enrichCandidatesWithKeepPreview(ranked, rows, opts = {}) {
  const limit = opts.candidateLimit != null ? opts.candidateLimit : 8;
  return (ranked || []).slice(0, limit).map((c) => {
    const header = c && c.header != null ? String(c.header) : '';
    const keepPreview = previewKeepForTypeColumn(header, rows, opts);
    return {
      header,
      score: typeof c.score === 'number' ? c.score : null,
      samples: Array.isArray(c.samples) ? c.samples.slice(0, 5) : [],
      reasons: Array.isArray(c.reasons) ? c.reasons : [],
      keepPreview
    };
  });
}

module.exports = {
  previewKeepForTypeColumn,
  enrichCandidatesWithKeepPreview,
  DEFAULT_SAMPLE
};
