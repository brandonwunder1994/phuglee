const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');

const config = require('../lib/config');
const originalBrainRoot = config.BRIDGE_BRAIN_ROOT;
const originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
let tempBrainRoot;
let tempFormatsRoot;

before(() => {
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-engine-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  // Phase 52: isolate city-format memory (Plan 02 adds config key; set always for isolation).
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-engine-'));
  config.BRIDGE_CITY_FORMATS_ROOT = tempFormatsRoot;
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalBrainRoot;
  if (originalFormatsRoot === undefined) {
    delete config.BRIDGE_CITY_FORMATS_ROOT;
  } else {
    config.BRIDGE_CITY_FORMATS_ROOT = originalFormatsRoot;
  }
  try {
    fs.rmSync(tempBrainRoot, { recursive: true, force: true });
  } catch (_) {}
  try {
    if (tempFormatsRoot) fs.rmSync(tempFormatsRoot, { recursive: true, force: true });
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
    {
      city: { id: 'ga-johns-creek', city: 'Johns Creek', state: 'Georgia' },
      uploadType: 'code_violation',
      username: 'admin',
      // Shared header present on both files (mixed fingerprint allowed with confirm)
      confirmedTypeHeader: 'Code Case Description'
    }
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
    {
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    }
  );
  assert.equal(result.fileCount, 2);
  assert.ok(result.sourceFile.includes('part-a.csv'));
  assert.ok(result.sourceFile.includes('part-b.csv'));
  // Same CSV twice → kept rows should match single-file count after cross-file dedupe
  const single = await processUpload({
    buffer,
    filename: 'violations.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
    {
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    }
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Issue Type'
  });
  assert.equal(result.stats.kept, 1);
  assert.equal(result.processingMeta.parser, 'spreadsheet');
  assert.match(result.rows[0].distressedSignalTag, /Strong Distressed Signal/i);
});

test('processUpload converts PDF text table to Excel then filters', async () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'violation-list-plain.txt'), 'utf8');
  const pdfParsePath = require.resolve('pdf-parse');
  const pdfParserPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const originalPdfParse = require(pdfParsePath);

  // pdf-parse v2: getTable (empty) + getText (fixture) → text-table-to-xlsx path
  require.cache[pdfParsePath].exports = {
    PDFParse: class {
      constructor() {}
      async getTable() {
        return { total: 1, pages: [], mergedTables: [] };
      }
      async getText() {
        return { text, total: 1 };
      }
      async destroy() {}
    }
  };
  delete require.cache[pdfParserPath];
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from('%PDF-1.4 fake'),
      filename: 'violations.pdf',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    assert.equal(result.stats.kept, 3);
    assert.equal(result.processingMeta.parser, 'pdf-xlsx');
    assert.equal(result.processingMeta.parseMode, 'text-table-to-xlsx');
  } finally {
    require.cache[pdfParsePath].exports = originalPdfParse;
    delete require.cache[pdfParserPath];
    delete require.cache[enginePath];
  }
});

test('processUpload prefers PDF getTable grid converted to Excel', async () => {
  const pdfParsePath = require.resolve('pdf-parse');
  const pdfParserPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const originalPdfParse = require(pdfParsePath);

  const grid = [
    ['Property Address', 'Violation Type', 'Violation Date'],
    ['123 Main St', 'Overgrown weeds', '2026-04-02'],
    ['456 Oak Ave', 'Accumulation of trash', '2026-04-15'],
    ['789 Pine Dr', 'Abandoned vehicle', '2026-05-01']
  ];

  require.cache[pdfParsePath].exports = {
    PDFParse: class {
      constructor() {}
      async getTable() {
        return {
          total: 1,
          pages: [{ num: 1, tables: [grid] }],
          mergedTables: []
        };
      }
      async getText() {
        return { text: '', total: 1 };
      }
      async destroy() {}
    }
  };
  delete require.cache[pdfParserPath];
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from('%PDF-1.4 fake'),
      filename: 'grid-violations.pdf',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    assert.equal(result.stats.kept, 3);
    assert.equal(result.processingMeta.parser, 'pdf-xlsx');
    assert.equal(result.processingMeta.parseMode, 'table-to-xlsx');
    assert.ok(result.rows.some((r) => /Main/i.test(r.streetAddress)));
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: '__none__'
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  assert.equal(result.stats.kept, 2);
  assert.equal(result.stats.deduplicated, 1);
});

