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
const { processUpload, processUploadBatch, mergeProcessResults, MAX_BATCH_FILES } = require('../lib/bridge-engine');
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

test('parses CSV with multiline quoted addresses without doubling rows', () => {
  // Johns Creek-style export: street + city/state/zip on separate lines inside quotes
  const csv = [
    'Code Case Number,Address,Code Case Description,Violation Code Number',
    'CODE-1,"11190 Bramshill DR',
    'Johns Creek, GA 30022",Tall weeds and grass,302.4 Weeds',
    'CODE-2,"11877 Douglas RD',
    'Johns Creek, GA 30005",JV and rubbish,308.1 Accumulation of rubbish or garbage'
  ].join('\n');
  const parsed = parseSpreadsheet(Buffer.from(csv), 'multiline.csv');
  assert.equal(parsed.rows.length, 2, 'must not split quoted multiline fields into extra rows');
  assert.match(parsed.rows[0].Address, /11190 Bramshill DR/i);
  assert.match(parsed.rows[0].Address, /Johns Creek/i);
  assert.match(parsed.rows[1].Address, /11877 Douglas RD/i);
});

test('processUploadBatch real-style multiline CSVs keep one row per case', async () => {
  const weeds = [
    'Code Case Number,Address,Code Case Opened Date,Code Case Closed Date,Code Case Description,Code Case Assigned To,Violation Code Number',
    'CODE-26-0318,"11190 Bramshill DR',
    'Johns Creek, GA 30022",6/11/2026,7/1/2026,This property has grass and weeds several feet high,William Wharton,302.4 Weeds',
    'CODE-26-0321,"11105 Rotherick DR',
    'Johns Creek, GA 30022",6/12/2026,7/1/2026,High grass,William Wharton,302.4 Weeds'
  ].join('\n');
  const rubbish = [
    'Code Case Number,Address,Code Case Opened Date,Code Case Type,Code Case Closed Date,Code Case Description,Code Case Assigned To,Violation Code Number',
    'CODE-26-0315,"11877 Douglas RD',
    'Johns Creek, GA 30005",6/9/2026,Code Compliance,7/6/2026,JV and rubbish,Reginald Miller,308.1 Accumulation of rubbish or garbage',
    'CODE-26-0347,"11165 Rotherick DR',
    'Johns Creek, GA 30022",6/25/2026,Code Compliance,7/6/2026,Accumulation of Rubbish,William Wharton,308.1 Accumulation of rubbish or garbage'
  ].join('\n');

  const result = await processUploadBatch(
    [
      { filename: '302.4_Weeds.csv', data: Buffer.from(weeds) },
      { filename: '308.1_Rubbish.csv', data: Buffer.from(rubbish) }
    ],
    { city: { id: 'ga-johns-creek', city: 'Johns Creek', state: 'Georgia' }, uploadType: 'code_violation' }
  );

  assert.equal(result.stats.totalParsed, 4, '14→28 style bug: multiline addresses doubled every row');
  assert.equal(result.stats.kept, 4);
  assert.equal(result.rows.length, 4);
  assert.ok(result.rows.every((r) => /^\d/.test(String(r.streetAddress || ''))), 'streetAddress starts with house number');
  assert.ok(result.rows.some((r) => /Bramshill/i.test(r.streetAddress)));
  assert.ok(result.rows.some((r) => /Douglas/i.test(r.streetAddress)));
});

test('processUploadBatch merges two files and cross-file dedupes', async () => {
  assert.equal(MAX_BATCH_FILES, 5);
  const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const result = await processUploadBatch(
    [
      { filename: 'part-a.csv', data: buffer },
      { filename: 'part-b.csv', data: buffer }
    ],
    { city: CITY, uploadType: 'code_violation' }
  );
  assert.equal(result.fileCount, 2);
  assert.ok(result.sourceFile.includes('part-a.csv'));
  assert.ok(result.sourceFile.includes('part-b.csv'));
  // Same CSV twice → kept rows should match single-file count after cross-file dedupe
  const single = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation'
  });
  assert.equal(result.stats.kept, single.stats.kept);
  assert.ok(result.processingMeta.multiFile === true);
  assert.equal(result.processingMeta.files.length, 2);
});

test('processUploadBatch address-dedupes same parcel with different violation text', async () => {
  // Reproduces 14-address / 28-kept bug: multi-file merge used issue-aware dedupe,
  // so "overgrown weeds" vs "tall grass and weeds" at the same address both survived.
  const makeCsv = (issue) => {
    const lines = ['Property Address,Violation Type'];
    for (let i = 1; i <= 14; i += 1) {
      lines.push(`${i} Pine Rd,${issue}`);
    }
    return Buffer.from(lines.join('\n'));
  };
  const result = await processUploadBatch(
    [
      { filename: 'part-a.csv', data: makeCsv('overgrown weeds') },
      { filename: 'part-b.csv', data: makeCsv('tall grass and weeds') }
    ],
    { city: CITY, uploadType: 'code_violation' }
  );
  assert.equal(result.fileCount, 2);
  assert.equal(result.stats.totalParsed, 28);
  assert.equal(result.stats.kept, 14, 'one lead per address across files');
  assert.equal(result.rows.length, 14);
  assert.ok(result.stats.deduplicated >= 14);
});

