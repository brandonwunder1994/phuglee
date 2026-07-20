/**
 * Wave 1 Task 1.3 — Honest OCR failure for image-like PDFs.
 * Mock OCR failure → clear OCR_UNAVAILABLE / OCR_FAILED, not silent junk.
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
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-ocr-fail-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-ocr-fail-'));
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

/** Minimal valid 1-page PDF with no real content (page markers only). */
function emptyImageLikePdfBuffer() {
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<<>>>>endobj\n' +
      '4 0 obj<</Length 0>>stream\n' +
      'endstream\nendobj\n' +
      'xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \n' +
      'trailer<</Size 5/Root 1 0 R>>\nstartxref\n264\n%%EOF\n'
  );
}

/**
 * Mock ocrPdfBuffer on the pdf-ocr module (pdf.js must call via module, not local bind).
 */
function withMockedOcr(mockFn, fn) {
  const ocrPath = require.resolve('../lib/bridge-engine/parsers/pdf-ocr');
  const pdfPath = require.resolve('../lib/bridge-engine/parsers/pdf');
  const enginePath = require.resolve('../lib/bridge-engine');
  const ocrMod = require(ocrPath);
  const original = ocrMod.ocrPdfBuffer;

  ocrMod.ocrPdfBuffer = mockFn;
  // Reload pdf.js so it picks up... unless it uses live module ref.
  // Prefer live module.exports.ocrPdfBuffer access in pdf.js implementation.
  delete require.cache[pdfPath];
  delete require.cache[enginePath];
  // Re-require after mock so any destructure-at-load still gets mock if reloaded
  const pdf = require(pdfPath);
  const engine = require(enginePath);

  return Promise.resolve()
    .then(() => fn({ parsePdf: pdf.parsePdf, processUpload: engine.processUpload, ocrMod }))
    .finally(() => {
      ocrMod.ocrPdfBuffer = original;
      delete require.cache[pdfPath];
      delete require.cache[enginePath];
    });
}

test('OCR-FAIL-01: image-like PDF + ocr returns null → OCR_UNAVAILABLE (not silent junk)', async () => {
  await withMockedOcr(async () => null, async ({ parsePdf }) => {
    let caught = null;
    try {
      await parsePdf(emptyImageLikePdfBuffer(), 'scanned-city.pdf');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'must throw when OCR cannot produce text for image-like PDF');
    assert.equal(
      caught.code,
      'OCR_UNAVAILABLE',
      `expected OCR_UNAVAILABLE, got ${caught && caught.code}`
    );
    assert.match(
      String(caught.message || ''),
      /OCR|scan|Excel|CSV|Tesseract/i,
      'message must tell operator OCR failed / how to recover'
    );
    assert.ok(
      !/no usable records|NO_USABLE/i.test(String(caught.message || '')),
      'must not blame city file with generic no-usable message alone'
    );
  });
});

test('OCR-FAIL-02: image-like PDF + ocr throws → OCR_FAILED or OCR_UNAVAILABLE', async () => {
  await withMockedOcr(
    async () => {
      const e = new Error('tesseract worker wasm boom');
      throw e;
    },
    async ({ parsePdf }) => {
      let caught = null;
      try {
        await parsePdf(emptyImageLikePdfBuffer(), 'scan-fail.pdf');
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, 'must throw on OCR exception for image-like PDF');
      assert.ok(
        caught.code === 'OCR_FAILED' || caught.code === 'OCR_UNAVAILABLE',
        `expected OCR_FAILED|OCR_UNAVAILABLE, got ${caught && caught.code}`
      );
      assert.match(String(caught.message || ''), /OCR|Tesseract|Excel|CSV|scan/i);
    }
  );
});