test('IND-04: processUpload does not hard-drop already_imported by default', async () => {
  const enginePath = require.resolve('../lib/bridge-engine');
  const { normalizeAddressKey } = indexModule;
  let loadCalled = false;

  indexModule.loadImportAddressIndex = async () => {
    loadCalled = true;
    return {
      loadedAt: Date.now(),
      addresses: new Set([normalizeAddressKey('123 Main St, Marana, Arizona, 85704')]),
      count: 1,
      sources: { records: 1, results: 0 }
    };
  };
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
    const result = await processUploadFresh({
      buffer,
      filename: 'violations.csv',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    assert.equal(result.stats.alreadyImported, 0);
    assert.ok(result.rows.some((row) => row.streetAddress === '123 Main St'));
    assert.equal(result.processingMeta.importIndexCount, 0);
    assert.equal(loadCalled, false, 'loadImportAddressIndex must not run when filter is off');
  } finally {
    indexModule.loadImportAddressIndex = emptyImportIndex;
    delete require.cache[enginePath];
  }
});

test('IND-04: processUpload hard-drops only when applyAlreadyImportedFilter === true', async () => {
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type',
      applyAlreadyImportedFilter: true
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: '__none__'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: '__none__'
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
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
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

// ---------------------------------------------------------------------------
// Phase 51 COL-01 / COL-02 / COL-04 process wire contracts
// Scorer force map wired in normalizeRawRows (Plan 03).
// ---------------------------------------------------------------------------

test('COL-01/04 / TEST-01 (v1.8): processUpload forces Status Description trap → columnMap Type is Vio Cat', async () => {
  const csv = [
    'Property Address,Status Description,Vio Cat,Description,Open Date',
    '100 Main St,Open,High Grass,Weeds exceeding 12 inches as of 01/15/2024 10:30,01/15/2024',
    '200 Oak Ave,Closed,Trash,Junk in yard observed 02/01/2024 09:00,02/01/2024'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'col-status-vio-cat.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
  });

  assert.equal(result.ok, true, 'COL-01 process must succeed');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Vio Cat',
    'COL-01: scorer must force columnMap.violationIssueType to Vio Cat'
  );
  assert.notEqual(
    result.processingMeta.columnMap.violationIssueType,
    'Status Description',
    'COL-04: alias-first Status Description must not remain as Type map'
  );

  const grass =
    result.rows.find((row) => String(row.streetAddress || '').includes('100 Main')) ||
    result.notDistressedRows.find((row) =>
      String(row.streetAddress || '').includes('100 Main')
    );
  assert.ok(grass, 'COL-01: High Grass row must be kept (distressed or FN)');
  assert.ok(
    String(grass.violationIssueType || '').includes('High Grass'),
    `COL-01: type cell must be High Grass not Open, got: ${grass.violationIssueType}`
  );
  assert.ok(
    !/^Open$/i.test(String(grass.violationIssueType || '').trim()),
    `COL-01: type must not be status value Open, got: ${grass.violationIssueType}`
  );
});

test('COL-01: processUpload forces Violation Description trap → columnMap Type is Issue Type', async () => {
  const csv = [
    'Property Address,Violation Description,Issue Type,Notes',
    '100 Main St,Property observed with overgrown vegetation and debris piles along the fence line as of 03/10/2024 14:22,High Grass,inspector notes only',
    '200 Oak Ave,Accumulation of junk and abandoned materials in the side yard reported 03/12/2024 08:15,Trash,follow up'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'col-violation-desc-issue-type.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Issue Type'
  });

  assert.equal(result.ok, true, 'COL-01 alt process must succeed');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Issue Type',
    'COL-01: scorer must force columnMap.violationIssueType to Issue Type'
  );
  assert.notEqual(
    result.processingMeta.columnMap.violationIssueType,
    'Violation Description',
    'COL-04: alias-first Violation Description must not remain as Type map'
  );
});

