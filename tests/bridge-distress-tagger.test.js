const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  tagRow,
  tagRows,
  collectMatches,
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