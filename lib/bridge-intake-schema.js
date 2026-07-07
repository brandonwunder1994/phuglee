/**
 * Data Bridge v2 — normalized intake schema, upload types, and validation.
 */

const UPLOAD_TYPES = Object.freeze({
  code_violation: {
    id: 'code_violation',
    label: 'Code Violation',
    defaultTag: 'Standard Code Violation',
    retainClosedRecords: true
  },
  water_shut_off: {
    id: 'water_shut_off',
    label: 'Water Shut Off',
    defaultTag: 'Water Shut Off – High Value Distress Signal',
    retainClosedRecords: true
  }
});

const UPLOAD_TYPE_IDS = Object.freeze(Object.keys(UPLOAD_TYPES));

const NORMALIZED_COLUMNS = Object.freeze({
  streetAddress: { key: 'streetAddress', label: 'Street Address', exportLabel: 'Street Address' },
  city: { key: 'city', label: 'City', exportLabel: 'City' },
  state: { key: 'state', label: 'State', exportLabel: 'State' },
  zip: { key: 'zip', label: 'Zip', exportLabel: 'Zip' },
  violationIssueType: { key: 'violationIssueType', label: 'Violation/Issue Type', exportLabel: 'Violation/Issue Type' },
  violationDate: { key: 'violationDate', label: 'Violation Date', exportLabel: 'Violation Date' },
  descriptionNotes: { key: 'descriptionNotes', label: 'Description/Notes', exportLabel: 'Description/Notes' },
  distressedSignalTag: { key: 'distressedSignalTag', label: 'Distressed Signal Tag', exportLabel: 'Distressed Signal Tag' },
  matchedIndicators: { key: 'matchedIndicators', label: 'Matched Indicators', exportLabel: 'Matched Indicators' },
  confidenceLevel: { key: 'confidenceLevel', label: 'Confidence Level', exportLabel: 'Confidence Level' },
  sourceFile: { key: 'sourceFile', label: 'Source File', exportLabel: 'Source File' },
  uploadType: { key: 'uploadType', label: 'Upload Type', exportLabel: 'Upload Type' },
  processedAt: { key: 'processedAt', label: 'Processed At', exportLabel: 'Processed At' }
});

const COLUMN_KEYS = Object.freeze(Object.keys(NORMALIZED_COLUMNS));

const EXPORT_COLUMN_ORDER = Object.freeze(
  COLUMN_KEYS.map((key) => NORMALIZED_COLUMNS[key].exportLabel)
);

const INTAKE_FIELD_ALIASES = Object.freeze({
  streetAddress: [
    'street address', 'street', 'address', 'property address', 'site address',
    'service address', 'location', 'prop addr', 'parcel address', 'violation address',
    'property location', 'civic address'
  ],
  city: ['city', 'property city', 'mail city', 'municipality'],
  state: ['state', 'st', 'property state'],
  zip: ['zip', 'zip code', 'postal code', 'postal', 'zipcode'],
  violationIssueType: [
    'violation type', 'violation', 'issue type', 'code', 'violation code',
    'violation description', 'type', 'category', 'offense', 'charge'
  ],
  violationDate: [
    'violation date', 'date', 'issue date', 'notice date', 'citation date',
    'opened date', 'created date', 'date issued', 'inspection date'
  ],
  descriptionNotes: [
    'description', 'notes', 'comments', 'detail', 'violation details',
    'remarks', 'narrative', 'summary', 'status notes'
  ]
});

const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);

const DISCARD_REASONS = Object.freeze({
  no_address: 'No usable street address',
  blank_row: 'Blank or empty row',
  non_property: 'Clearly non-property record',
  duplicate: 'Near-duplicate within upload',
  already_imported: 'Already imported in Property Analyzer',
  parse_error: 'Could not parse row'
});

const ACCEPTED_EXTENSIONS = Object.freeze([
  '.xlsx', '.xls', '.xlsm', '.csv', '.tsv', '.txt',
  '.pdf', '.docx',
  '.jpg', '.jpeg', '.png'
]);

const ACCEPTED_MIME_PREFIXES = Object.freeze([
  'application/vnd.',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'text/',
  'image/jpeg',
  'image/png'
]);

const STREET_HINT_RE = /\d+\s+\w|^\s*\d{1,6}\s+[\w#./-]+/i;
const NON_PROPERTY_RE = /\b(city hall|municipal building|parking lot|public park|county office|department of)\b/i;

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers, aliases, used = new Set()) {
  const normalized = headers
    .map((h) => ({ original: h, lower: normalizeHeader(h) }))
    .filter((h) => h.original && !used.has(h.original));

  for (const alias of aliases) {
    const match = normalized.find((h) => h.lower === alias);
    if (match) return match.original;
  }

  for (const alias of aliases) {
    if (alias.length < 3) continue;
    const match = normalized.find((h) => {
      if (h.lower === alias) return true;
      if (h.lower.startsWith(`${alias} `) || h.lower.endsWith(` ${alias}`)) return true;
      if (h.lower.includes(` ${alias} `)) return true;
      return false;
    });
    if (match) return match.original;
  }

  return null;
}

