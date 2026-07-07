const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAddress,
  similarityScore,
  isNearDuplicate,
  dedupeRows
} = require('../lib/bridge-dedup');

function row(address, issue = 'Trash', date = '2026-01-01') {
  return {
    streetAddress: address,
    violationIssueType: issue,
    violationDate: date
  };
}

test('normalizes address abbreviations', () => {
  assert.equal(normalizeAddress('123 Main St'), normalizeAddress('123 Main Street'));
  assert.equal(normalizeAddress('456 N Oak Ave'), normalizeAddress('456 North Oak Avenue'));
});

test('scores similar addresses highly', () => {
  const score = similarityScore('123 Main Street', '123 Main St');
  assert.ok(score >= 0.92);
});

test('detects near duplicates with abbreviation differences', () => {
  assert.equal(
    isNearDuplicate(row('123 Main Street'), row('123 Main St')),
    true
  );
});

test('does not dedupe different addresses', () => {
  assert.equal(
    isNearDuplicate(row('123 Main St'), row('456 Oak Ave')),
    false
  );
});

test('dedupeRows keeps first occurrence and reports removals', () => {
  const input = [
    row('123 Main St', 'Overgrown weeds'),
    row('123 Main Street', 'Overgrown weeds'),
    row('789 Pine Rd', 'Trash')
  ];
  const result = dedupeRows(input);
  assert.equal(result.rows.length, 2);
  assert.equal(result.removedCount, 1);
  assert.equal(result.rows[0].streetAddress, '123 Main St');
});

test('dedupeRows allows same address with different issue types', () => {
  const input = [
    row('123 Main St', 'Overgrown weeds'),
    row('123 Main St', 'Sign violation')
  ];
  const result = dedupeRows(input);
  assert.equal(result.rows.length, 2);
  assert.equal(result.removedCount, 0);
});