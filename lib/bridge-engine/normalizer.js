const {
  detectIntakeColumnMap,
  findColumn,
  INTAKE_FIELD_ALIASES,
  buildNormalizedRow,
  mapRawRow
} = require('../bridge-intake-schema');
const { promoteCategoryFromRaw } = require('../bridge-category-promote');
const { tagRow } = require('../bridge-distress-tagger');
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

function normalizeRawRows(rawRows, headers, context) {
  const columnMap = enhanceColumnMap(headers);
  const kept = [];
  const discarded = [];
  const defaultConfidence = assessConfidence(columnMap);

  for (const rawRow of rawRows) {
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
    // MAP: promote real category when type still empty (all rows, not distress-gated)
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
  normalizeRawRows
};