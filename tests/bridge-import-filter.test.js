const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DISCARD_REASONS } = require('../lib/bridge-intake-schema');
const { filterAlreadyImported } = require('../lib/bridge-engine/import-filter');
const { normalizeAddressKey } = require('../lib/analyzer-import-index');

function row(address, city = 'Marana', state = 'Arizona', zip = '85704') {
  return {
    streetAddress: address,
    city,
    state,
    zip,
    violationIssueType: 'Overgrown weeds'
  };
}

test('filterAlreadyImported passes through when index is empty', () => {
  const rows = [row('123 Main St')];
  const result = filterAlreadyImported(rows, new Set());
  assert.equal(result.rows.length, 1);
  assert.equal(result.removedCount, 0);
});

test('filterAlreadyImported removes exact analyzer matches', () => {
  const imported = new Set([
    normalizeAddressKey('123 Main St, Marana, Arizona, 85704')
  ]);
  const result = filterAlreadyImported([row('123 Main St')], imported);
  assert.equal(result.rows.length, 0);
  assert.equal(result.removedCount, 1);
  assert.equal(result.removed[0].reason, DISCARD_REASONS.already_imported);
});

test('filterAlreadyImported removes abbreviation variants', () => {
  const imported = new Set([
    normalizeAddressKey('123 Main Street, Marana, Arizona, 85704')
  ]);
  const result = filterAlreadyImported([row('123 Main St')], imported);
  assert.equal(result.rows.length, 0);
  assert.equal(result.removedCount, 1);
});

test('filterAlreadyImported matches street-only analyzer entries', () => {
  const imported = new Set([normalizeAddressKey('123 Main St')]);
  const result = filterAlreadyImported(
    [row('123 Main St', 'Marana', 'Arizona', '85704')],
    imported
  );
  assert.equal(result.rows.length, 0);
  assert.equal(result.removedCount, 1);
});

test('filterAlreadyImported keeps addresses not in analyzer', () => {
  const imported = new Set([
    normalizeAddressKey('999 Other Rd, Marana, Arizona, 85704')
  ]);
  const rows = [row('123 Main St'), row('456 Oak Ave')];
  const result = filterAlreadyImported(rows, imported);
  assert.equal(result.rows.length, 2);
  assert.equal(result.removedCount, 0);
});