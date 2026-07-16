const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  PRESSURE_TAGS,
  buildPressureTags,
  buildWhySurfaced,
  enrichLeadProof
} = require('../lib/leads-platform/why-surfaced');

const NOW = Date.parse('2026-07-15T12:00:00.000Z');

test('buildPressureTags marks long-open and repeat from case history', () => {
  const tags = buildPressureTags({
    codeViolation: {
      date: '2025-01-01',
      records: [
        { date: '2025-01-01', type: 'Junk' },
        { date: '2024-06-01', type: 'Yard' },
        { date: '2023-01-01', type: 'Structure' }
      ]
    }
  }, NOW);
  assert.ok(tags.includes(PRESSURE_TAGS.REPEAT));
  assert.ok(tags.includes(PRESSURE_TAGS.LONG_OPEN));
  assert.ok(tags.includes(PRESSURE_TAGS.CHRONIC));
});

test('buildWhySurfaced writes a plain-English proof line', () => {
  const why = buildWhySurfaced({
    codeViolation: {
      type: 'Overgrown vegetation',
      date: '2025-12-01',
      records: [{ date: '2025-12-01' }, { date: '2025-06-01' }]
    },
    distressTier: 8
  }, NOW);
  assert.match(why, /^Surfaced because /);
  assert.match(why, /open code case/);
  assert.match(why, /Overgrown vegetation/);
});

test('enrichLeadProof merges pressure tags without dropping existing signals', () => {
  const out = enrichLeadProof({
    signalTags: ['Code violation', 'Absentee owner'],
    codeViolation: {
      date: '2024-01-01',
      records: [
        { date: '2024-01-01' },
        { date: '2023-06-01' },
        { date: '2022-01-01' }
      ]
    },
    distressTier: 9
  }, NOW);
  assert.ok(out.signalTags.includes('Code violation'));
  assert.ok(out.signalTags.includes(PRESSURE_TAGS.LONG_OPEN));
  assert.ok(out.whySurfaced);
  assert.ok(out.pressureTags.length >= 1);
});

test('enrichLeadProof keeps an existing whySurfaced sentence', () => {
  const out = enrichLeadProof({
    whySurfaced: 'Surfaced because operator flagged chronic yard cases.',
    signalTags: ['Vacant']
  }, NOW);
  assert.equal(out.whySurfaced, 'Surfaced because operator flagged chronic yard cases.');
});
