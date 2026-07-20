/**
 * Data Bridge v2 — normalized intake schema, upload types, and validation.
 */

const UPLOAD_TYPES = Object.freeze({
  code_violation: {
    id: 'code_violation',
    label: 'Code Violation',
    defaultTag: 'Standard Code Violation',
    retainClosedRecords: true,
    /** Run Superpower Brain + phrase distress keep/kill */
    usesDistressPhraseFilter: true,
    analyzeLeadType: 'code_violation'
  },
  pre_lien: {
    id: 'pre_lien',
    label: 'Pre-lien',
    defaultTag: 'Pre-lien – Civil / Small Claims Complaint',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'pre_lien'
  },
  tax_delinquent: {
    id: 'tax_delinquent',
    label: 'Tax Delinquent',
    defaultTag: 'Tax Delinquent – High Value Distress Signal',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'tax_lien'
  },
  lis_pendens: {
    id: 'lis_pendens',
    label: 'Pre-foreclosure (LP / NOD)',
    defaultTag: 'Pre-foreclosure – LP / NOD / NOS',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'pre_foreclosure'
  },
  probate: {
    id: 'probate',
    label: 'Probate / Estate',
    defaultTag: 'Probate – Estate Filing',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'probate'
  },
  fire: {
    id: 'fire',
    label: 'Fire-damaged',
    defaultTag: 'Fire Damage – High Value Distress Signal',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'fire'
  },
  water_shut_off: {
    id: 'water_shut_off',
    label: 'Water Shut Off',
    defaultTag: 'Water Shut Off – High Value Distress Signal',
    retainClosedRecords: true,
    usesDistressPhraseFilter: false,
    analyzeLeadType: 'water_shut_off'
  }
});

const UPLOAD_TYPE_IDS = Object.freeze(Object.keys(UPLOAD_TYPES));

/** True when Filter should run phrase/brain keep-kill (code lists only). */
function usesDistressPhraseFilter(uploadType) {
  const type = UPLOAD_TYPES[String(uploadType || '').trim()];
  return !!(type && type.usesDistressPhraseFilter);
}

function uploadTypeLabel(uploadType) {
  const type = UPLOAD_TYPES[String(uploadType || '').trim()];
  return type ? type.label : String(uploadType || '').replace(/_/g, ' ');
}

const NORMALIZED_COLUMNS = Object.freeze({
  streetAddress: { key: 'streetAddress', label: 'Street Address', exportLabel: 'Street Address' },
  city: { key: 'city', label: 'City', exportLabel: 'City' },
  state: { key: 'state', label: 'State', exportLabel: 'State' },
  zip: { key: 'zip', label: 'Zip', exportLabel: 'Zip' },
  violationIssueType: { key: 'violationIssueType', label: 'Violation/Issue Type', exportLabel: 'Violation/Issue Type' },
  violationDate: { key: 'violationDate', label: 'Violation Date', exportLabel: 'Violation Date' },
  descriptionNotes: { key: 'descriptionNotes', label: 'Description/Notes', exportLabel: 'Description/Notes' },
  category: { key: 'category', label: 'Category', exportLabel: 'Category' },
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
    'property location', 'civic address', 'full address', 'situs address',
    'location address', 'premises address', 'house address', 'addr',
    // Lawrenceville / CEU code-cases exports
    'main address',
    // E-Gov PIR: prefer full street; Issue Street Name alone also maps when no better
    'issue street name', 'issue street', 'street name'
  ],
  city: ['city', 'property city', 'mail city', 'municipality', 'situs city'],
  state: ['state', 'st', 'property state', 'situs state'],
  zip: ['zip', 'zip code', 'postal code', 'postal', 'zipcode', 'situs zip'],
  violationIssueType: [
    'violation issue type', 'violation/issue type', 'violation type',
    'issue type', 'violation code', 'violation description',
    'category', 'offense', 'charge', 'code description',
    'case type', 'case description', 'ordinance', 'ordinance description',
    'infraction', 'complaint type', 'nature of violation', 'nature of call',
    'problem', 'problem type', 'code case type', 'violation subtype',
    'code type', 'enforcement type', 'condition', 'status description',
    // Common city sheet shortcuts / Crystal Reports labels
    'vio cat', 'vio type', 'violation category', 'code category',
    'case category', 'work type', 'call type', 'violation name',
    'enforcement category', 'nuisance type', 'complaint category',
    'code violation type', 'violation class', 'issue category',
    // E-Gov / SeeClickFix PIR exports
    'action form name', 'action form', 'form name', 'form type',
    'request type', 'service request type', 'sr type',
    // Tax / probate / court / pre-foreclosure sheets
    'document type', 'doc type', 'instrument type', 'filing type',
    'cause of action', 'plaintiff', 'defendant', 'estate type',
    'years delinquent', 'delinquency status', 'sale type'
  ],
  violationDate: [
    'violation date', 'date', 'issue date', 'notice date', 'citation date',
    'opened date', 'created date', 'date issued', 'inspection date',
    'case date', 'reported date', 'open date', 'date submitted', 'submitted date'
  ],
  descriptionNotes: [
    'description', 'notes', 'comments', 'detail', 'violation details',
    'remarks', 'narrative', 'summary', 'status notes',
    'description/notes', 'description notes', 'desc notes',
    'case notes', 'work description', 'inspector notes', 'memo',
    'observation', 'findings', 'details', 'long description', 'full description',
    'complaint', 'complaint description', 'public comments',
    'form values', 'form value', 'public narrative'
  ]
});