function detectIntakeColumnMap(headers) {
  const map = {};
  const used = new Set();
  for (const key of Object.keys(INTAKE_FIELD_ALIASES)) {
    const col = findColumn(headers, INTAKE_FIELD_ALIASES[key], used);
    if (col) used.add(col);
    map[key] = col;
  }
  return map;
}

function isAcceptedFile(filename) {
  const ext = String(filename || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function isSpreadsheetFile(filename) {
  return /\.(xlsx|xls|xlsm|csv|tsv)$/i.test(String(filename || ''));
}

function validateUploadType(uploadType) {
  const id = String(uploadType || '').trim();
  if (!UPLOAD_TYPE_IDS.includes(id)) {
    throw new Error(`Invalid upload type. Expected one of: ${UPLOAD_TYPE_IDS.join(', ')}`);
  }
  return id;
}

function hasUsableStreetAddress(street) {
  const value = String(street || '').trim();
  if (!value) return false;
  if (value.length < 4) return false;
  if (!/\d/.test(value) && !/\b(lot|parcel|unit|apt|suite|#)\b/i.test(value)) return false;
  return STREET_HINT_RE.test(value) || /\d{1,6}/.test(value);
}

function classifyDiscardReason(rawRow, mapped) {
  const street = String(mapped?.streetAddress || '').trim();
  const hasAnyField = Object.values(mapped || {}).some((v) => String(v || '').trim());
  if (!hasAnyField) return DISCARD_REASONS.blank_row;
  if (NON_PROPERTY_RE.test(street)) return DISCARD_REASONS.non_property;
  if (!hasUsableStreetAddress(street)) return DISCARD_REASONS.no_address;
  return null;
}

function mapRawRow(rawRow, columnMap) {
  const mapped = {};
  for (const key of Object.keys(INTAKE_FIELD_ALIASES)) {
    const header = columnMap[key];
    mapped[key] = header ? String(rawRow[header] ?? '').trim() : '';
  }
  return mapped;
}

function buildNormalizedRow(mapped, context) {
  const {
    city,
    state,
    uploadType,
    sourceFile,
    processedAt,
    distressedSignalTag,
    matchedIndicators,
    confidenceLevel
  } = context;

  const row = {};
  for (const key of COLUMN_KEYS) {
    row[NORMALIZED_COLUMNS[key].key] = '';
  }

  row.streetAddress = mapped.streetAddress || '';
  row.city = mapped.city || city || '';
  row.state = mapped.state || state || '';
  row.zip = mapped.zip || '';
  row.violationIssueType = mapped.violationIssueType || '';
  row.violationDate = mapped.violationDate || '';
  row.descriptionNotes = mapped.descriptionNotes || '';
  row.distressedSignalTag = distressedSignalTag || UPLOAD_TYPES[uploadType]?.defaultTag || '';
  row.matchedIndicators = Array.isArray(matchedIndicators)
    ? matchedIndicators.join('; ')
    : String(matchedIndicators || '');
  row.confidenceLevel = CONFIDENCE_LEVELS.includes(confidenceLevel) ? confidenceLevel : 'high';
  row.needsReview = Boolean(context.needsReview) || row.confidenceLevel === 'low';
  row.sourceFile = sourceFile || '';
  row.uploadType = uploadType || '';
  row.processedAt = processedAt || new Date().toISOString();

  return row;
}

function toExportRow(row) {
  const out = {};
  for (const key of COLUMN_KEYS) {
    out[NORMALIZED_COLUMNS[key].exportLabel] = row[key] ?? '';
  }
  return out;
}

function emptyProcessingStats() {
  return {
    totalParsed: 0,
    kept: 0,
    discarded: 0,
    deduplicated: 0,
    alreadyImported: 0,
    lowConfidence: 0,
    needsReview: 0,
    discardReasons: {},
    tagBreakdown: {},
    confidenceBreakdown: { high: 0, medium: 0, low: 0 }
  };
}

function incrementDiscardReason(stats, reason) {
  stats.discarded += 1;
  stats.discardReasons[reason] = (stats.discardReasons[reason] || 0) + 1;
}

function incrementTag(stats, tag) {
  stats.tagBreakdown[tag] = (stats.tagBreakdown[tag] || 0) + 1;
}

function incrementConfidence(stats, level) {
  const key = CONFIDENCE_LEVELS.includes(level) ? level : 'high';
  stats.confidenceBreakdown[key] = (stats.confidenceBreakdown[key] || 0) + 1;
}

module.exports = {
  UPLOAD_TYPES,
  UPLOAD_TYPE_IDS,
  NORMALIZED_COLUMNS,
  COLUMN_KEYS,
  EXPORT_COLUMN_ORDER,
  INTAKE_FIELD_ALIASES,
  CONFIDENCE_LEVELS,
  DISCARD_REASONS,
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_PREFIXES,
  normalizeHeader,
  findColumn,
  detectIntakeColumnMap,
  isAcceptedFile,
  isSpreadsheetFile,
  validateUploadType,
  hasUsableStreetAddress,
  classifyDiscardReason,
  mapRawRow,
  buildNormalizedRow,
  toExportRow,
  emptyProcessingStats,
  incrementDiscardReason,
  incrementTag,
  incrementConfidence
};