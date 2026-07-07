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

function assessConfidence(columnMap) {
  if (columnMap.streetAddress) return 'high';
  return 'medium';
}

module.exports = {
  rawPreview,
  validateMappedRow,
  validateRawRow,
  assessConfidence,
  hasUsableStreetAddress,
  DISCARD_REASONS
};