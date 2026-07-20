/**
 * Wave 1 Task 1.1 — OCR truncation must surface on processUpload processingMeta.
 * Never silent page loss: UI (Task 1.2) will read these fields.
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
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-ocr-meta-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-ocr-meta-'));
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

const { MAX_OCR_PAGES } = require('../lib/bridge-engine/parsers/pdf-ocr');

const CITY = 'OcrMetaTestCity';

function truncatedParseResult(overrides = {}) {
  return {
    parser: 'pdf-xlsx',
    parseMode: 'enforcement-detail-ocr-to-xlsx',
    headers: ['Street Address', 'Violation Type'],
    rows: [
      {
        'Street Address': '100 Truncated Ln',
        'Violation Type': 'Overgrown weeds'
      },
      {
        'Street Address': '200 Cap Ave',
        'Violation Type': 'Accumulation of trash'
      }
    ],
    pageCount: 12,
    ocrTruncated: true,
    ocrMaxPages: 12,
    ocrTotalPages: 40,
    ocrPageCapNote: 'OCR stopped at page cap (12).',
    ocrConfidence: 71,
    redactedSkipped: 3,
    rotatedBy: [270, 270, 0],
    ...overrides
  };
}

/**
 * Mock parsePdf so processUpload sees OCR truncation flags without real OCR.
 */
function withMockedParsePdf(mockParsed, fn) {
  const pdfPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const pdfMod = require(pdfPath);
  const originalParsePdf = pdfMod.parsePdf;

  pdfMod.parsePdf = async () => mockParsed;
  delete require.cache[enginePath];
  const engine = require('../lib/bridge-engine');

  return Promise.resolve()
    .then(() => fn(engine))
    .finally(() => {
      pdfMod.parsePdf = originalParsePdf;
      delete require.cache[enginePath];
    });
}

test('OCR-META-01: processUpload copies ocrTruncated + page cap fields into processingMeta', async () => {
  await withMockedParsePdf(truncatedParseResult(), async ({ processUpload }) => {
    const result = await processUpload({
      buffer: Buffer.from('%PDF-1.4 truncated-ocr'),
      filename: 'scan-cap.pdf',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });

    const meta = result.processingMeta;
    assert.equal(meta.ocrTruncated, true, 'ocrTruncated must surface');
    assert.equal(meta.ocrPagesProcessed, 12, 'pages actually OCR’d');
    assert.equal(meta.ocrPagesTotal, 40, 'total PDF pages when known');
    assert.equal(meta.ocrPageCap, 12, 'cap used');
    assert.equal(meta.ocrPageCap, MAX_OCR_PAGES);
    assert.equal(meta.redactedSkipped, 3);
    assert.deepEqual(meta.rotatedBy, [270, 270, 0]);
    // Existing pageCount / ocrConfidence preserved
    assert.equal(meta.pageCount, 12);
    assert.equal(meta.ocrConfidence, 71);
  });
});

