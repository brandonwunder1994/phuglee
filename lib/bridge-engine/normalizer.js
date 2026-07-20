const {
  detectIntakeColumnMap,
  findColumn,
  INTAKE_FIELD_ALIASES,
  buildNormalizedRow,
  mapRawRow,
  DISCARD_REASONS,
  hasUsableStreetAddress
} = require('../bridge-intake-schema');
const { promoteCategoryFromRaw } = require('../bridge-category-promote');
const { resolveTypeColumnHeader } = require('../bridge-type-column-score');
const { tagRow, buildSearchText, isNonResidentialLead } = require('../bridge-distress-tagger');
const { validateRawRow, assessConfidence } = require('./validator');

function enhanceColumnMap(headers) {
  const map = detectIntakeColumnMap(headers);
  if (!map.streetAddress) {
    const fallback = findColumn(headers, [
      'site', 'location address', 'prop', 'parcel', 'civic address', 'house'
    ]);
    if (fallback) map.streetAddress = fallback;
  }
  return map;
}

function injectCityState(mapped, city, state) {
  return {
    ...mapped,
    city: mapped.city || city || '',
    state: mapped.state || state || ''
  };
}

/**
 * Force Type column from value-aware scorer (COL-01/02/04).
 * Always overwrites alias-first violationIssueType — including null when unresolved.
 * Promote still fills empty cells only after mapRawRow.
 */
function forceTypeColumnFromScorer(columnMap, headers, rawRows) {
  const sampleRows = (rawRows || []).slice(0, 80);
  const claimed = new Set(
    [
      columnMap.streetAddress,
      columnMap.city,
      columnMap.state,
      columnMap.zip,
      columnMap.violationDate
    ].filter(Boolean)
  );
  const typeRes = resolveTypeColumnHeader(headers, sampleRows, {
    claimedHeaders: claimed
  });
  // COL-04: always force — never keep alias-first Type when scorer abstains
  columnMap.violationIssueType = typeRes.header;
  return typeRes;
}

/**
 * Force Type column from override or live scorer.
 * - string → force that header (must ∈ headers else INVALID_TYPE_COLUMN)
 * - null → force no Type column (admin "No type column")
 * - undefined → Phase 51 live scorer force
 */
function forceTypeColumn(columnMap, headers, rawRows, override) {
  if (override !== undefined) {
    if (override === null) {
      columnMap.violationIssueType = null;
      return { header: null, score: null, ranked: [], source: 'override' };
    }
    const header = String(override);
    const list = Array.isArray(headers) ? headers : [];
    if (!list.includes(header)) {
      const err = new Error(`Confirmed Type header not found in file: ${header}`);
      err.code = 'INVALID_TYPE_COLUMN';
      throw err;
    }
    columnMap.violationIssueType = header;
    return { header, score: null, ranked: [], source: 'override' };
  }
  return forceTypeColumnFromScorer(columnMap, headers, rawRows);
}

