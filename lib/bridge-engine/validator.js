const {
  classifyDiscardReason,
  hasUsableStreetAddress,
  DISCARD_REASONS
} = require('../bridge-intake-schema');

function rawPreview(rawRow, columnMap, limit = 120) {
  const streetHeader = columnMap.streetAddress;
  const parts = [];
  if (streetHeader && rawRow[streetHeader]) parts.push(String(rawRow[streetHeader]));
  for (const value of Object.values(rawRow)) {
    const text = String(value || '').trim();
    if (text && !parts.includes(text)) parts.push(text);
    if (parts.join(' | ').length >= limit) break;
  }
  const preview = parts.join(' | ').slice(0, limit);
  return preview || '(empty row)';
}

function validateMappedRow(mapped) {
  const reason = classifyDiscardReason({}, mapped);
  if (!reason) return { keep: true };
  return { keep: false, reason };
}

function validateRawRow(rawRow, columnMap) {
  const mapped = {};
  for (const key of Object.keys(columnMap)) {
    const header = columnMap[key];
    mapped[key] = header ? String(rawRow[header] ?? '').trim() : '';
  }

  const result = validateMappedRow(mapped);
  if (!result.keep) {
    return {
      keep: false,
      reason: result.reason,
      mapped,
      rawPreview: rawPreview(rawRow, columnMap)
    };
  }

  return { keep: true, mapped };
}

/**
 * Normalize OCR word confidence to 0–100 percent.
 * Pipeline uses 0–100; accept 0–1 fractions (e.g. 0.72 → 72).
 * Matches DATA-STANDARDS thresholds used by row-extract.scoreFromOcr.
 */
function toOcrPercent(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 0 && score <= 1) return score * 100;
  return score;
}

/**
 * Map OCR word confidence → high / medium / low (DATA-STANDARDS).
 * @returns {{ confidenceLevel: string, needsReview: boolean }|null}
 */
function scoreFromOcrConfidence(ocrScore) {
  const pct = toOcrPercent(ocrScore);
  if (pct == null) return null;
  if (pct >= 85) return { confidenceLevel: 'high', needsReview: false };
  if (pct >= 60) return { confidenceLevel: 'medium', needsReview: false };
  return { confidenceLevel: 'low', needsReview: true };
}

/**
 * Default row confidence from column map + optional OCR origin signals.
 * A matched street column alone must NOT override low/medium OCR scores
 * (family→xlsx rebuild creates street columns after OCR).
 *
 * @param {object} columnMap
 * @param {{ ocrConfidence?: number|null, fromOcr?: boolean }} [options]
 */
function assessConfidence(columnMap, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const ocr = scoreFromOcrConfidence(opts.ocrConfidence);
  if (ocr) return ocr.confidenceLevel;
  // OCR origin without a numeric score → medium (never invent high)
  if (opts.fromOcr) return 'medium';
  if (columnMap && columnMap.streetAddress) return 'high';
  return 'medium';
}

module.exports = {
  rawPreview,
  validateMappedRow,
  validateRawRow,
  assessConfidence,
  scoreFromOcrConfidence,
  toOcrPercent,
  hasUsableStreetAddress,
  DISCARD_REASONS
};
