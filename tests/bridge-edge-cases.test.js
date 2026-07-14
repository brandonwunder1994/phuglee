const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../lib/config');
const { parseMultipart } = require('../lib/multipart');
const { noUsableRowsMessage } = require('../lib/bridge-engine');
const { processUpload } = require('../lib/bridge-engine');
const { parseTextFile } = require('../lib/bridge-engine/parsers/text');
const { normalizeRawRows } = require('../lib/bridge-engine/normalizer');
const { isAcceptedFile } = require('../lib/bridge-intake-schema');

const CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' };
const originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
let tempFormatsRoot;

before(() => {
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-edge-'));
  config.BRIDGE_CITY_FORMATS_ROOT = tempFormatsRoot;
});

after(() => {
  if (originalFormatsRoot === undefined) {
    delete config.BRIDGE_CITY_FORMATS_ROOT;
  } else {
    config.BRIDGE_CITY_FORMATS_ROOT = originalFormatsRoot;
  }
  try {
    if (tempFormatsRoot) fs.rmSync(tempFormatsRoot, { recursive: true, force: true });
  } catch (_) {}
});

test('isAcceptedFile rejects legacy .doc but accepts .docx', () => {
  assert.equal(isAcceptedFile('list.doc'), false);
  assert.equal(isAcceptedFile('list.docx'), true);
});

test('noUsableRowsMessage for all-already-imported scenario', () => {
  const msg = noUsableRowsMessage({
    normalizedDiscarded: 0,
    deduplicated: 0,
    alreadyImported: 5
  });
  assert.match(msg, /already in your Analyze session/i);
});

test('noUsableRowsMessage for generic empty parse', () => {
  const msg = noUsableRowsMessage({
    normalizedDiscarded: 3,
    deduplicated: 0,
    alreadyImported: 0
  });
  assert.match(msg, /no usable records/i);
});

