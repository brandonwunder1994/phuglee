/**
 * Keep-preview for Type confirm — isolates candidate column text.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  previewKeepForTypeColumn,
  enrichCandidatesWithKeepPreview
} = require('../lib/bridge-type-keep-preview');

test('previewKeepForTypeColumn counts Strong Distressed from column values only', () => {
  const rows = [
    { Type: 'High Grass', Other: 'permit only' },
    { Type: 'Fence Permit', Other: 'weeds in yard' },
    { Type: 'Trash Accumulation', Other: 'ok' },
    { Type: '', Other: 'ignored empty' }
  ];
  const preview = previewKeepForTypeColumn('Type', rows);
  assert.equal(preview.sampleSize, 3);
  assert.ok(preview.strongDistressed >= 2, `expected ≥2 strong, got ${preview.strongDistressed}`);
  assert.equal(preview.strongDistressed + preview.discarded, preview.sampleSize);
});

test('enrichCandidatesWithKeepPreview attaches keepPreview + caps samples', () => {
  const ranked = [
    {
      header: 'Issue Type',
      score: 70,
      reasons: ['exact_alias:+40'],
      samples: ['Weeds', 'Trash', 'Blight', 'Noise', 'Parking', 'Extra']
    },
    {
      header: 'Address',
      score: 10,
      reasons: [],
      samples: ['123 Main']
    }
  ];
  const rows = [
    { 'Issue Type': 'Weeds', Address: '123 Main' },
    { 'Issue Type': 'Trash', Address: '124 Main' },
    { 'Issue Type': 'Fence Permit', Address: '125 Main' }
  ];
  const out = enrichCandidatesWithKeepPreview(ranked, rows, { candidateLimit: 2 });
  assert.equal(out.length, 2);
  assert.ok(out[0].keepPreview);
  assert.equal(out[0].samples.length, 5);
  assert.ok(out[0].keepPreview.strongDistressed >= 2);
  assert.ok(out[1].keepPreview.strongDistressed <= 1);
});
