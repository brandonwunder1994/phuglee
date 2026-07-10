const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const config = require('../lib/config');
const originalBrainRoot = config.BRIDGE_BRAIN_ROOT;
let tempBrainRoot;

before(() => {
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-engine-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalBrainRoot;
  try {
    fs.rmSync(tempBrainRoot, { recursive: true, force: true });
  } catch (_) {}
});

const indexModule = require('../lib/analyzer-import-index');
const emptyImportIndex = async () => ({
  loadedAt: Date.now(),
  addresses: new Set(),
  count: 0,
  sources: null
});
indexModule.loadImportAddressIndex = emptyImportIndex;
const { processUpload } = require('../lib/bridge-engine');
const { parseSpreadsheet } = require('../lib/bridge-engine/parsers/spreadsheet');
const { parseTextFile } = require('../lib/bridge-engine/parsers/text');
const { normalizeRawRows } = require('../lib/bridge-engine/normalizer');
const {
  emptyBrain,
  saveBrain,
  violationTypeKey
} = require('../lib/bridge-brain-store');
const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { UPLOAD_TYPES } = require('../lib/bridge-intake-schema');

const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');
const CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' };

test('parses CSV with varied violation headers', () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const parsed = parseSpreadsheet(buffer, 'violations.csv');
  assert.equal(parsed.headers.includes('Property Address'), true);
  assert.equal(parsed.rows.length, 4);
});

test('processUpload keeps open and closed violations with usable addresses', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const result = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.stub, false);
  // Fence permit is not distress â†’ FN pool; empty City Hall row discarded (no address)
  assert.equal(result.stats.kept, 2);
  assert.ok(result.stats.noDistress >= 1);
  assert.ok(result.rows.some((row) => row.violationIssueType.includes('Overgrown')));
  assert.ok(result.rows.some((row) => row.violationIssueType.includes('trash')));
  assert.equal(result.rows.every((row) => row.city === 'Marana'), true);
  assert.equal(result.rows.every((row) => row.state === 'Arizona'), true);
  assert.equal(result.processingMeta.parser, 'csv');
  assert.equal(result.processingMeta.columnMap.streetAddress, 'Property Address');

  // REV-01: full FN pool (not thin discard previews)
  assert.ok(Array.isArray(result.notDistressedRows));
  assert.ok(result.notDistressedRows.length >= 1);
  const fenceFn = result.notDistressedRows.find(
    (row) => String(row.violationIssueType || '').toLowerCase().includes('fence')
  );
  assert.ok(fenceFn, 'fence permit should be in notDistressedRows');
  assert.ok(fenceFn.streetAddress, 'FN row has streetAddress');
  assert.ok(fenceFn.violationIssueType, 'FN row has violationIssueType');
  assert.ok(
    fenceFn.descriptionNotes != null || fenceFn.description != null,
    'FN row has description field'
  );
  // Empty-address City Hall row is non-review discard, not FN
  assert.ok(
    !result.notDistressedRows.some((row) => !String(row.streetAddress || '').trim()),
    'empty-address rows must not appear in notDistressedRows'
  );
  assert.ok(
    !result.notDistressedRows.some(
      (row) => String(row.descriptionNotes || '').toLowerCase().includes('city hall')
    ),
    'City Hall empty-address row excluded from FN'
  );

  // REV-02: unique rowIds on kept + FN
  const allIds = [
    ...result.rows.map((r) => r.rowId),
    ...result.notDistressedRows.map((r) => r.rowId)
  ];
  assert.ok(allIds.every(Boolean), 'every kept and FN row has truthy rowId');
  assert.equal(new Set(allIds).size, allIds.length, 'rowIds are unique');

  // REV-03/04: review groups stacked by type
  assert.ok(result.reviewGroups);
  assert.ok(Array.isArray(result.reviewGroups.distressed));
  assert.ok(Array.isArray(result.reviewGroups.notDistressed));
  assert.ok(result.reviewGroups.distressed.length >= 1);
  assert.ok(
    result.reviewGroups.distressed.some((g) =>
      /overgrown|weeds|trash|accumulation/i.test(g.violationTypeLabel || '')
    ),
    'distressed groups cover kept types'
  );
  assert.ok(
    result.reviewGroups.notDistressed.some((g) =>
      /fence/i.test(g.violationTypeLabel || g.violationTypeKey || '')
    ),
    'fence permit appears under reviewGroups.notDistressed'
  );
  const sampleGroup =
    result.reviewGroups.distressed[0] || result.reviewGroups.notDistressed[0];
  assert.ok(Array.isArray(sampleGroup.matchedIndicators));
  assert.ok(Array.isArray(sampleGroup.descriptionSamples));

  // SHAPE-01: real process path must union tagger arrays into groups
  const taggedGroup = result.reviewGroups.distressed.find(
    (g) => Array.isArray(g.matchedIndicators) && g.matchedIndicators.length > 0
  );
  assert.ok(taggedGroup, 'at least one distressed group has non-empty matchedIndicators from process path');
  const taggedRow = result.rows.find(
    (row) => Array.isArray(row.matchedIndicators) && row.matchedIndicators.length > 0
  );
  assert.ok(taggedRow, 'at least one kept row has non-empty matchedIndicators array');
  assert.ok(
    /vegetation|grass|weed|trash|accumul|overgrown/i.test(
      (taggedRow.matchedIndicators || []).join(' ') + ' ' + (taggedRow.violationIssueType || '')
    ),
    'tagged row should be vegetation/trash-type with array indicators'
  );

  // Cap metadata + stats continuity
  assert.equal(result.stats.noDistress, result.notDistressedRows.length);
  assert.ok(result.brainMeta);
  assert.equal(typeof result.brainMeta.notDistressedTruncated, 'boolean');
  assert.equal(result.brainMeta.notDistressedTotal, result.notDistressedRows.length);
  assert.equal(result.brainMeta.notDistressedReturned, result.notDistressedRows.length);
});

