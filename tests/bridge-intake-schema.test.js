const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectIntakeColumnMap,
  validateUploadType,
  hasUsableStreetAddress,
  classifyDiscardReason,
  mapRawRow,
  buildNormalizedRow,
  toExportRow,
  isAcceptedFile,
  emptyProcessingStats,
  incrementDiscardReason,
  UPLOAD_TYPE_IDS
} = require('../lib/bridge-intake-schema');

test('detects violation-specific column headers', () => {
  const headers = [
    'Property Address', 'Violation Type', 'Violation Date', 'Description', 'ZIP'
  ];
  const map = detectIntakeColumnMap(headers);
  assert.equal(map.streetAddress, 'Property Address');
  assert.equal(map.violationIssueType, 'Violation Type');
  assert.equal(map.violationDate, 'Violation Date');
  assert.equal(map.descriptionNotes, 'Description');
  assert.equal(map.zip, 'ZIP');
});

test('validates upload types', () => {
  assert.equal(validateUploadType('code_violation'), 'code_violation');
  assert.equal(validateUploadType('water_shut_off'), 'water_shut_off');
  assert.equal(validateUploadType('probate'), 'probate');
  assert.throws(() => validateUploadType('not_a_real_type'), /Invalid upload type/);
});

test('usable address heuristic keeps property rows', () => {
  assert.equal(hasUsableStreetAddress('123 Main St'), true);
  assert.equal(hasUsableStreetAddress('Lot 14 Oak Ave'), true);
  assert.equal(hasUsableStreetAddress(''), false);
  assert.equal(hasUsableStreetAddress('Main Street'), false);
});

test('classifies discard reasons', () => {
  assert.equal(classifyDiscardReason({}, { streetAddress: '' }), 'Blank or empty row');
  assert.equal(
    classifyDiscardReason({}, { streetAddress: 'City Hall', violationIssueType: 'x' }),
    'Clearly non-property record'
  );
  assert.equal(
    classifyDiscardReason({}, { streetAddress: 'Apartment Complex', violationIssueType: 'weeds' }),
    'Clearly non-property record'
  );
  assert.equal(
    classifyDiscardReason({}, { streetAddress: 'Shopping Mall', violationIssueType: 'x' }),
    'Clearly non-property record'
  );
  assert.equal(
    classifyDiscardReason({}, { streetAddress: 'nowhere', violationIssueType: 'trash' }),
    'No usable street address'
  );
  assert.equal(
    classifyDiscardReason({}, { streetAddress: '123 Oak St', violationIssueType: 'trash' }),
    null
  );
  // Vacant lots stay usable addresses
  assert.equal(
    classifyDiscardReason({}, { streetAddress: 'Lot 12 Oak Tract', violationIssueType: 'weeds' }),
    null
  );
});

test('builds normalized rows with city/state injection', () => {
  const mapped = mapRawRow(
    { 'Property Address': '9 Elm Rd', Description: 'Overgrown weeds' },
    detectIntakeColumnMap(['Property Address', 'Description'])
  );
  const row = buildNormalizedRow(mapped, {
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'list.csv',
    processedAt: '2026-07-06T12:00:00.000Z',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: [],
    confidenceLevel: 'high'
  });
  assert.equal(row.streetAddress, '9 Elm Rd');
  assert.equal(row.city, 'Marana');
  assert.equal(row.state, 'Arizona');
  assert.equal(row.uploadType, 'code_violation');
  assert.equal(row.confidenceLevel, 'high');
});

test('exports rows with human-readable column labels', () => {
  const exported = toExportRow({
    streetAddress: '1 Main',
    city: 'X',
    state: 'Y',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: '',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: '',
    confidenceLevel: 'high',
    sourceFile: 'a.csv',
    uploadType: 'code_violation',
    processedAt: '2026-07-06T12:00:00.000Z'
  });
  assert.equal(exported['Street Address'], '1 Main');
  assert.equal(exported['Distressed Signal Tag'], 'Standard Code Violation');
});

test('accepts all supported upload extensions', () => {
  for (const ext of [
    '.xlsx', '.xls', '.xlsm', '.csv', '.tsv', '.txt',
    '.pdf', '.docx',
    '.jpg', '.jpeg', '.png',
    '.webp', '.gif', '.tif', '.tiff', '.bmp',
    '.heic', '.heif'
  ]) {
    assert.equal(isAcceptedFile(`violations${ext}`), true, ext);
  }
  assert.equal(isAcceptedFile('archive.zip'), false);
  assert.equal(isAcceptedFile('legacy.doc'), false);
  assert.equal(isAcceptedFile('photo.heic'), true);
  assert.equal(isAcceptedFile('scan.tiff'), true);
  assert.equal(isAcceptedFile('clip.webp'), true);
});