test('COL-02: processUpload with Address+Notes+Open Date only keeps weeds row (no silent drop)', async () => {
  const csv = [
    'Property Address,Notes,Open Date',
    '100 Main St,overgrown weeds and tall grass covering the front yard,01/15/2024',
    '200 Oak Ave,debris pile near fence line,02/01/2024'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'col-no-type-column.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: '__none__'
  });

  assert.equal(result.ok, true, 'COL-02: process must succeed without type column');

  const typeMap = result.processingMeta.columnMap.violationIssueType;
  assert.ok(
    typeMap == null || typeMap === '',
    `COL-02: columnMap.violationIssueType must be falsy when no Type candidacy, got: ${typeMap}`
  );

  const discardReasons = [
    ...(result.discarded || []).map((d) => String(d.reason || d.discardReason || '')),
    ...(result.stats?.discardReasons
      ? Object.keys(result.stats.discardReasons)
      : [])
  ].join(' ');
  assert.ok(
    !/no_type(_column)?/i.test(discardReasons),
    `COL-02: must not introduce no_type / no_type_column discard reason, got: ${discardReasons}`
  );

  const weedsKept =
    result.rows.find((row) => String(row.streetAddress || '').includes('100 Main')) ||
    result.notDistressedRows.find((row) =>
      String(row.streetAddress || '').includes('100 Main')
    );
  assert.ok(
    weedsKept,
    'COL-02: weeds address must remain kept or FN — no silent total drop'
  );
});

// COL-03: promote remains empty-cell-only after scorer force map
test('COL-03: scorer-mapped Issue Type cells are not overridden by unmapped Cat column', async () => {
  const csv = [
    'Property Address,Issue Type,Cat,Notes',
    '100 Main St,High Grass,Junk Vehicle,overgrown weeds in yard',
    '200 Oak Ave,Trash,Fence Permit,debris pile'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'col-03-scorer-vs-promote.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Issue Type'
  });

  assert.equal(result.ok, true, 'COL-03 process must succeed');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Issue Type',
    'COL-03: scorer must map Issue Type (not Cat)'
  );

  const grass =
    result.rows.find((row) => String(row.streetAddress || '').includes('100 Main')) ||
    result.notDistressedRows.find((row) =>
      String(row.streetAddress || '').includes('100 Main')
    );
  assert.ok(grass, 'COL-03: High Grass row must be kept');
  assert.ok(
    String(grass.violationIssueType || '').includes('High Grass'),
    `COL-03: type must stay scorer Issue Type value High Grass, got: ${grass.violationIssueType}`
  );
  assert.ok(
    !/Junk Vehicle/i.test(String(grass.violationIssueType || '')),
    `COL-03: promote must not replace non-empty scorer cell with Cat, got: ${grass.violationIssueType}`
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 52 GATE-02/03/04/06 + META-01 confirm-gate contracts (green after 52-03)
// ═══════════════════════════════════════════════════════════════════════════

/** Shared code_violation CSV with Status Description trap + Vio Cat Type column. */
function gateTypeConfirmCsv() {
  return [
    'Property Address,Status Description,Vio Cat,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');
}

test('GATE-02: first code_violation process without confirm rejects TYPE_COLUMN_CONFIRM_REQUIRED', async () => {
  // Empty formats root (before hook) + no confirmedTypeHeader → must refuse before rows.
  await assert.rejects(
    () =>
      processUpload({
        buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
        filename: 'gate-first-upload.csv',
        city: CITY,
        uploadType: 'code_violation'
      }),
    (err) => {
      assert.equal(
        err && err.code,
        'TYPE_COLUMN_CONFIRM_REQUIRED',
        `GATE-02: expected TYPE_COLUMN_CONFIRM_REQUIRED, got ${err && err.code}`
      );
      return true;
    }
  );
});

test('GATE-04: TYPE_COLUMN_CONFIRM_REQUIRED details include fingerprint, candidates, suggestedHeader', async () => {
  let caught;
  try {
    await processUpload({
      buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
      filename: 'gate-409-details.csv',
      city: CITY,
      uploadType: 'code_violation'
    });
  } catch (err) {
    caught = err;
  }

  assert.ok(caught, 'GATE-04: process must throw when confirm required');
  assert.equal(caught.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');

  const details = caught.details || caught;
  assert.ok(
    typeof details.formatFingerprint === 'string' && details.formatFingerprint.length > 0,
    'GATE-04: details.formatFingerprint must be non-empty string'
  );
  assert.ok(Array.isArray(details.candidates), 'GATE-04: details.candidates must be array');
  assert.ok(details.candidates.length >= 1, 'GATE-04: candidates length >= 1');
  const first = details.candidates[0];
  assert.ok(first && typeof first.header === 'string', 'GATE-04: candidate.header required');
  assert.ok(
    typeof first.score === 'number' || first.score === null,
    'GATE-04: candidate.score number|null'
  );
  assert.ok(
    details.suggestedHeader === null || typeof details.suggestedHeader === 'string',
    'GATE-04: suggestedHeader string or null'
  );
});

test('GATE-04: admin resume with confirmedTypeHeader Vio Cat succeeds (admin_confirm)', async () => {
  const result = await processUpload({
    buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
    filename: 'gate-admin-confirm.csv',
    city: CITY,
    uploadType: 'code_violation',
    confirmedTypeHeader: 'Vio Cat',
    username: 'admin'
  });

  assert.equal(result.ok, true, 'GATE-04: admin confirm resume must succeed');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Vio Cat',
    'GATE-04: columnMap.violationIssueType must be confirmed Vio Cat'
  );

  const tr = result.processingMeta.typeResolution;
  assert.ok(tr, 'META-01/GATE-04: processingMeta.typeResolution required on success');
  assert.equal(tr.source, 'admin_confirm');
  assert.equal(tr.header, 'Vio Cat');
  assert.ok(
    typeof tr.fingerprint === 'string' && tr.fingerprint.length > 0,
    'GATE-04: typeResolution.fingerprint non-empty'
  );
});

test('GATE-03 / TEST-02 (v1.8): matching fingerprint reuses confirmed Type without confirm field (auto_reuse)', async () => {
  // Seed memory via admin confirm, then process again without confirmedTypeHeader.
  const seed = await processUpload({
    buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
    filename: 'gate-reuse-seed.csv',
    city: CITY,
    uploadType: 'code_violation',
    confirmedTypeHeader: 'Vio Cat',
    username: 'admin'
  });
  assert.equal(seed.ok, true, 'GATE-03 seed confirm must succeed');

  const result = await processUpload({
    buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
    filename: 'gate-reuse-second.csv',
    city: CITY,
    uploadType: 'code_violation'
    // no confirmedTypeHeader — memory fingerprint match must auto-reuse
  });

  assert.equal(result.ok, true, 'GATE-03: reuse process must succeed without confirm field');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Vio Cat',
    'GATE-03: columnMap must remain confirmed Vio Cat'
  );
  const tr = result.processingMeta.typeResolution;
  assert.ok(tr, 'GATE-03: typeResolution required');
  assert.equal(tr.source, 'auto_reuse');
  assert.equal(tr.header, 'Vio Cat');
  assert.equal(tr.formatMatched, true);
});