test('tags strong distressed signals during tabular processing', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const result = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  const strong = result.rows.find((row) => row.streetAddress === '123 Main St');
  assert.match(strong.distressedSignalTag, /Strong Distressed Signal/i);
});

test('parses tab-delimited TXT shutoff list', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'water-shutoffs.txt'));
  const parsed = parseTextFile(buffer, 'shutoffs.txt');
  assert.equal(parsed.delimiter, '\t');
  assert.equal(parsed.headers[0], 'Service Address');

  const result = await processUpload({
    buffer,
    filename: 'shutoffs.txt',
    city: CITY,
    uploadType: 'water_shut_off'
  });
  assert.equal(result.stats.kept, 2);
  assert.ok(result.rows.every((row) => row.distressedSignalTag.includes('Water Shut Off')));
});

test('normalizeRawRows discards blank and non-property rows with reasons', () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const parsed = parseSpreadsheet(buffer, 'violations.csv');
  const normalized = normalizeRawRows(parsed.rows, parsed.headers, {
    city: CITY,
    uploadType: 'code_violation',
    sourceFile: 'violations.csv',
    processedAt: new Date().toISOString()
  });
  assert.equal(normalized.discarded.length, 1);
  assert.match(normalized.discarded[0].reason, /address/i);
});

test('processUpload parses Excel workbooks', async () => {
  const ws = XLSX.utils.json_to_sheet([
    {
      'Site Address': '77 Desert Rd',
      'Issue Type': 'Abandoned vehicle on property',
      'Notice Date': '2026-06-01'
    }
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Violations');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await processUpload({
    buffer,
    filename: 'violations.xlsx',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(result.stats.kept, 1);
  assert.equal(result.processingMeta.parser, 'spreadsheet');
  assert.match(result.rows[0].distressedSignalTag, /Strong Distressed Signal/i);
});

test('processUpload parses PDF text extracts', async () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'violation-list-plain.txt'), 'utf8');
  const pdfParsePath = require.resolve('pdf-parse');
  const pdfParserPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const originalPdfParse = require(pdfParsePath);

  require.cache[pdfParsePath].exports = async () => ({ text, numpages: 1 });
  delete require.cache[pdfParserPath];
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from('%PDF-1.4 fake'),
      filename: 'violations.pdf',
      city: CITY,
      uploadType: 'code_violation'
    });
    assert.equal(result.stats.kept, 3);
    assert.equal(result.processingMeta.parser, 'pdf');
    assert.equal(result.processingMeta.parseMode, 'table');
  } finally {
    require.cache[pdfParsePath].exports = originalPdfParse;
    delete require.cache[pdfParserPath];
    delete require.cache[enginePath];
  }
});

test('processUpload rejects legacy .doc files', async () => {
  await assert.rejects(
    () => processUpload({
      buffer: Buffer.from('doc'),
      filename: 'list.doc',
      city: CITY,
      uploadType: 'code_violation'
    }),
    (err) => err.code === 'UNSUPPORTED_FILE'
  );
});