function normalizeRawRows(rawRows, headers, context) {
  const columnMap = enhanceColumnMap(headers);
  // COL: override (confirm/reuse) or scorer single-winner Type — aliases alone cannot poison process
  const typeOverride = context && Object.prototype.hasOwnProperty.call(context, 'typeColumnOverride')
    ? context.typeColumnOverride
    : undefined;
  forceTypeColumn(columnMap, headers, rawRows, typeOverride);
  const kept = [];
  const discarded = [];
  const defaultConfidence = assessConfidence(columnMap, {
    ocrConfidence: context && context.ocrConfidence != null ? context.ocrConfidence : null,
    fromOcr: Boolean(context && context.fromOcr)
  });

  for (const rawRow of rawRows) {
    // Document parsers (PDF) often put the street in a non-address column.
    // Promote house-number / lot patterns only (not case IDs like CV-1001).
    const streetFromCells = () => {
      for (const [key, val] of Object.entries(rawRow || {})) {
        if (key === '_meta') continue;
        const text = String(val ?? '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const m = text.match(/\b(\d{1,6}\s+[A-Za-z0-9#./'\-]+(?:\s+[A-Za-z0-9#./'\-]+){0,6})\b/);
        if (m && hasUsableStreetAddress(m[1])) return { key, value: m[1].trim() };
        if (
          hasUsableStreetAddress(text) &&
          /\d{1,6}\s+[A-Za-z#]/.test(text) &&
          !/^(cv|case|inv|ref|id|permit)[-#\s]/i.test(text)
        ) {
          return { key, value: text };
        }
      }
      return null;
    };

    if (columnMap.streetAddress) {
      const current = String(rawRow[columnMap.streetAddress] ?? '').trim();
      if (!current || !hasUsableStreetAddress(current)) {
        const hit = streetFromCells();
        if (hit) rawRow[columnMap.streetAddress] = hit.value;
      }
    } else {
      const hit = streetFromCells();
      if (hit) columnMap.streetAddress = hit.key;
    }

    const validation = validateRawRow(rawRow, columnMap);
    if (!validation.keep) {
      discarded.push({
        reason: validation.reason,
        rawPreview: validation.rawPreview
      });
      continue;
    }

    const mapped = injectCityState(
      mapRawRow(rawRow, columnMap),
      context.city.city,
      context.city.state
    );
    // MAP / COL-03: promote real category only when mapped Type cell is empty
    // (scorer-mapped non-empty cells are never overridden)
    if (!String(mapped.violationIssueType || '').trim()) {
      const promoted = promoteCategoryFromRaw(rawRow, headers, columnMap, mapped);
      if (promoted) mapped.violationIssueType = promoted;
    }
    // Pass raw row so distress keywords in unmapped columns still match
    // (e.g. "Ordinance Description", "Case Notes", "Nature of Violation").
    const tags = tagRow(mapped, context.uploadType, rawRow);
    const rowMeta = rawRow._meta || {};
    const confidenceLevel = rowMeta.confidenceLevel || defaultConfidence;
    const needsReview = Boolean(rowMeta.needsReview) || confidenceLevel === 'low';

    // Code violations on apartments / commercial / highway ROW — drop entirely
    // (not single-family or vacant lots). Water shut-off still passes through.
    if (
      context.uploadType === 'code_violation' &&
      (tags.nonResidential || isNonResidentialLead(buildSearchText(mapped, rawRow)))
    ) {
      discarded.push({
        reason: DISCARD_REASONS.non_property,
        rawPreview: mapped.streetAddress || mapped.violationIssueType || mapped.descriptionNotes || ''
      });
      continue;
    }

    // Prefer filling empty mapped issue/notes from any raw text that matched distress,
    // so saved exports still show why the row was kept.
    if (!mapped.violationIssueType && !mapped.descriptionNotes && tags.matchedIndicators?.length) {
      const rawBits = Object.entries(rawRow || {})
        .filter(([k, v]) => k !== '_meta' && v != null && typeof v !== 'object' && String(v).trim())
        .map(([, v]) => String(v).trim());
      if (rawBits.length) {
        mapped.descriptionNotes = rawBits.slice(0, 4).join(' | ').slice(0, 500);
      }
    }

    kept.push(buildNormalizedRow(mapped, {
      city: context.city.city,
      state: context.city.state,
      uploadType: context.uploadType,
      sourceFile: context.sourceFile,
      processedAt: context.processedAt,
      distressedSignalTag: tags.distressedSignalTag,
      matchedIndicators: tags.matchedIndicators,
      category: tags.category || '',
      confidenceLevel,
      needsReview
    }));
  }

  return {
    columnMap,
    kept,
    discarded
  };
}

module.exports = {
  enhanceColumnMap,
  injectCityState,
  forceTypeColumn,
  forceTypeColumnFromScorer,
  normalizeRawRows
};