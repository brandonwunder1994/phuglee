const {
  detectIntakeColumnMap,
  findColumn,
  INTAKE_FIELD_ALIASES,
  buildNormalizedRow,
  mapRawRow
} = require('../bridge-intake-schema');
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
    const tags = tagRow(mapped, context.uploadType);
    const rowMeta = rawRow._meta || {};
    const confidenceLevel = rowMeta.confidenceLevel || defaultConfidence;
    const needsReview = Boolean(rowMeta.needsReview) || confidenceLevel === 'low';

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