test('parseMultipart preserves binary file bytes', () => {
  const boundary = 'TestBoundary99';
  const binary = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cityId"\r\n\r\ntest-city\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.png"\r\nContent-Type: image/png\r\n\r\n`),
    binary,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const { fields, files } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(fields.cityId, 'test-city');
  assert.deepEqual(files.file.data, binary);
});

test('parseMultipart accumulates multiple file parts with same name', () => {
  const { collectUploadFiles } = require('../lib/multipart');
  const boundary = 'MultiFileBound';
  const a = Buffer.from('aaa');
  const b = Buffer.from('bbb');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cityId"\r\n\r\ncity-1\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n`),
    a,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="b.csv"\r\nContent-Type: text/csv\r\n\r\n`),
    b,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const { files } = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.ok(Array.isArray(files.file), 'repeated file field becomes array');
  assert.equal(files.file.length, 2);
  assert.equal(files.file[0].filename, 'a.csv');
  assert.equal(files.file[1].filename, 'b.csv');
  const list = collectUploadFiles(files);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].data, a);
  assert.deepEqual(list[1].data, b);
});

test('parseMultipart accepts quoted boundary and PDF bytes containing boundary text', () => {
  const { collectUploadFiles } = require('../lib/multipart');
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const evil = Buffer.concat([
    Buffer.from('%PDF-1.4'),
    Buffer.from(`--${boundary}`),
    Buffer.from('trailer')
  ]);
  const b = Buffer.from('%PDF-ok-b');
  const c = Buffer.from('%PDF-ok-c');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="evil.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    evil,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="b.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    b,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="c.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    c,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const quoted = parseMultipart(body, `multipart/form-data; boundary="${boundary}"`);
  const list = collectUploadFiles(quoted.files);
  assert.equal(list.length, 3);
  assert.equal(list[0].filename, 'evil.pdf');
  assert.deepEqual(list[0].data, evil);
  assert.deepEqual(list[1].data, b);
  assert.deepEqual(list[2].data, c);
});

test('parseMultipart throws when boundary missing', () => {
  assert.throws(
    () => parseMultipart(Buffer.from('data'), 'multipart/form-data'),
    /boundary/i
  );
});

test('parses pipe-delimited TXT violation list', async () => {
  const enginePath = require.resolve('../lib/bridge-engine');
  const indexModule = require('../lib/analyzer-import-index');
  const originalLoad = indexModule.loadImportAddressIndex;
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set(),
    count: 0,
    sources: null
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  const csv = [
    'Property Address|Violation Type|Violation Date',
    '100 Elm St|Overgrown weeds|2026-01-15',
    '200 Oak Ave|Sign violation|2026-02-01'
  ].join('\n');
  const parsed = parseTextFile(Buffer.from(csv), 'violations.txt');
  assert.equal(parsed.delimiter, '|');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from(csv),
      filename: 'violations.txt',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    // Sign violation is generic — only the weeds row is kept as distress
    assert.equal(result.stats.kept, 1);
    assert.equal(result.stats.noDistress, 1);
  } finally {
    indexModule.loadImportAddressIndex = originalLoad;
    delete require.cache[enginePath];
  }
});

test('parses TSV file extension', async () => {
  const tsv = 'Property Address\tViolation Type\n55 Birch Ln\tTrash accumulation\n';
  const result = await processUpload({
    buffer: Buffer.from(tsv),
    filename: 'violations.tsv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  assert.equal(result.stats.kept, 1);
  assert.match(result.rows[0].distressedSignalTag, /Strong Distressed Signal/i);
});

test('discards City Hall non-property rows', () => {
  const normalized = normalizeRawRows(
    [{ 'Property Address': 'City Hall', 'Violation Type': 'Sign' }],
    ['Property Address', 'Violation Type'],
    {
      city: CITY,
      uploadType: 'code_violation',
      sourceFile: 'test.csv',
      processedAt: new Date().toISOString()
    }
  );
  assert.equal(normalized.kept.length, 0);
  assert.equal(normalized.discarded.length, 1);
  assert.match(normalized.discarded[0].reason, /non-property/i);
});

test('IND-04: processUpload keeps all-imported rows by default (no onlyImported NO_USABLE_ROWS)', async () => {
  const enginePath = require.resolve('../lib/bridge-engine');
  const indexModule = require('../lib/analyzer-import-index');
  const { normalizeAddressKey } = indexModule;
  const originalLoad = indexModule.loadImportAddressIndex;

  const csv = 'Property Address,Violation Type\n123 Main St,Overgrown weeds\n';
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set([normalizeAddressKey('123 Main St, Marana, Arizona')]),
    count: 1,
    sources: { records: 1, results: 0 }
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    const result = await processUploadFresh({
      buffer: Buffer.from(csv),
      filename: 'only-imported.csv',
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader: 'Violation Type'
    });
    assert.equal(result.stats.alreadyImported, 0);
    assert.equal(result.processingMeta.importIndexCount, 0);
    assert.ok(result.stats.kept >= 1 || (result.stats.noDistress >= 1),
      'default path must not throw onlyImported NO_USABLE_ROWS from index match alone');
  } finally {
    indexModule.loadImportAddressIndex = originalLoad;
    delete require.cache[enginePath];
  }
});

test('IND-04: processUpload returns 422 details when all rows already imported (opt-in)', async () => {
  const enginePath = require.resolve('../lib/bridge-engine');
  const indexModule = require('../lib/analyzer-import-index');
  const { normalizeAddressKey } = indexModule;
  const originalLoad = indexModule.loadImportAddressIndex;

  const csv = 'Property Address,Violation Type\n123 Main St,Overgrown weeds\n';
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set([normalizeAddressKey('123 Main St, Marana, Arizona')]),
    count: 1,
    sources: { records: 1, results: 0 }
  });
  delete require.cache[enginePath];
  const { processUpload: processUploadFresh } = require('../lib/bridge-engine');

  try {
    await assert.rejects(
      () => processUploadFresh({
        buffer: Buffer.from(csv),
        filename: 'only-imported.csv',
        city: CITY,
        uploadType: 'code_violation',
        username: 'admin',
        confirmedTypeHeader: 'Violation Type',
        applyAlreadyImportedFilter: true
      }),
      (err) => {
        assert.equal(err.code, 'NO_USABLE_ROWS');
        assert.match(err.message, /already in your Analyze session/i);
        assert.equal(err.details.stats.alreadyImported, 1);
        return true;
      }
    );
  } finally {
    indexModule.loadImportAddressIndex = originalLoad;
    delete require.cache[enginePath];
  }
});