test('OCR-META-02: processUpload sets ocrTruncated false and null page counts when not OCR-truncated', async () => {
  const csv = [
    'Property Address,Violation Type',
    '10 Clear St,Overgrown weeds',
    '20 Clear St,Accumulation of trash'
  ].join('\n');

  delete require.cache[require.resolve('../lib/bridge-engine')];
  const { processUpload } = require('../lib/bridge-engine');

  const result = await processUpload({
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'plain.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });

  const meta = result.processingMeta;
  assert.equal(meta.ocrTruncated, false);
  assert.equal(meta.ocrPagesProcessed, null);
  assert.equal(meta.ocrPagesTotal, null);
  assert.equal(typeof meta.ocrPageCap, 'number');
  assert.equal(meta.ocrPageCap, MAX_OCR_PAGES);
  assert.equal(meta.redactedSkipped, null);
  assert.equal(meta.rotatedBy, null);
});

test('OCR-META-03: mergeProcessResults any-file truncated → merged ocrTruncated; pages summed', async () => {
  delete require.cache[require.resolve('../lib/bridge-engine')];
  const { mergeProcessResults } = require('../lib/bridge-engine');

  const base = {
    ok: true,
    stub: false,
    city: CITY,
    uploadType: 'code_violation',
    stats: {
      totalParsed: 2,
      kept: 2,
      discarded: 0,
      deduplicated: 0,
      alreadyImported: 0,
      noDistress: 0,
      lowConfidence: 0,
      needsReview: 0,
      discardReasons: {},
      byTag: {},
      byConfidence: {}
    },
    rows: [
      {
        streetAddress: '1 Merge St',
        distressedSignalTag: 'code_violation',
        confidenceLevel: 'high'
      }
    ],
    notDistressedRows: [],
    discarded: [],
    reviewGroups: { distressed: [], notDistressed: [] }
  };

  const a = {
    ...base,
    sourceFile: 'a.pdf',
    rows: [{ streetAddress: '1 Merge St', distressedSignalTag: 'code_violation', confidenceLevel: 'high' }],
    processingMeta: {
      parser: 'pdf-xlsx',
      durationMs: 10,
      ocrTruncated: true,
      ocrPagesProcessed: 12,
      ocrPagesTotal: 30,
      ocrPageCap: 12,
      redactedSkipped: 2,
      rotatedBy: [90]
    }
  };
  const b = {
    ...base,
    sourceFile: 'b.pdf',
    rows: [{ streetAddress: '2 Merge St', distressedSignalTag: 'code_violation', confidenceLevel: 'high' }],
    processingMeta: {
      parser: 'pdf-xlsx',
      durationMs: 5,
      ocrTruncated: false,
      ocrPagesProcessed: 4,
      ocrPagesTotal: 4,
      ocrPageCap: 12,
      redactedSkipped: 1,
      rotatedBy: null
    }
  };

  const merged = mergeProcessResults([a, b], { city: CITY, uploadType: 'code_violation' });
  const meta = merged.processingMeta;
  assert.equal(meta.ocrTruncated, true, 'any-file truncated wins');
  assert.equal(meta.ocrPagesProcessed, 16, 'sum processed pages across files');
  assert.equal(meta.ocrPagesTotal, 34, 'sum total pages across files');
  assert.equal(meta.ocrPageCap, 12, 'max/shared page cap');
  assert.equal(meta.redactedSkipped, 3, 'sum redactedSkipped');
  // Multi-file: rotatedBy not meaningful as a single value
  assert.equal(meta.rotatedBy, null);
});

test('OCR-META-04: prefers explicit ocrPagesProcessed / ocrPagesTotal / ocrPageCap aliases', async () => {
  await withMockedParsePdf(
    truncatedParseResult({
      pageCount: 99,
      ocrPagesProcessed: 8,
      ocrPagesTotal: 22,
      ocrPageCap: 10,
      ocrMaxPages: 12,
      ocrTotalPages: 40
    }),
    async ({ processUpload }) => {
      const result = await processUpload({
        buffer: Buffer.from('%PDF-1.4 alias'),
        filename: 'alias.pdf',
        city: CITY,
        uploadType: 'code_violation',
        username: 'admin',
        confirmedTypeHeader: 'Violation Type'
      });
      const meta = result.processingMeta;
      assert.equal(meta.ocrPagesProcessed, 8);
      assert.equal(meta.ocrPagesTotal, 22);
      assert.equal(meta.ocrPageCap, 10);
    }
  );
});


test('OCR-META-05: attachOcrHonestyFields preserves truncation when text-path shape wins', () => {
  const {
    attachOcrHonestyFields,
    captureOcrHonesty
  } = require('../lib/bridge-engine/parsers/pdf');

  const honesty = captureOcrHonesty({
    text: 'ocr body',
    ocrTruncated: true,
    ocrMaxPages: 12,
    ocrTotalPages: 40,
    ocrPageCapNote: 'OCR stopped at page cap (12).',
    rotatedBy: [270, 0]
  });
  assert.equal(honesty.ocrTruncated, true);
  assert.equal(honesty.ocrMaxPages, 12);
  assert.equal(honesty.ocrTotalPages, 40);

  // Simulate embedded-text path winning the street contest after OCR ran
  const textWin = {
    parser: 'pdf-xlsx',
    parseMode: 'text-table-to-xlsx',
    headers: ['Street Address', 'Violation Type'],
    rows: [
      { 'Street Address': '1 Text Wins St', 'Violation Type': 'Overgrown weeds' }
    ],
    pageCount: 12
  };
  const out = attachOcrHonestyFields(textWin, honesty);
  assert.equal(out.ocrTruncated, true, 'truncation must attach even when text path wins');
  assert.equal(out.ocrMaxPages, 12);
  assert.equal(out.ocrTotalPages, 40);
  assert.equal(out.ocrPageCapNote, 'OCR stopped at page cap (12).');
  assert.deepEqual(out.rotatedBy, [270, 0]);
  assert.equal(out.parseMode, 'text-table-to-xlsx', 'text path shape preserved');
});

test('OCR-META-06: attach no-ops when OCR never ran (honesty null)', () => {
  const { attachOcrHonestyFields } = require('../lib/bridge-engine/parsers/pdf');
  const plain = { parser: 'pdf-xlsx', parseMode: 'text-table-to-xlsx', rows: [] };
  const out = attachOcrHonestyFields(plain, null);
  assert.equal(out.ocrTruncated, undefined);
  assert.equal(attachOcrHonestyFields(null, { ocrTruncated: true }), null);
});

test('OCR-META-07: processUpload text-path-win parse + truncated flags → meta.ocrTruncated', async () => {
  const { attachOcrHonestyFields, captureOcrHonesty } = require('../lib/bridge-engine/parsers/pdf');
  const honesty = captureOcrHonesty({
    ocrTruncated: true,
    ocrMaxPages: 12,
    ocrTotalPages: 40,
    ocrPageCapNote: 'OCR stopped at page cap (12).',
    rotatedBy: [90]
  });
  const textPathWin = attachOcrHonestyFields(
    {
      parser: 'pdf-xlsx',
      parseMode: 'text-table-to-xlsx',
      headers: ['Street Address', 'Violation Type'],
      rows: [
        { 'Street Address': '50 Text Path Ave', 'Violation Type': 'Accumulation of trash' },
        { 'Street Address': '51 Text Path Ave', 'Violation Type': 'Overgrown weeds' }
      ],
      pageCount: 12,
      ocrConfidence: 68
    },
    honesty
  );

  await withMockedParsePdf(textPathWin, async ({ processUpload }) => {
    const result = await processUpload({
      buffer: Buffer.from('%PDF-1.4 text-wins-truncated-ocr'),
      filename: 'text-wins-cap.pdf',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    const meta = result.processingMeta;
    assert.equal(meta.ocrTruncated, true, 'silent page loss forbidden when text path won');
    assert.equal(meta.ocrPagesProcessed, 12);
    assert.equal(meta.ocrPagesTotal, 40);
    assert.equal(meta.ocrPageCap, 12);
    assert.deepEqual(meta.rotatedBy, [90]);
  });
});