test('GATE-04: confirmedTypeHeader __none__ forces no Type column without silent drop', async () => {
  const noTypeCity = { id: 'test-no-type-city', city: 'NoTypeVille', state: 'Arizona' };
  const result = await processUpload({
    buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
    filename: 'gate-none-type.csv',
    city: noTypeCity,
    uploadType: 'code_violation',
    confirmedTypeHeader: '__none__',
    username: 'admin'
  });

  assert.equal(result.ok, true, 'GATE-04 none: process must succeed');
  const typeMap = result.processingMeta.columnMap.violationIssueType;
  assert.ok(
    typeMap == null || typeMap === '',
    `GATE-04 none: Type map must be falsy, got: ${typeMap}`
  );

  const tr = result.processingMeta.typeResolution;
  assert.ok(tr, 'GATE-04 none: typeResolution required');
  assert.ok(
    tr.source === 'admin_confirm' || tr.source === 'unresolved',
    `GATE-04 none: source admin_confirm|unresolved, got: ${tr.source}`
  );
  assert.equal(tr.header, null);

  const keptOrFn =
    result.rows.find((row) => String(row.streetAddress || '').includes('100 Main')) ||
    (result.notDistressedRows || []).find((row) =>
      String(row.streetAddress || '').includes('100 Main')
    );
  assert.ok(keptOrFn, 'GATE-04 none: must not silently drop all rows solely for no type');
});

