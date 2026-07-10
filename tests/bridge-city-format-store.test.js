/**
 * Wave 0 RED — GATE-01 city format store + fingerprint contracts.
 * Production module ships in Plan 02; this suite must fail until then.
 * Never writes production data roots — temp BRIDGE_CITY_FORMATS_ROOT only.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
let tempFormatsRoot;

before(() => {
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-'));
  // Plan 02 adds BRIDGE_CITY_FORMATS_ROOT to config; set now so isolation works either way.
  config.BRIDGE_CITY_FORMATS_ROOT = tempFormatsRoot;
});

after(() => {
  if (originalFormatsRoot === undefined) {
    delete config.BRIDGE_CITY_FORMATS_ROOT;
  } else {
    config.BRIDGE_CITY_FORMATS_ROOT = originalFormatsRoot;
  }
  try {
    fs.rmSync(tempFormatsRoot, { recursive: true, force: true });
  } catch (_) {}
});

// MODULE_NOT_FOUND is acceptable RED until Plan 02 implements the store.
const {
  computeFormatFingerprint,
  loadCityFormat,
  saveCityFormat,
  loadCityFormats,
  cityFormatsPath,
  emptyCityFormats
} = require('../lib/bridge-city-format-store');

// ─── GATE-01 fingerprint ────────────────────────────────────────────────────

test('GATE-01: computeFormatFingerprint is order-independent for same headers', () => {
  const a = computeFormatFingerprint(['B', 'A', 'C']);
  const b = computeFormatFingerprint(['A', 'C', 'B']);
  assert.equal(typeof a, 'string');
  assert.ok(a.length >= 32, 'expected sha1-hex length digest');
  assert.equal(a, b, 'reordered headers must share fingerprint');
});

test('GATE-01: computeFormatFingerprint changes when a real header is added', () => {
  const base = computeFormatFingerprint(['A', 'C', 'B']);
  const extra = computeFormatFingerprint(['A', 'C', 'B', 'Extra Col']);
  assert.notEqual(base, extra, 'new real header must change fingerprint');
});

test('GATE-01: computeFormatFingerprint drops blank and _meta headers consistently', () => {
  const clean = computeFormatFingerprint(['Property Address', 'Vio Cat', 'Open Date']);
  const noisy = computeFormatFingerprint([
    'Property Address',
    '',
    'Vio Cat',
    '_meta',
    'Open Date',
    '   '
  ]);
  assert.equal(clean, noisy, 'empty/_meta headers must not affect fingerprint');
});

test('GATE-01: fingerprint is not a full-file content hash of CSV bytes', () => {
  const headers = ['Property Address', 'Vio Cat', 'Open Date'];
  const fp = computeFormatFingerprint(headers);
  const csvBody = [
    headers.join(','),
    '100 Main St,High Grass,01/15/2024',
    '200 Oak Ave,Trash,02/01/2024'
  ].join('\n');
  const fileHash = crypto.createHash('sha1').update(csvBody, 'utf8').digest('hex');
  assert.notEqual(
    fp,
    fileHash,
    'headers fingerprint must never equal full CSV content sha1'
  );
});

// ─── GATE-01 empty / path ───────────────────────────────────────────────────

test('GATE-01: emptyCityFormats returns version 1 cities object', () => {
  const doc = emptyCityFormats();
  assert.equal(doc.version, 1);
  assert.ok(doc.cities && typeof doc.cities === 'object');
  assert.deepEqual(doc.cities, {});
});

test('GATE-01: cityFormatsPath is under BRIDGE_CITY_FORMATS_ROOT', () => {
  const p = cityFormatsPath();
  assert.ok(typeof p === 'string' && p.length > 0);
  assert.ok(
    path.resolve(p).startsWith(path.resolve(tempFormatsRoot)),
    `cityFormatsPath must live under temp formats root, got: ${p}`
  );
});

// ─── GATE-01 load / save ────────────────────────────────────────────────────

test('GATE-01: loadCityFormat missing file returns null without throw', () => {
  const entry = loadCityFormat('arizona-marana', 'code_violation');
  assert.equal(entry, null);
});

test('GATE-01: loadCityFormats missing file returns empty shape without throw', () => {
  const doc = loadCityFormats();
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.cities, {});
});

test('GATE-01: saveCityFormat then loadCityFormat round-trips fingerprint + typeHeader', () => {
  saveCityFormat({
    cityId: 'arizona-marana',
    uploadType: 'code_violation',
    fingerprint: 'abc123fingerprint',
    typeHeader: 'Vio Cat',
    confirmedBy: 'admin',
    sourceFileLast: 'export.csv',
    headerSnapshot: ['Property Address', 'Vio Cat', 'Open Date']
  });

  const loaded = loadCityFormat('arizona-marana', 'code_violation');
  assert.ok(loaded, 'expected city format entry after save');
  assert.equal(loaded.fingerprint, 'abc123fingerprint');
  assert.equal(loaded.typeHeader, 'Vio Cat');
  assert.equal(loaded.confirmedBy, 'admin');
});

test('GATE-01: typeHeader null (No type column) round-trips as null', () => {
  saveCityFormat({
    cityId: 'test-no-type-city',
    uploadType: 'code_violation',
    fingerprint: 'none-fp-001',
    typeHeader: null,
    confirmedBy: 'admin'
  });

  const loaded = loadCityFormat('test-no-type-city', 'code_violation');
  assert.ok(loaded, 'expected entry after save with null typeHeader');
  assert.equal(loaded.typeHeader, null);
  assert.ok(
    Object.prototype.hasOwnProperty.call(loaded, 'typeHeader'),
    'typeHeader key must be present (null is confirmed no-type, not missing)'
  );
});

test('GATE-01: corrupt JSON at cityFormatsPath does not throw on load', () => {
  const file = cityFormatsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not-valid-json!!!', 'utf8');

  assert.doesNotThrow(() => loadCityFormats());
  assert.doesNotThrow(() => loadCityFormat('arizona-marana', 'code_violation'));

  const doc = loadCityFormats();
  assert.equal(doc.version, 1);
  assert.ok(doc.cities && typeof doc.cities === 'object');

  const entry = loadCityFormat('arizona-marana', 'code_violation');
  assert.equal(entry, null);
});

test('GATE-01: two uploadTypes under same city do not clobber each other', () => {
  saveCityFormat({
    cityId: 'shared-city',
    uploadType: 'code_violation',
    fingerprint: 'cv-fp',
    typeHeader: 'Vio Cat',
    confirmedBy: 'admin'
  });
  saveCityFormat({
    cityId: 'shared-city',
    uploadType: 'water_shut_off',
    fingerprint: 'wso-fp',
    typeHeader: null,
    confirmedBy: 'admin'
  });

  const cv = loadCityFormat('shared-city', 'code_violation');
  const wso = loadCityFormat('shared-city', 'water_shut_off');
  assert.ok(cv && wso, 'both uploadType entries must exist');
  assert.equal(cv.fingerprint, 'cv-fp');
  assert.equal(cv.typeHeader, 'Vio Cat');
  assert.equal(wso.fingerprint, 'wso-fp');
  assert.equal(wso.typeHeader, null);
});