test('tracks discard reason stats', () => {
  const stats = emptyProcessingStats();
  incrementDiscardReason(stats, 'No usable street address');
  assert.equal(stats.discarded, 1);
  assert.equal(stats.discardReasons['No usable street address'], 1);
});

test('upload type ids include gov-list types', () => {
  assert.deepEqual(UPLOAD_TYPE_IDS, [
    'code_violation',
    'pre_lien',
    'tax_delinquent',
    'lis_pendens',
    'probate',
    'fire',
    'water_shut_off'
  ]);
  assert.equal(validateUploadType('pre_lien'), 'pre_lien');
  assert.equal(validateUploadType('tax_delinquent'), 'tax_delinquent');
  assert.equal(validateUploadType('lis_pendens'), 'lis_pendens');
  assert.equal(validateUploadType('probate'), 'probate');
  assert.equal(validateUploadType('fire'), 'fire');
});

// --- SHAPE-01 / SHAPE-02: matchedIndicators array on process; join on export ---

test('buildNormalizedRow keeps matchedIndicators as array', () => {
  const mapped = {
    streetAddress: '123 Main St',
    city: '',
    state: '',
    zip: '',
    violationIssueType: 'High Grass',
    violationDate: '',
    descriptionNotes: ''
  };
  const indicators = [
    'Tall/overgrown/high grass or weeds',
    'Accumulation of trash'
  ];
  const row = buildNormalizedRow(mapped, {
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'list.csv',
    processedAt: '2026-07-06T12:00:00.000Z',
    distressedSignalTag: 'Strong Distressed Signal',
    matchedIndicators: indicators,
    confidenceLevel: 'high'
  });
  assert.equal(Array.isArray(row.matchedIndicators), true);
  assert.deepEqual(row.matchedIndicators, indicators);
  assert.notEqual(row.matchedIndicators, indicators, 'should be a copy, not same ref');
});

test('buildNormalizedRow empty matchedIndicators normalizes to []', () => {
  const mapped = {
    streetAddress: '1 Oak',
    city: '',
    state: '',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: ''
  };
  const empty = buildNormalizedRow(mapped, {
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'a.csv',
    processedAt: '2026-07-06T12:00:00.000Z',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: [],
    confidenceLevel: 'high'
  });
  assert.deepEqual(empty.matchedIndicators, []);

  const missing = buildNormalizedRow(mapped, {
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'a.csv',
    processedAt: '2026-07-06T12:00:00.000Z',
    distressedSignalTag: 'Standard Code Violation',
    confidenceLevel: 'high'
  });
  assert.deepEqual(missing.matchedIndicators, []);
});

test('buildNormalizedRow coerces legacy string indicators to array', () => {
  const mapped = {
    streetAddress: '1 Oak',
    city: '',
    state: '',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: ''
  };
  const row = buildNormalizedRow(mapped, {
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'a.csv',
    processedAt: '2026-07-06T12:00:00.000Z',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: 'legacy string',
    confidenceLevel: 'high'
  });
  assert.equal(Array.isArray(row.matchedIndicators), true);
  assert.deepEqual(row.matchedIndicators, ['legacy string']);
});

test('toExportRow joins matchedIndicators array with semicolon space', () => {
  const exported = toExportRow({
    streetAddress: '1 Main',
    city: 'X',
    state: 'Y',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: '',
    distressedSignalTag: 'Strong Distressed Signal',
    matchedIndicators: ['a', 'b'],
    confidenceLevel: 'high',
    sourceFile: 'a.csv',
    uploadType: 'code_violation',
    processedAt: '2026-07-06T12:00:00.000Z'
  });
  assert.equal(exported['Matched Indicators'], 'a; b');
});

test('toExportRow empty array indicators export as empty string', () => {
  const exported = toExportRow({
    streetAddress: '1 Main',
    city: 'X',
    state: 'Y',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: '',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: [],
    confidenceLevel: 'high',
    sourceFile: 'a.csv',
    uploadType: 'code_violation',
    processedAt: '2026-07-06T12:00:00.000Z'
  });
  assert.equal(exported['Matched Indicators'], '');
});

test('toExportRow accepts already-joined string indicators for backward compat', () => {
  const exported = toExportRow({
    streetAddress: '1 Main',
    city: 'X',
    state: 'Y',
    zip: '',
    violationIssueType: '',
    violationDate: '',
    descriptionNotes: '',
    distressedSignalTag: 'Standard Code Violation',
    matchedIndicators: 'already; joined',
    confidenceLevel: 'high',
    sourceFile: 'a.csv',
    uploadType: 'code_violation',
    processedAt: '2026-07-06T12:00:00.000Z'
  });
  assert.equal(exported['Matched Indicators'], 'already; joined');
});
