const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DIAL_READY_COLUMNS } = require('../lib/export-schema');
const {
  FULL_EXPORT_COLUMNS,
  FULL_EXPORT_SIGNATURE_COLUMNS
} = require('../lib/export-profiles');

describe('export-profiles', () => {
  it('DIAL_READY_COLUMNS has exactly 13 columns', () => {
    assert.equal(DIAL_READY_COLUMNS.length, 13);
  });

  it('FULL_EXPORT_COLUMNS has more than 20 keys matching render.js full branch', () => {
    assert.ok(FULL_EXPORT_COLUMNS.length > 20);
    assert.equal(FULL_EXPORT_COLUMNS.length, 30);
    assert.ok(FULL_EXPORT_COLUMNS.includes('Distress Score'));
    assert.ok(FULL_EXPORT_COLUMNS.includes('D4D Indicators'));
    assert.ok(FULL_EXPORT_COLUMNS.includes('Why This Tier'));
  });

  it('FULL_EXPORT_SIGNATURE_COLUMNS are subset of full profile', () => {
    for (const col of FULL_EXPORT_SIGNATURE_COLUMNS) {
      assert.ok(FULL_EXPORT_COLUMNS.includes(col), `full profile missing ${col}`);
    }
  });

  it('dial_ready and full profiles are distinct (Contact Name vs First Name)', () => {
    assert.ok(DIAL_READY_COLUMNS.includes('Contact Name'));
    assert.ok(!DIAL_READY_COLUMNS.includes('First Name'));
    assert.ok(FULL_EXPORT_SIGNATURE_COLUMNS.includes('First Name'));
    assert.ok(!DIAL_READY_COLUMNS.includes('Distress Score'));
    assert.ok(FULL_EXPORT_SIGNATURE_COLUMNS.includes('Distress Score'));
  });

  it('shared column names differ in meaning or extra full-only columns exist', () => {
    const shared = DIAL_READY_COLUMNS.filter((c) => FULL_EXPORT_COLUMNS.includes(c));
    assert.ok(shared.includes('Lead Type'));
    assert.ok(shared.includes('Street Address'));
    assert.ok(!FULL_EXPORT_COLUMNS.includes('Lead Category'));
    assert.ok(DIAL_READY_COLUMNS.includes('Lead Category'));
    assert.ok(!FULL_EXPORT_COLUMNS.includes('Property Type'));
    assert.ok(DIAL_READY_COLUMNS.includes('Property Type'));
  });
});