const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);

const DISCARD_REASONS = Object.freeze({
  no_address: 'No usable street address',
  blank_row: 'Blank or empty row',
  non_property: 'Clearly non-property record',
  duplicate: 'Near-duplicate within upload',
  already_imported: 'Already imported in Analyze',
  no_distress_signal: 'No distressed signal (generic code violation)',
  parse_error: 'Could not parse row'
});

const ACCEPTED_EXTENSIONS = Object.freeze([
  '.xlsx', '.xls', '.xlsm', '.csv', '.tsv', '.txt',
  '.pdf', '.docx',
  // Clerk photo / scan formats (OCR path)
  '.jpg', '.jpeg', '.png',
  '.webp', '.gif', '.tif', '.tiff', '.bmp',
  // Accepted for intake; image-ocr returns convert-to-JPG/PNG if no HEIC decoder
  '.heic', '.heif'
]);

const ACCEPTED_MIME_PREFIXES = Object.freeze([
  'application/vnd.',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'text/',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'image/x-ms-bmp',
  'image/heic',
  'image/heif'
]);

const STREET_HINT_RE = /\d+\s+\w|^\s*\d{1,6}\s+[\w#./-]+/i;
/** Address-only non-property (lots / houses stay). Full text non-res is in distress-tagger. */
const NON_PROPERTY_RE = /\b(city hall|municipal building|parking lot|parking garage|public park|county office|department of|shopping (center|mall)|strip mall|apartment complex|office building|warehouse|gas station)\b/i;

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[/\\|]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findColumn(headers, aliases, used = new Set()) {
  const normalized = headers
    .map((h) => ({ original: h, lower: normalizeHeader(h) }))
    .filter((h) => h.original && !used.has(h.original));

  // Prefer longer aliases first so "violation type" beats bare "violation"
  const orderedAliases = [...aliases].sort((a, b) => b.length - a.length);

  for (const alias of orderedAliases) {
    const match = normalized.find((h) => h.lower === alias);
    if (match) return match.original;
  }

  for (const alias of orderedAliases) {
    if (alias.length < 4) continue;
    // Do not let generic "violation" steal "violation date" / "violation status"
    if (alias === 'violation' || alias === 'type' || alias === 'code') continue;
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
  // Date before issue type so "Violation Date" is not claimed as issue type
  const fieldOrder = [
    'streetAddress',
    'city',
    'state',
    'zip',
    'violationDate',
    'violationIssueType',
    'descriptionNotes'
  ];
  for (const key of fieldOrder) {
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
    category,
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
  row.category = category || '';
  row.distressedSignalTag = distressedSignalTag || UPLOAD_TYPES[uploadType]?.defaultTag || '';
  row.matchedIndicators = Array.isArray(matchedIndicators)
    ? matchedIndicators.slice()
    : (matchedIndicators ? [String(matchedIndicators)] : []);
  row.confidenceLevel = CONFIDENCE_LEVELS.includes(confidenceLevel) ? confidenceLevel : 'high';
  row.needsReview = Boolean(context.needsReview) || row.confidenceLevel === 'low';
  row.sourceFile = sourceFile || '';
  row.uploadType = uploadType || '';
  row.processedAt = processedAt || new Date().toISOString();

  return row;
}

function formatMatchedIndicatorsForExport(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('; ');
  return String(value || '');
}

function toExportRow(row) {
  const out = {};
  for (const key of COLUMN_KEYS) {
    out[NORMALIZED_COLUMNS[key].exportLabel] =
      key === 'matchedIndicators'
        ? formatMatchedIndicatorsForExport(row[key])
        : (row[key] ?? '');
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
    noDistress: 0,
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
  usesDistressPhraseFilter,
  uploadTypeLabel,
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
  formatMatchedIndicatorsForExport,
  toExportRow,
  emptyProcessingStats,
  incrementDiscardReason,
  incrementTag,
  incrementConfidence
};