const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  tagRow,
  tagRows,
  collectMatches,
  filterDistressOnly,
  STRONG_DISTRESSED_TAG
} = require('../lib/bridge-distress-tagger');

function row(overrides = {}) {
  return {
    streetAddress: '123 Main St',
    violationIssueType: '',
    descriptionNotes: '',
    ...overrides
  };
}

test('tags overgrown vegetation as strong distressed signal', () => {
  const result = tagRow(row({ descriptionNotes: 'Overgrown weeds exceeding 12 inches' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(result.matchedIndicators.some((m) => /grass|weed/i.test(m)));
});

test('tags trash accumulation as strong distressed signal', () => {
  const result = tagRow(row({ violationIssueType: 'Accumulation of trash and debris in yard' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(result.matchedIndicators.some((m) => /trash/i.test(m)));
});

test('tags abandoned vehicles as strong distressed signal', () => {
  const result = tagRow(row({ descriptionNotes: 'Abandoned inoperable vehicle on property' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(result.matchedIndicators.some((m) => /vehicle/i.test(m)));
});

test('tags dilapidated structures as strong distressed signal', () => {
  const result = tagRow(row({ descriptionNotes: 'Dilapidated structure with broken windows' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(result.matchedIndicators.some((m) => /structure/i.test(m)));
});

test('tags exterior neglect as strong distressed signal', () => {
  const result = tagRow(row({ descriptionNotes: 'Fence in deteriorated condition' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(result.matchedIndicators.some((m) => /nuisance|maintenance/i.test(m)));
});

test('defaults to standard code violation when no strong match', () => {
  const result = tagRow(row({ violationIssueType: 'Fence permit expired' }), 'code_violation');
  assert.equal(result.distressedSignalTag, 'Standard Code Violation');
  assert.deepEqual(result.matchedIndicators, []);
});

test('loose match: weeds alone is strong', () => {
  const result = tagRow(row({ violationIssueType: 'Weeds' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
});

test('loose match: property maintenance is strong', () => {
  const result = tagRow(row({ violationIssueType: 'Property Maintenance' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
});

test('loose match: blight alone is strong', () => {
  const result = tagRow(row({ descriptionNotes: 'Blight' }), 'code_violation');
  assert.equal(result.distressedSignalTag, STRONG_DISTRESSED_TAG);
});

test('parking on lawn is not strong distress', () => {
  const result = tagRow(row({ violationIssueType: 'Parking on lawn' }), 'code_violation');
  assert.equal(result.distressedSignalTag, 'Standard Code Violation');
});

test('water shut off always receives high value distress tag', () => {
  const result = tagRow(row({ descriptionNotes: 'Delinquent water account' }), 'water_shut_off');
  assert.equal(result.distressedSignalTag, 'Water Shut Off – High Value Distress Signal');
  assert.deepEqual(result.matchedIndicators, []);
});

test('tagRows applies tagging to every row', () => {
  const tagged = tagRows([
    row({ descriptionNotes: 'Illegal dumping of furniture in yard' }),
    row({ violationIssueType: 'Sign violation' })
  ], 'code_violation');
  assert.equal(tagged.length, 2);
  assert.equal(tagged[0].distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.equal(tagged[1].distressedSignalTag, 'Standard Code Violation');
});

test('collectMatches returns multiple categories when applicable', () => {
  const matches = collectMatches('Overgrown weeds and accumulation of trash in yard');
  assert.ok(matches.length >= 2);
});

test('filterDistressOnly drops standard code violations', () => {
  const rows = [
    { streetAddress: '1 A', distressedSignalTag: STRONG_DISTRESSED_TAG },
    { streetAddress: '2 B', distressedSignalTag: 'Standard Code Violation' },
    { streetAddress: '3 C', distressedSignalTag: STRONG_DISTRESSED_TAG }
  ];
  const filtered = filterDistressOnly(rows, 'code_violation');
  assert.equal(filtered.rows.length, 2);
  assert.equal(filtered.removedCount, 1);
  assert.equal(filtered.removed[0].reason, 'no_distress_signal');
});

test('filterDistressOnly keeps all water shut off rows', () => {
  const rows = [
    { streetAddress: '1 A', distressedSignalTag: 'Water Shut Off – High Value Distress Signal' }
  ];
  const filtered = filterDistressOnly(rows, 'water_shut_off');
  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.removedCount, 0);
});