test('META-01: success typeResolution has header, score, source enum, fingerprint, formatMatched', async () => {
  const result = await processUpload({
    buffer: Buffer.from(gateTypeConfirmCsv(), 'utf8'),
    filename: 'gate-meta-shape.csv',
    city: { id: 'meta-shape-city', city: 'MetaCity', state: 'Arizona' },
    uploadType: 'code_violation',
    confirmedTypeHeader: 'Vio Cat',
    username: 'admin'
  });

  assert.equal(result.ok, true);
  const tr = result.processingMeta.typeResolution;
  assert.ok(tr && typeof tr === 'object', 'META-01: typeResolution object required');
  assert.ok(
    tr.header === null || typeof tr.header === 'string',
    'META-01: header string|null'
  );
  assert.ok(
    tr.score === null || typeof tr.score === 'number',
    'META-01: score number|null'
  );
  assert.ok(
    ['auto_reuse', 'admin_confirm', 'scorer', 'unresolved'].includes(tr.source),
    `META-01: source enum, got: ${tr.source}`
  );
  assert.ok(
    typeof tr.fingerprint === 'string' && tr.fingerprint.length > 0,
    'META-01: fingerprint non-empty string'
  );
  assert.equal(typeof tr.formatMatched, 'boolean', 'META-01: formatMatched boolean');
});