test('processUpload flags low-confidence OCR rows for review', async () => {
  const text = '999 Desert Rd overgrown weeds';
  const ocrPath = require.resolve('../lib/bridge-engine/parsers/image-ocr');
  const enginePath = require.resolve('../lib/bridge-engine');
  const original = require(ocrPath).parseImageOcr;

  require.cache[ocrPath].exports.parseImageOcr = async () => ({
    parser: 'ocr',
    parseMode: 'address-lines',
    headers: ['Street Address', 'Description/Notes'],
    rows: [{
      'Street Address': '999 Desert Rd',
      'Description/Notes': 'overgrown weeds',
      _meta: { confidenceLevel: 'low', needsReview: true }
    }],
    ocrConfidence: 42
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from('image'),
      filename: 'scan.jpg',
      city: CITY,
      uploadType: 'code_violation'
    });
    assert.equal(result.rows[0].needsReview, true);
    assert.equal(result.rows[0].confidenceLevel, 'low');
    assert.equal(result.stats.needsReview, 1);
  } finally {
    require.cache[ocrPath].exports.parseImageOcr = original;
    delete require.cache[enginePath];
  }
});

test('processUpload fails when no usable addresses exist', async () => {
  const csv = 'Property Address,Violation Type\nMain Street,Sign violation\n,';
  await assert.rejects(
    () => processUpload({
      buffer: Buffer.from(csv),
      filename: 'empty.csv',
      city: CITY,
      uploadType: 'code_violation'
    }),
    (err) => err.code === 'NO_USABLE_ROWS'
  );
});

test('processUpload deduplicates near-duplicate rows in upload', async () => {
  const csv = [
    'Property Address,Violation Type,Violation Date',
    '123 Main St,Overgrown weeds,2026-01-01',
    '123 Main Street,Overgrown weeds,2026-01-01',
    '789 Pine Rd,Trash,2026-02-01'
  ].join('\n');
  const result = await processUpload({
    buffer: Buffer.from(csv),
    filename: 'dupes.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(result.stats.kept, 2);
  assert.equal(result.stats.deduplicated, 1);
});

test('processUpload filters rows already in Property Analyzer', async () => {
  const enginePath = require.resolve('../lib/bridge-engine');
  const { normalizeAddressKey } = indexModule;

  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set([normalizeAddressKey('123 Main St, Marana, Arizona, 85704')]),
    count: 1,
    sources: { records: 1, results: 0 }
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
    const result = await processUploadFresh({
      buffer,
      filename: 'violations.csv',
      city: CITY,
      uploadType: 'code_violation'
    });
    assert.equal(result.stats.alreadyImported, 1);
    assert.ok(!result.rows.some((row) => row.streetAddress === '123 Main St'));
    assert.equal(result.processingMeta.importIndexCount, 1);
  } finally {
    indexModule.loadImportAddressIndex = emptyImportIndex;
    delete require.cache[enginePath];
  }
});

test('processUpload with empty brain exposes brain meta and keeps baseline outcomes', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const result = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(result.stats.kept, 2);
  assert.equal(result.processingMeta.brainVersion, 1);
  assert.ok(Array.isArray(result.processingMeta.brainAppliedRuleIds));
  assert.deepEqual(result.processingMeta.brainAppliedRuleIds, []);
});

test('processUpload suppress_type drops otherwise-strong violation rows', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const baseline = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(baseline.stats.kept, 2);

  const brain = emptyBrain();
  brain.typeRules = [
    {
      id: 'tr_suppress_weeds',
      kind: 'suppress_type',
      violationTypeKey: violationTypeKey('Overgrown weeds'),
      violationTypeLabel: 'Overgrown weeds',
      status: 'active'
    }
  ];
  saveBrain(brain);

  try {
    const result = await processUpload({
      buffer,
      filename: 'violations.csv',
      city: CITY,
      uploadType: 'code_violation'
    });
    assert.ok(result.stats.kept < baseline.stats.kept);
    assert.ok(!result.rows.some((row) => row.streetAddress === '123 Main St'));
    assert.ok(result.rows.some((row) => row.streetAddress === '456 Oak Ave'));
    assert.ok(result.processingMeta.brainAppliedRuleIds.includes('tr_suppress_weeds'));
  } finally {
    saveBrain(emptyBrain());
  }
});