test('OCR-FAIL-03: image-like PDF + ocr empty text object → hard fail code', async () => {
  await withMockedOcr(async () => ({ text: '', ocrConfidence: 0, pageCount: 1 }), async ({ parsePdf }) => {
    let caught = null;
    try {
      await parsePdf(emptyImageLikePdfBuffer(), 'blank-ocr.pdf');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'must throw when OCR returns no usable text');
    assert.ok(
      caught.code === 'OCR_FAILED' || caught.code === 'OCR_UNAVAILABLE',
      `expected OCR_* code, got ${caught && caught.code}`
    );
  });
});

test('OCR-FAIL-04: processUpload surfaces OCR code (not NO_USABLE_ROWS-only silence)', async () => {
  const indexModule = require('../lib/analyzer-import-index');
  const prev = indexModule.loadImportAddressIndex;
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set(),
    count: 0,
    sources: null
  });

  try {
    await withMockedOcr(async () => null, async ({ processUpload }) => {
      let caught = null;
      try {
        await processUpload({
          buffer: emptyImageLikePdfBuffer(),
          filename: 'image-scan.pdf',
          city: 'OcrFailCity',
          uploadType: 'code_violation',
          username: 'admin',
          confirmedTypeHeader: null
        });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, 'processUpload must reject');
      assert.ok(
        caught.code === 'OCR_UNAVAILABLE' || caught.code === 'OCR_FAILED',
        `expected OCR_* on processUpload, got ${caught && caught.code}: ${caught && caught.message}`
      );
    });
  } finally {
    indexModule.loadImportAddressIndex = prev;
  }
});

test('OCR-FAIL-05: bridge-api maps OCR_UNAVAILABLE → 503 and OCR_FAILED → 4xx/5xx', () => {
  const api = fs.readFileSync(path.join(__dirname, '../lib/bridge-api.js'), 'utf8');
  assert.ok(api.includes("err.code === 'OCR_UNAVAILABLE'"), 'OCR_UNAVAILABLE handler required');
  assert.ok(
    api.includes("err.code === 'OCR_FAILED'") || api.includes('OCR_FAILED'),
    'OCR_FAILED must be mapped in bridge-api'
  );
  const unavailIdx = api.indexOf("err.code === 'OCR_UNAVAILABLE'");
  const slice = api.slice(unavailIdx, unavailIdx + 700);
  assert.ok(
    /status\s*=\s*err\.code\s*===\s*'OCR_FAILED'\s*\?\s*400\s*:\s*503/.test(slice) ||
      /sendJson\(res,\s*503/.test(slice),
    'OCR_UNAVAILABLE → 503 (direct or via status)'
  );
  assert.ok(/OCR_FAILED/.test(slice) && /400/.test(slice), 'OCR_FAILED → 400');
});

test('OCR-FAIL-06: bridge.js surfaces OCR_UNAVAILABLE (and OCR_FAILED if mapped)', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/js/bridge.js'), 'utf8');
  assert.ok(js.includes("OCR_UNAVAILABLE"), 'client must handle OCR_UNAVAILABLE');
  // OCR_FAILED optional one-line map — if present, good; if not, API may fold into 503
  const hasFailed = js.includes('OCR_FAILED');
  if (hasFailed) {
    assert.ok(true, 'client maps OCR_FAILED');
  }
});

test('OCR-FAIL-07: buildOcrHardFailure classifies null vs empty vs throw', () => {
  const { buildOcrHardFailure } = require('../lib/bridge-engine/parsers/pdf');
  const nullRes = buildOcrHardFailure(null, null);
  assert.equal(nullRes.code, 'OCR_UNAVAILABLE');
  assert.match(String(nullRes.message), /scanned|OCR|Excel|CSV/i);

  const emptyRes = buildOcrHardFailure(null, { text: '   ' });
  assert.equal(emptyRes.code, 'OCR_FAILED');

  const tess = new Error('tesseract worker failed');
  const unavail = buildOcrHardFailure(tess, null);
  assert.equal(unavail.code, 'OCR_UNAVAILABLE');

  const other = new Error('something else');
  const failed = buildOcrHardFailure(other, null);
  assert.equal(failed.code, 'OCR_FAILED');
});