test('GATE-06: processUploadBatch mixed headers asks multi-format confirm (not hard FORMAT_MISMATCH)', async () => {
  const fileA = [
    'Property Address,Status Description,Vio Cat,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');
  // Different header multiset — Issue Type instead of Vio Cat (distinct fingerprint).
  const fileB = [
    'Property Address,Status Description,Issue Type,Open Date',
    '200 Oak Ave,Open,Trash,02/01/2024'
  ].join('\n');

  let gateErr;
  try {
    await processUploadBatch(
      [
        { filename: 'mixed-a.csv', data: Buffer.from(fileA, 'utf8') },
        { filename: 'mixed-b.csv', data: Buffer.from(fileB, 'utf8') }
      ],
      {
        city: { id: 'gate-mixed-batch-city', city: 'MixedTown', state: 'Arizona' },
        uploadType: 'code_violation'
      }
    );
  } catch (err) {
    gateErr = err;
  }
  assert.ok(gateErr, 'GATE-06 mixed: must refuse without confirms');
  assert.equal(gateErr.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');
  assert.notEqual(gateErr.code, 'FORMAT_MISMATCH');
  assert.ok(Array.isArray(gateErr.details?.formats), 'GATE-06 mixed: formats[] for each sheet');
  assert.equal(gateErr.details.formats.length, 2, 'GATE-06 mixed: two formats need confirm');
  assert.equal(gateErr.details.multiFormat, true);
});

test('GATE-06: processUploadBatch mixed headers succeed with per-format confirmedFormats', async () => {
  const fileA = [
    'Property Address,Status Description,Vio Cat,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');
  const fileB = [
    'Property Address,Status Description,Issue Type,Open Date',
    '200 Oak Ave,Open,Junk vehicles,02/01/2024'
  ].join('\n');
  const city = {
    id: 'gate-mixed-confirm-city',
    city: 'MixedConfirm',
    state: 'Arizona'
  };

  let gateErr;
  try {
    await processUploadBatch(
      [
        { filename: 'mixed-a.csv', data: Buffer.from(fileA, 'utf8') },
        { filename: 'mixed-b.csv', data: Buffer.from(fileB, 'utf8') }
      ],
      { city, uploadType: 'code_violation' }
    );
  } catch (err) {
    gateErr = err;
  }
  assert.equal(gateErr?.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');
  const formats = gateErr.details.formats;
  assert.equal(formats.length, 2);

  // Map each fingerprint to the correct Type header for that sheet
  const confirmedFormats = formats.map((f) => {
    const names = (f.filenames || []).join(' ');
    if (/mixed-a/i.test(names)) {
      return {
        formatFingerprint: f.formatFingerprint,
        confirmedTypeHeader: 'Vio Cat',
        filenames: f.filenames || ['mixed-a.csv']
      };
    }
    return {
      formatFingerprint: f.formatFingerprint,
      confirmedTypeHeader: 'Issue Type',
      filenames: f.filenames || ['mixed-b.csv']
    };
  });

  const result = await processUploadBatch(
    [
      { filename: 'mixed-a.csv', data: Buffer.from(fileA, 'utf8') },
      { filename: 'mixed-b.csv', data: Buffer.from(fileB, 'utf8') }
    ],
    {
      city,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedFormats
    }
  );
  assert.equal(result.ok, true);
  assert.ok(result.stats.kept >= 2, `expected both files kept, got ${result.stats.kept}`);
  assert.equal(result.processingMeta.multiFormat, true);
  // Each file meta should carry its own type header
  const metas = result.processingMeta.files || [];
  assert.ok(metas.length >= 2);
  const headers = metas.map((m) => m.typeHeader).filter(Boolean);
  assert.ok(headers.includes('Vio Cat'), `expected Vio Cat in ${headers}`);
  assert.ok(headers.includes('Issue Type'), `expected Issue Type in ${headers}`);
});

test('GATE-06: confirmedFormats by filename still process when fingerprint drifts', async () => {
  const fileA = [
    'Property Address,Status Description,Vio Cat,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');
  const fileB = [
    'Property Address,Status Description,Issue Type,Open Date',
    '200 Oak Ave,Open,Junk vehicles,02/01/2024'
  ].join('\n');
  const city = {
    id: 'gate-filename-confirm-city',
    city: 'FileNameTown',
    state: 'Arizona'
  };

  let gateErr;
  try {
    await processUploadBatch(
      [
        { filename: 'mixed-a.csv', data: Buffer.from(fileA, 'utf8') },
        { filename: 'mixed-b.csv', data: Buffer.from(fileB, 'utf8') }
      ],
      { city, uploadType: 'code_violation' }
    );
  } catch (err) {
    gateErr = err;
  }
  assert.equal(gateErr?.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');
  const formats = gateErr.details.formats;
  assert.equal(formats.length, 2);

  // Intentionally wrong fingerprints — only filenames carry the mapping (PDF drift case)
  const confirmedFormats = formats.map((f) => {
    const names = f.filenames || [];
    const isA = names.some((n) => /mixed-a/i.test(n));
    return {
      formatFingerprint: 'stale-or-wrong-fingerprint-' + (isA ? 'a' : 'b'),
      confirmedTypeHeader: isA ? 'Vio Cat' : 'Issue Type',
      filenames: names
    };
  });

  const result = await processUploadBatch(
    [
      { filename: 'mixed-a.csv', data: Buffer.from(fileA, 'utf8') },
      { filename: 'mixed-b.csv', data: Buffer.from(fileB, 'utf8') }
    ],
    {
      city,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedFormats
    }
  );
  assert.equal(result.ok, true);
  assert.ok(result.stats.kept >= 2, `expected both files kept, got ${result.stats.kept}`);
});

test('GATE-06: processUploadBatch same fingerprint can confirm once / reuse path', async () => {
  const sameCsv = gateTypeConfirmCsv();
  const sameCity = {
    id: 'gate-same-fp-batch-city',
    city: 'SameFormat',
    state: 'Arizona'
  };

  // Without confirm: both files need confirm (same fingerprint) → hard refuse, not partial merge.
  await assert.rejects(
    () =>
      processUploadBatch(
        [
          { filename: 'same-a.csv', data: Buffer.from(sameCsv, 'utf8') },
          { filename: 'same-b.csv', data: Buffer.from(sameCsv, 'utf8') }
        ],
        { city: sameCity, uploadType: 'code_violation' }
      ),
    (err) => err && err.code === 'TYPE_COLUMN_CONFIRM_REQUIRED'
  );

  // With admin confirm on batch context: one confirm applies to shared fingerprint.
  const confirmed = await processUploadBatch(
    [
      { filename: 'same-a.csv', data: Buffer.from(sameCsv, 'utf8') },
      { filename: 'same-b.csv', data: Buffer.from(sameCsv, 'utf8') }
    ],
    {
      city: sameCity,
      uploadType: 'code_violation',
      confirmedTypeHeader: 'Vio Cat',
      username: 'admin'
    }
  );
  assert.equal(confirmed.ok, true, 'GATE-06 same-fp: confirm path must succeed');
  assert.equal(
    confirmed.processingMeta.columnMap.violationIssueType,
    'Vio Cat',
    'GATE-06 same-fp: shared Type map is Vio Cat'
  );
});

test('GATE water skip: water_shut_off processes without TYPE_COLUMN_CONFIRM_REQUIRED', async () => {
  // Empty formats root — water must not hit Type confirm gate.
  let threw = null;
  let result;
  try {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'water-shutoffs.txt'));
    result = await processUpload({
      buffer,
      filename: 'shutoffs-gate-skip.txt',
      city: CITY,
      uploadType: 'water_shut_off'
    });
  } catch (err) {
    threw = err;
  }

  assert.ok(
    !threw || threw.code !== 'TYPE_COLUMN_CONFIRM_REQUIRED',
    `water_shut_off must not throw TYPE_COLUMN_CONFIRM_REQUIRED, got: ${threw && threw.code}`
  );
  assert.ok(result && result.ok !== false, 'water process should complete');
  assert.ok(result.stats.kept >= 1, 'water keep at least one row');
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 54 / v1.8 regression lock — processUpload composition contracts
// Do not overwrite v1.7 (TEST-01|02|03) semantics above.
// ═══════════════════════════════════════════════════════════════════════════

test('TEST-01 (v1.8): Status Description trap → 409 suggestedHeader is Vio Cat (scorer on process path)', async () => {
  // No confirmedTypeHeader: live scorer must suggest Vio Cat over alias-first Status Description.
  const csv = [
    'Property Address,Status Description,Vio Cat,Description,Open Date',
    '100 Main St,Open,High Grass,Weeds exceeding 12 inches as of 01/15/2024 10:30,01/15/2024',
    '200 Oak Ave,Closed,Trash,Junk in yard observed 02/01/2024 09:00,02/01/2024'
  ].join('\n');

  let caught;
  try {
    await processUpload({
      buffer: Buffer.from(csv, 'utf8'),
      filename: 'v18-test01-trap.csv',
      city: { id: 'v18-col-trap-city', city: 'TrapTown', state: 'Arizona' },
      uploadType: 'code_violation'
    });
  } catch (err) {
    caught = err;
  }

  assert.ok(caught, 'TEST-01 (v1.8): process must throw without confirm');
  assert.equal(
    caught.code,
    'TYPE_COLUMN_CONFIRM_REQUIRED',
    `TEST-01 (v1.8): expected TYPE_COLUMN_CONFIRM_REQUIRED, got ${caught.code}`
  );
  const details = caught.details || caught;
  assert.equal(
    details.suggestedHeader,
    'Vio Cat',
    'TEST-01 (v1.8): scorer suggestedHeader must beat Status Description on process path'
  );
});

test('TEST-01 (v1.8): processUpload maps Type to Vio Cat; cells High Grass not Open', async () => {
  const csv = [
    'Property Address,Status Description,Vio Cat,Description,Open Date',
    '100 Main St,Open,High Grass,Weeds exceeding 12 inches as of 01/15/2024 10:30,01/15/2024',
    '200 Oak Ave,Closed,Trash,Junk in yard observed 02/01/2024 09:00,02/01/2024'
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'v18-test01-map-cells.csv',
    city: { id: 'v18-col-map-city', city: 'MapTown', state: 'Arizona' },
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
  });

  assert.equal(result.ok, true, 'TEST-01 (v1.8): process must succeed with confirmed Type');
  assert.equal(
    result.processingMeta.columnMap.violationIssueType,
    'Vio Cat',
    'TEST-01 (v1.8): columnMap.violationIssueType must be Vio Cat'
  );
  assert.notEqual(
    result.processingMeta.columnMap.violationIssueType,
    'Status Description',
    'TEST-01 (v1.8): Type map must not be Status Description'
  );

  const grass =
    result.rows.find((row) => String(row.streetAddress || '').includes('100 Main')) ||
    (result.notDistressedRows || []).find((row) =>
      String(row.streetAddress || '').includes('100 Main')
    );
  assert.ok(grass, 'TEST-01 (v1.8): High Grass row must be kept');
  assert.ok(
    String(grass.violationIssueType || '').includes('High Grass'),
    `TEST-01 (v1.8): type cell must include High Grass not Open, got: ${grass.violationIssueType}`
  );
  assert.ok(
    !/^Open$/i.test(String(grass.violationIssueType || '').trim()),
    `TEST-01 (v1.8): type must not be bare Open, got: ${grass.violationIssueType}`
  );
});

test('TEST-02 (v1.8): fingerprint change after confirm requires TYPE_COLUMN_CONFIRM_REQUIRED again', async () => {
  // Dedicated city so GATE-02/03 on CITY stay stable.
  const city = { id: 'v18-fp-change-city', city: 'FpChange', state: 'Arizona' };
  const formatA = [
    'Property Address,Status Description,Vio Cat,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');
  // Different header multiset (rename Type column) — not reorder, not cell-only.
  const formatB = [
    'Property Address,Status Description,Issue Type,Open Date',
    '100 Main St,Open,High Grass,01/15/2024'
  ].join('\n');

  const seed = await processUpload({
    buffer: Buffer.from(formatA, 'utf8'),
    filename: 'v18-fp-a.csv',
    city,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
  });
  assert.equal(seed.ok, true, 'TEST-02 (v1.8): format A admin confirm must succeed');

  await assert.rejects(
    () =>
      processUpload({
        buffer: Buffer.from(formatB, 'utf8'),
        filename: 'v18-fp-b.csv',
        city,
        uploadType: 'code_violation'
        // no confirmedTypeHeader — fingerprint change must reconfirm
      }),
    (err) => {
      assert.equal(
        err && err.code,
        'TYPE_COLUMN_CONFIRM_REQUIRED',
        `TEST-02 (v1.8): fingerprint change must require confirm again, got ${err && err.code}`
      );
      return true;
    }
  );

  // Optional strengthen: admin can confirm the new format.
  const confirmedB = await processUpload({
    buffer: Buffer.from(formatB, 'utf8'),
    filename: 'v18-fp-b-confirm.csv',
    city,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Issue Type'
  });
  assert.equal(confirmedB.ok, true, 'TEST-02 (v1.8): format B admin confirm must succeed');
  assert.equal(
    confirmedB.processingMeta.columnMap.violationIssueType,
    'Issue Type',
    'TEST-02 (v1.8): format B Type map is Issue Type'
  );
});

test('TEST-03 (v1.8): processUpload long type → shortLabel; full label/keys/row type preserved', async () => {
  // Long ordinance-style type that still tags Strong Distressed (High Grass / weeds).
  const longType =
    'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels and enforcement procedures';
  const csv = [
    'Property Address,Violation Type,Notes',
    `100 Main St,"${longType}",inspector field notes`,
    `200 Oak Ave,"${longType}",second parcel`
  ].join('\n');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'v18-shortlabel.csv',
    city: { id: 'v18-lbl-city', city: 'LabelVille', state: 'Arizona' },
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });

  assert.equal(result.ok, true, 'TEST-03 (v1.8): process must succeed');
  assert.ok(result.rows.length >= 1, 'TEST-03 (v1.8): at least one kept row');

  const groups = [
    ...(result.reviewGroups && result.reviewGroups.distressed
      ? result.reviewGroups.distressed
      : []),
    ...(result.reviewGroups && result.reviewGroups.notDistressed
      ? result.reviewGroups.notDistressed
      : [])
  ];
  const g = groups.find((x) => /high grass/i.test(x.violationTypeLabel || ''));
  assert.ok(g, 'TEST-03 (v1.8): distressed/group with High Grass full label exists');
  assert.equal(typeof g.shortLabel, 'string', 'TEST-03 (v1.8): shortLabel must be string');
  assert.ok(
    g.shortLabel.length <= 64,
    `TEST-03 (v1.8): shortLabel length <= 64, got ${g.shortLabel.length}`
  );
  assert.ok(
    g.shortLabel.length < g.violationTypeLabel.length,
    'TEST-03 (v1.8): shortLabel shorter than full violationTypeLabel'
  );
  assert.ok(
    g.violationTypeLabel.includes('Sec.') ||
      g.violationTypeLabel.length > g.shortLabel.length,
    'TEST-03 (v1.8): full label still long / contains Sec.'
  );
  assert.ok(
    !String(g.violationTypeKey || '').includes('…'),
    'TEST-03 (v1.8): group key must not be hard-sliced display (no ellipsis)'
  );

  const row = result.rows.find((r) => String(r.streetAddress || '').includes('100 Main'));
  assert.ok(row, 'TEST-03 (v1.8): 100 Main row present');
  assert.ok(
    String(row.violationIssueType || '').includes('High Grass'),
    `TEST-03 (v1.8): row type includes High Grass, got: ${row.violationIssueType}`
  );
  assert.ok(
    String(row.violationIssueType || '').length >= g.shortLabel.length,
    'TEST-03 (v1.8): stored row type is full (length >= shortLabel)'
  );
});
