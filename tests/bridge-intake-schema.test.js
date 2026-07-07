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
  assert.throws(() => validateUploadType('probate'), /Invalid upload type/);
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
    classifyDiscardReason({}, { streetAddress: 'nowhere', violationIssueType: 'trash' }),
    'No usable street address'
  );
  assert.equal(
    classifyDiscardReason({}, { streetAddress: '123 Oak St', violationIssueType: 'trash' }),
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
  for (const ext of ['.xlsx', '.csv', '.pdf', '.docx', '.jpg', '.png', '.txt']) {
    assert.equal(isAcceptedFile(`violations${ext}`), true, ext);
  }
  assert.equal(isAcceptedFile('archive.zip'), false);
  assert.equal(isAcceptedFile('legacy.doc'), false);
});

test('tracks discard reason stats', () => {
  const stats = emptyProcessingStats();
  incrementDiscardReason(stats, 'No usable street address');
  assert.equal(stats.discarded, 1);
  assert.equal(stats.discardReasons['No usable street address'], 1);
});

test('upload type ids are stable', () => {
  assert.deepEqual(UPLOAD_TYPE_IDS, ['code_violation', 'water_shut_off']);
});