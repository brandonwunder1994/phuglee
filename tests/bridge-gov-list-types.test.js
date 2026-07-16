'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  UPLOAD_TYPES,
  usesDistressPhraseFilter,
  uploadTypeLabel,
  validateUploadType
} = require('../lib/bridge-intake-schema');
const { tagRow, filterDistressOnly } = require('../lib/bridge-distress-tagger');
const { applyBrainToRow } = require('../lib/bridge-brain-apply');

test('new gov-list upload types validate and skip phrase filter', () => {
  for (const id of ['pre_lien', 'tax_delinquent', 'lis_pendens', 'probate', 'fire']) {
    assert.equal(validateUploadType(id), id);
    assert.equal(usesDistressPhraseFilter(id), false);
    assert.ok(uploadTypeLabel(id));
  }
  assert.equal(usesDistressPhraseFilter('code_violation'), true);
  assert.equal(usesDistressPhraseFilter('water_shut_off'), false);
});

test('pre_lien rows keep default tag and pass filterDistressOnly', () => {
  const row = {
    streetAddress: '100 Main St',
    violationIssueType: 'Debt collection',
    descriptionNotes: 'Credit card suit'
  };
  const tagged = tagRow(row, 'pre_lien');
  assert.equal(tagged.distressedSignalTag, UPLOAD_TYPES.pre_lien.defaultTag);
  const filtered = filterDistressOnly([{ ...row, ...tagged }], 'pre_lien');
  assert.equal(filtered.removedCount, 0);
  assert.equal(filtered.rows.length, 1);
});

test('brain apply is no-op for tax_delinquent', () => {
  const row = {
    streetAddress: '22 Oak',
    distressedSignalTag: UPLOAD_TYPES.tax_delinquent.defaultTag,
    violationIssueType: 'Delinquent 2023'
  };
  const out = applyBrainToRow(row, {
    typeRules: [{ id: 'x', status: 'active', kind: 'suppress_type', violationTypeKey: 'delinquent 2023' }],
    phraseRules: []
  }, { uploadType: 'tax_delinquent' });
  assert.equal(out.distressedSignalTag, UPLOAD_TYPES.tax_delinquent.defaultTag);
  assert.deepEqual(out.brainAppliedRuleIds, []);
});