test('mergeProcessResults single payload is pass-through with fileCount 1', () => {
  const one = {
    ok: true,
    city: CITY,
    uploadType: 'code_violation',
    sourceFile: 'a.csv',
    rows: [{ streetAddress: '1 Main', distressedSignalTag: STRONG_DISTRESSED_TAG }],
    notDistressedRows: [],
    discarded: [],
    stats: { totalParsed: 1, kept: 1, discarded: 0, deduplicated: 0, alreadyImported: 0 },
    processingMeta: { brainVersion: 2, durationMs: 10 }
  };
  const merged = mergeProcessResults([one], { city: CITY, uploadType: 'code_violation' });
  assert.equal(merged.fileCount, 1);
  assert.equal(merged.sourceFile, 'a.csv');
  assert.equal(merged.rows.length, 1);
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
  // Fence permit is not distress ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ FN pool; empty City Hall row discarded (no address)
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

test('processUpload promotes unmapped Vio Cat into type and FN/distressed labels (MAP-01/02, TEST-02)', async () => {
  const csv = [
    'Property Address,Vio Cat,Notes',
    '100 Main St,High Grass,overgrown weeds in yard',
    '200 Oak Ave,Fence Permit,admin'
  ].join('\n');
  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'vio-cat.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);

  // Distressed High Grass path: type from Vio Cat when unmapped
  const grass = result.rows.find(
    (row) => String(row.streetAddress || '').includes('100 Main')
  );
  assert.ok(grass, 'High Grass distressed row kept');
  assert.ok(
    String(grass.violationIssueType || '').includes('High Grass'),
    `distressed type should include High Grass, got: ${grass.violationIssueType}`
  );

  // FN Fence: type from Vio Cat (MAP-01/02) — not gated on distress
  const fenceFn = result.notDistressedRows.find(
    (row) => String(row.streetAddress || '').includes('200 Oak')
  );
  assert.ok(fenceFn, 'Fence Permit should be in notDistressedRows');
  assert.ok(
    String(fenceFn.violationIssueType || '').includes('Fence Permit'),
    `FN type should include Fence Permit, got: ${fenceFn.violationIssueType}`
  );

  // FN group label uses city category, not notes-only / (no type)
  const fenceGroup = (result.reviewGroups.notDistressed || []).find(
    (g) =>
      String(g.violationTypeLabel || '').toLowerCase().includes('fence')
  );
  assert.ok(
    fenceGroup,
    'reviewGroups.notDistressed should label Fence / Fence Permit'
  );
  assert.ok(
    !/^\s*admin\s*$/i.test(String(fenceGroup.violationTypeLabel || '')),
    'FN label must not be notes-only admin'
  );
  assert.notEqual(
    String(fenceGroup.violationTypeLabel || ''),
    '(no type)',
    'FN label must not be (no type) when Vio Cat existed'
  );
  // Distressed group label uses city category from Vio Cat (TEST-02)
  const grassGroup = (result.reviewGroups.distressed || []).find((g) =>
    /high grass/i.test(String(g.violationTypeLabel || g.violationTypeKey || ''))
  );
  assert.ok(grassGroup, 'distressed reviewGroups should label High Grass from Vio Cat');
  assert.notEqual(String(grassGroup.violationTypeLabel || ''), '(no type)');
});

test('processUpload does not invent type from description-only free text (MAP-03)', async () => {
  const csv = [
    'Property Address,Description',
    '300 Elm St,overgrown weeds and tall grass everywhere in the front yard'
  ].join('\n');
  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'desc-only.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  const row =
    result.rows.find((r) => String(r.streetAddress || '').includes('300 Elm')) ||
    result.notDistressedRows.find((r) =>
      String(r.streetAddress || '').includes('300 Elm')
    );
  assert.ok(row, 'description-only row should be kept or FN');
  const type = String(row.violationIssueType || '').trim();
  const notes = String(row.descriptionNotes || '').trim();
  // Must not set type equal to full notes dump / free-text invention
  if (notes) {
    assert.notEqual(
      type,
      notes,
      'promotion must not invent type from full description notes'
    );
  }
  // Prefer empty type over inventing composite free-text type
  assert.ok(
    type === '' || !type.toLowerCase().includes('everywhere in the front yard'),
    `type should not be free-text narrative dump, got: ${type}`
  );
});

test('processUpload: description-only High Grass + timestamps → 1 distressed group count N (TEST-01)', async () => {
  const csv = [
    'Property Address,Description',
    '100 Main St,High Grass and Weeds - 01/15/2024 10:30',
    '200 Oak Ave,High Grass and Weeds - 01/16/2024 11:00',
    '300 Pine Rd,High Grass and Weeds - 01/17/2024 09:15'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'desc-timestamps.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 3, 'all three High Grass rows kept Strong');
  for (const row of result.rows) {
    assert.equal(String(row.violationIssueType || '').trim(), '');
  }

  const distressed = result.reviewGroups.distressed || [];
  assert.equal(distressed.length, 1, 'timestamp variants must stack into one group');
  assert.equal(distressed[0].count, 3);
  assert.equal(distressed[0].isSingleton, false);
  assert.equal(distressed[0].violationTypeKey, '__unknown__');
});

test('processUpload: typed clean High Grass stacks count N (TEST-03)', async () => {
  const csv = [
    'Property Address,Violation Type,Notes',
    '100 Main St,High Grass and Weeds,yard check A',
    '200 Oak Ave,High Grass and Weeds,yard check B',
    '300 Pine Rd,High Grass and Weeds,yard check C'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'typed-high-grass.csv',
    city: CITY,
    uploadType: 'code_violation'
  });

  assert.equal(result.ok, true);
  assert.ok(result.rows.length >= 3);
  const grassGroups = (result.reviewGroups.distressed || []).filter((g) =>
    /high grass/i.test(g.violationTypeLabel || g.violationTypeKey || '')
  );
  assert.equal(grassGroups.length, 1);
  assert.ok(grassGroups[0].count >= 3);
  assert.equal(grassGroups[0].isSingleton, false);
});