test('processUpload all-FN code_violation succeeds with empty kept (zero-kept policy)', async () => {
  const csv = [
    'Property Address,Violation Type,Violation Date,Description',
    '555 Fence Way,Fence permit,2026-03-28,Expired permit',
    '777 Permit Ln,Building permit,2026-03-29,New construction'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv),
    filename: 'all-fn.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 0);
  assert.ok(result.notDistressedRows.length >= 1);
  assert.ok(result.reviewGroups.notDistressed.length >= 1);
  assert.ok(result.stats.noDistress >= 1);
  assert.ok(result.notDistressedRows.every((r) => r.rowId));
});

test('processUpload pure no-address file still throws NO_USABLE_ROWS', async () => {
  const csv = [
    'Property Address,Violation Type,Description',
    ',Parking lot maintenance,City Hall lot',
    ',,'
  ].join('\n');

  await assert.rejects(
    () => processUpload({
      buffer: Buffer.from(csv),
      filename: 'no-address.csv',
      city: CITY,
      uploadType: 'code_violation'
    }),
    (err) => err.code === 'NO_USABLE_ROWS'
  );
});

test('processUpload water_shut_off has empty notDistressedRows and rowIds on kept', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'water-shutoffs.txt'));
  const result = await processUpload({
    buffer,
    filename: 'shutoffs.txt',
    city: CITY,
    uploadType: 'water_shut_off'
  });
  assert.ok(result.stats.kept >= 1);
  assert.ok(Array.isArray(result.notDistressedRows));
  assert.equal(result.notDistressedRows.length, 0);
  assert.ok(result.rows.every((row) => row.rowId));
});

test('processUpload promote_type keeps generic type as Strong', async () => {
  const csv = [
    'Property Address,Violation Type,Violation Date,Description',
    '555 Fence Way,Fence permit,2026-03-28,Expired permit'
  ].join('\n');

  // Without brain: all-FN success (zero kept, FN pool has fence)
  const baseline = await processUpload({
    buffer: Buffer.from(csv),
    filename: 'fence.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.rows.length, 0);
  assert.ok(baseline.notDistressedRows.length >= 1);

  const brain = emptyBrain();
  brain.typeRules = [
    {
      id: 'tr_promote_fence',
      kind: 'promote_type',
      violationTypeKey: violationTypeKey('Fence permit'),
      violationTypeLabel: 'Fence permit',
      status: 'active'
    }
  ];
  saveBrain(brain);

  try {
    const result = await processUpload({
      buffer: Buffer.from(csv),
      filename: 'fence.csv',
      city: CITY,
      uploadType: 'code_violation'
    });
    assert.equal(result.stats.kept, 1);
    assert.equal(result.rows[0].streetAddress, '555 Fence Way');
    assert.equal(result.rows[0].distressedSignalTag, STRONG_DISTRESSED_TAG);
    assert.ok(result.processingMeta.brainAppliedRuleIds.includes('tr_promote_fence'));
  } finally {
    saveBrain(emptyBrain());
  }
});

test('processUpload water_shut_off ignores type suppress (BRAIN-03)', async () => {
  const buffer = fs.readFileSync(path.join(FIXTURES, 'water-shutoffs.txt'));
  const baseline = await processUpload({
    buffer,
    filename: 'shutoffs.txt',
    city: CITY,
    uploadType: 'water_shut_off'
  });
  assert.equal(baseline.stats.kept, 2);

  const brain = emptyBrain();
  brain.typeRules = [
    {
      id: 'tr_suppress_water',
      kind: 'suppress_type',
      violationTypeKey: violationTypeKey('Water shut off delinquency'),
      violationTypeLabel: 'Water shut off delinquency',
      status: 'active'
    },
    {
      id: 'tr_suppress_utility',
      kind: 'suppress_type',
      violationTypeKey: violationTypeKey('Utility terminated'),
      violationTypeLabel: 'Utility terminated',
      status: 'active'
    }
  ];
  saveBrain(brain);

  try {
    const result = await processUpload({
      buffer,
      filename: 'shutoffs.txt',
      city: CITY,
      uploadType: 'water_shut_off'
    });
    assert.equal(result.stats.kept, baseline.stats.kept);
    assert.ok(
      result.rows.every((row) =>
        row.distressedSignalTag === UPLOAD_TYPES.water_shut_off.defaultTag ||
        row.distressedSignalTag.includes('Water Shut Off')
      )
    );
    assert.ok(Array.isArray(result.processingMeta.brainAppliedRuleIds));
    assert.ok(!result.processingMeta.brainAppliedRuleIds.includes('tr_suppress_water'));
    assert.ok(!result.processingMeta.brainAppliedRuleIds.includes('tr_suppress_utility'));
  } finally {
    saveBrain(emptyBrain());
  }
});
