const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  bridgeRowsToAnalyzerRecords,
  analyzerRecordKey,
  UPLOAD_TO_LEAD_TYPE
} = require('../lib/bridge-analyzer-push');

test('bridgeRowsToAnalyzerRecords maps normalized bridge rows', () => {
  const rows = bridgeRowsToAnalyzerRecords([
    {
      streetAddress: '123 Main St',
      city: 'Marana',
      state: 'Arizona',
      zip: '85704',
      violationIssueType: 'Overgrown weeds',
      distressedSignalTag: 'Strong Distressed Signal',
      descriptionNotes: 'Front yard',
      violationDate: '2026-04-02',
      sourceFile: 'violations.csv'
    }
  ], { uploadType: 'code_violation', sourceFile: 'violations.csv' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].leadType, UPLOAD_TO_LEAD_TYPE.code_violation);
  assert.match(rows[0].address, /123 Main St/i);
  assert.equal(rows[0].bridgeTag, 'Strong Distressed Signal');
  assert.equal(rows[0].phone, '');
});

test('bridgeRowsToAnalyzerRecords uses water shut off lead type', () => {
  const rows = bridgeRowsToAnalyzerRecords([
    {
      streetAddress: '88 River Rd',
      city: 'Marana',
      state: 'Arizona',
      zip: '85705'
    }
  ], { uploadType: 'water_shut_off' });
  assert.equal(rows[0].leadType, 'water_shut_off');
});

test('analyzerRecordKey matches analyzer session key format', () => {
  const key = analyzerRecordKey({
    email: '',
    phone: '',
    address: '123 Main St, Marana, Arizona 85704'
  });
  assert.equal(key, '||123 Main St, Marana, Arizona 85704');
});