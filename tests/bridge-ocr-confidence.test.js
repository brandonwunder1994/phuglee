/**
 * Wave 1 Task 1.4 — OCR confidence not inflated after family→xlsx rebuild.
 * Structured AOA→xlsx creates a real street column; that must not force
 * confidenceLevel: high when OCR word confidence is medium/low.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalBrainRoot = config.BRIDGE_BRAIN_ROOT;
const originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
let tempBrainRoot;
let tempFormatsRoot;

before(() => {
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-ocr-conf-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-ocr-conf-'));
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

const { assessConfidence } = require('../lib/bridge-engine/validator');
const { normalizeRawRows } = require('../lib/bridge-engine/normalizer');
const { parseAoaAsSpreadsheet } = require('../lib/bridge-engine/parsers/pdf');
const { processUpload } = require('../lib/bridge-engine');

const CITY = { city: 'OcrConfTestCity', state: 'GA' };

const FAMILY_AOA = [
  ['Record ID', 'Location', 'Violation Type', 'Description'],
  ['GENF26-0001', '100 Oak Street', 'TRASH', 'debris in yard'],
  ['GENF26-0002', '200 Pine Avenue', 'TALL GRASS', 'grass over 12 inches'],
  ['GENF26-0003', '300 Maple Drive', 'JUNK VEHICLE', 'inoperable vehicle']
];

test('assessConfidence: street column alone is high for tabular', () => {
  assert.equal(assessConfidence({ streetAddress: 'Location' }), 'high');
});

test('assessConfidence: low OCR score caps at low even with street column', () => {
  assert.equal(
    assessConfidence({ streetAddress: 'Location' }, { ocrConfidence: 42 }),
    'low'
  );
});

test('assessConfidence: medium OCR score (60–84) is medium with street column', () => {
  assert.equal(
    assessConfidence({ streetAddress: 'Location' }, { ocrConfidence: 72 }),
    'medium'
  );
  assert.equal(
    assessConfidence({ streetAddress: 'Location' }, { ocrConfidence: 0.72 }),
    'medium'
  );
});

test('assessConfidence: high OCR score (≥85) stays high with street column', () => {
  assert.equal(
    assessConfidence({ streetAddress: 'Location' }, { ocrConfidence: 90 }),
    'high'
  );
});

test('assessConfidence: fromOcr without score defaults to medium', () => {
  assert.equal(
    assessConfidence({ streetAddress: 'Location' }, { fromOcr: true }),
    'medium'
  );
});

test('normalizeRawRows: low ocrConfidence → kept rows not high', () => {
  const headers = ['Street Address', 'Violation/Issue Type'];
  const rawRows = [
    { 'Street Address': '10 Test Lane', 'Violation/Issue Type': 'weeds' },
    { 'Street Address': '20 Test Lane', 'Violation/Issue Type': 'trash' }
  ];
  const normalized = normalizeRawRows(rawRows, headers, {
    city: CITY,
    uploadType: 'code_violation',
    sourceFile: 'scan.xlsx',
    processedAt: new Date().toISOString(),
    ocrConfidence: 55,
    fromOcr: true
  });
  assert.ok(normalized.kept.length >= 2, 'expected kept address rows');
  for (const row of normalized.kept) {
    assert.notEqual(
      row.confidenceLevel,
      'high',
      `OCR low conf row inflated to high: ${row.streetAddress}`
    );
    assert.equal(row.confidenceLevel, 'low');
    assert.equal(row.needsReview, true);
  }
});

test('parseAoaAsSpreadsheet + normalize: family rebuild does not force high', () => {
  const parsed = parseAoaAsSpreadsheet(FAMILY_AOA, {
    parseMode: 'enforcement-detail-ocr-to-xlsx',
    fromOcr: true,
    ocrConfidence: 71,
    filename: 'orr-rebuild.xlsx',
    sheetName: 'Enforcement Detail'
  });
  assert.ok(parsed.rows.length >= 3);
  // Spreadsheet path has a real Location column — tabular assess alone would say high
  const normalized = normalizeRawRows(parsed.rows, parsed.headers, {
    city: CITY,
    uploadType: 'code_violation',
    sourceFile: 'orr-rebuild.xlsx',
    processedAt: new Date().toISOString(),
    ocrConfidence: parsed.ocrConfidence,
    fromOcr: parsed.fromOcr === true || /ocr/i.test(String(parsed.parseMode || ''))
  });
  assert.ok(normalized.kept.length >= 2, `kept=${normalized.kept.length}`);
  const levels = normalized.kept.map((r) => r.confidenceLevel);
  assert.ok(
    levels.every((l) => l !== 'high'),
    `expected no high after OCR rebuild, got ${levels.join(',')}`
  );
  assert.ok(
    levels.every((l) => l === 'medium'),
    `ocrConfidence 71 → medium, got ${levels.join(',')}`
  );
});

test('processUpload: mocked OCR family parse preserves medium confidence', async () => {
  const pdfPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const originalParsePdf = require(pdfPath).parsePdf;

  const rebuilt = parseAoaAsSpreadsheet(FAMILY_AOA, {
    parseMode: 'enforcement-detail-ocr-to-xlsx',
    fromOcr: true,
    ocrConfidence: 68,
    filename: 'family-ocr.xlsx',
    sheetName: 'Enforcement Detail'
  });

  require.cache[pdfPath].exports.parsePdf = async () => ({
    ...rebuilt,
    parser: 'pdf-xlsx',
    fromOcr: true,
    ocrConfidence: 68
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from('%PDF-1.4 mock'),
      filename: 'family-scan.pdf',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    assert.ok(result.rows.length >= 2, `rows=${result.rows.length}`);
    const highs = result.rows.filter((r) => r.confidenceLevel === 'high');
    assert.equal(
      highs.length,
      0,
      `OCR rebuild must not inflate to high; levels=${result.rows.map((r) => r.confidenceLevel).join(',')}`
    );
    assert.ok(
      result.rows.every((r) => r.confidenceLevel === 'medium'),
      `expected medium for ocrConfidence 68`
    );
    assert.equal(result.processingMeta.ocrConfidence, 68);
  } finally {
    require.cache[pdfPath].exports.parsePdf = originalParsePdf;
    delete require.cache[enginePath];
  }
});
