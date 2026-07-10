const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_FN_REVIEW_ROWS,
  groupIdFor,
  assignRowIds,
  buildReviewGroups
} = require('../lib/bridge-review-groups');

const { violationTypeKey } = require('../lib/bridge-brain-store');

function row(overrides = {}) {
  return {
    streetAddress: '123 Main St',
    city: 'Marana',
    state: 'Arizona',
    violationIssueType: 'High Grass and Weeds',
    violationDate: '2026-04-01',
    descriptionNotes: 'tall weeds',
    distressedSignalTag: 'Strong Distressed Signal',
    matchedIndicators: ['weeds'],
    confidenceLevel: 'high',
    ...overrides
  };
}

// --- MAX_FN_REVIEW_ROWS ---

test('MAX_FN_REVIEW_ROWS === 5000', () => {
  assert.equal(MAX_FN_REVIEW_ROWS, 5000);
});

// --- assignRowIds ---

test('assignRowIds: every row gets unique rowId starting with r_', () => {
  const rows = [row(), row({ streetAddress: '456 Oak Ave' }), row({ streetAddress: '789 Pine Rd' })];
  const stamped = assignRowIds(rows);
  assert.equal(stamped.length, 3);
  const ids = stamped.map((r) => r.rowId);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
    assert.ok(id.startsWith('r_'), `expected r_ prefix, got ${id}`);
  }
  assert.equal(new Set(ids).size, 3, 'rowIds must be unique');
});

test('assignRowIds: second call is idempotent (same ids)', () => {
  const rows = [row(), row({ streetAddress: '456 Oak Ave' })];
  const first = assignRowIds(rows);
  const second = assignRowIds(first);
  assert.equal(second[0].rowId, first[0].rowId);
  assert.equal(second[1].rowId, first[1].rowId);
});

test('assignRowIds: content-colliding rows still unique via index in id', () => {
  const rows = [row(), row(), row()]; // identical content
  const stamped = assignRowIds(rows);
  const ids = stamped.map((r) => r.rowId);
  assert.equal(new Set(ids).size, 3);
  // Index is embedded in the id format: prefix_index_hash
  assert.ok(ids[0].includes('_0_'));
  assert.ok(ids[1].includes('_1_'));
  assert.ok(ids[2].includes('_2_'));
});

// --- groupIdFor ---

test('groupIdFor: deterministic for same section+typeKey', () => {
  const a = groupIdFor('distressed', 'high grass and weeds', null);
  const b = groupIdFor('distressed', 'high grass and weeds', null);
  assert.equal(a, b);
  assert.ok(a.startsWith('g_'));
  assert.equal(a.length, 14); // g_ + 12 hex
});

test('groupIdFor: typed groups ignore descriptionKey when null path yields same id', () => {
  const typeKey = 'high grass and weeds';
  const withNull = groupIdFor('distressed', typeKey, null);
  // When descriptionKey is null and typeKey is not __unknown__, description is omitted
  const again = groupIdFor('distressed', typeKey);
  assert.equal(withNull, again);
});

test('groupIdFor: empty-type groups with different descriptionKeys get different ids', () => {
  const a = groupIdFor('not_distressed', '__unknown__', 'fence permit only');
  const b = groupIdFor('not_distressed', '__unknown__', 'pool permit expired');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('g_'));
  assert.ok(b.startsWith('g_'));
});

// --- buildReviewGroups ---

test('buildReviewGroups: 20 rows same type different descriptions → 1 group count 20', () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row({
      descriptionNotes: `variant ${i}`,
      streetAddress: `${100 + i} Main St`
    })
  );
  const withIds = assignRowIds(rows);
  const groups = buildReviewGroups(withIds, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 20);
  assert.equal(groups[0].rowIds.length, 20);
  assert.equal(groups[0].isSingleton, false);
  assert.equal(groups[0].section, 'distressed');
  assert.equal(groups[0].violationTypeKey, violationTypeKey('High Grass and Weeds'));
  assert.equal(groups[0].descriptionKey, null);
});

test('buildReviewGroups: 2 distinct types → 2 groups', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'High Grass and Weeds' }),
    row({ violationIssueType: 'Trash and Debris', matchedIndicators: ['trash'] })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 2);
  const keys = groups.map((g) => g.violationTypeKey).sort();
  assert.deepEqual(keys, ['high grass and weeds', 'trash and debris']);
});

test('buildReviewGroups: case/spacing stacks via violationTypeKey', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'High Grass' }),
    row({ violationIssueType: 'high grass' }),
    row({ violationIssueType: '  High   Grass  ' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].violationTypeKey, violationTypeKey('High Grass'));
});

test('buildReviewGroups: empty type + two different descriptions → 2 singleton groups', () => {
  const rows = assignRowIds([
    row({ violationIssueType: '', descriptionNotes: 'fence permit only' }),
    row({ violationIssueType: '   ', descriptionNotes: 'pool permit expired' })
  ]);
  const groups = buildReviewGroups(rows, 'not_distressed');
  assert.equal(groups.length, 2);
  for (const g of groups) {
    assert.equal(g.violationTypeKey, '__unknown__');
    assert.equal(g.count, 1);
    assert.equal(g.isSingleton, true);
    assert.ok(g.descriptionKey === 'fence permit only' || g.descriptionKey === 'pool permit expired');
  }
  const descKeys = groups.map((g) => g.descriptionKey).sort();
  assert.deepEqual(descKeys, ['fence permit only', 'pool permit expired']);
});

test('buildReviewGroups: matchedIndicators union across rows in group', () => {
  const rows = assignRowIds([
    row({ matchedIndicators: ['weeds', 'overgrown'] }),
    row({ matchedIndicators: ['weeds', 'tall grass'] }),
    row({ matchedIndicators: ['debris'] })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].matchedIndicators, ['weeds', 'overgrown', 'tall grass', 'debris']);
});

test('buildReviewGroups: descriptionSamples unique, max 5', () => {
  const rows = assignRowIds(
    Array.from({ length: 6 }, (_, i) =>
      row({ descriptionNotes: `desc-${i}`, streetAddress: `${i} Sample St` })
    )
  );
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].descriptionSamples.length, 5);
  assert.equal(new Set(groups[0].descriptionSamples).size, 5);
});

test('buildReviewGroups: sampleAddresses max 5', () => {
  const rows = assignRowIds(
    Array.from({ length: 8 }, (_, i) =>
      row({ streetAddress: `${i} Address Ln`, descriptionNotes: `n-${i}` })
    )
  );
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sampleAddresses.length, 5);
});

test('buildReviewGroups: isSingleton true iff count === 1', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'Type A' }),
    row({ violationIssueType: 'Type B' }),
    row({ violationIssueType: 'Type B' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  const byKey = Object.fromEntries(groups.map((g) => [g.violationTypeKey, g]));
  assert.equal(byKey['type a'].isSingleton, true);
  assert.equal(byKey['type a'].count, 1);
  assert.equal(byKey['type b'].isSingleton, false);
  assert.equal(byKey['type b'].count, 2);
});

test('buildReviewGroups: sort count desc then label', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'Zebra Type' }),
    row({ violationIssueType: 'Alpha Type' }),
    row({ violationIssueType: 'Alpha Type' }),
    row({ violationIssueType: 'Middle Type' }),
    row({ violationIssueType: 'Middle Type' }),
    row({ violationIssueType: 'Middle Type' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups[0].violationTypeLabel, 'Middle Type');
  assert.equal(groups[0].count, 3);
  assert.equal(groups[1].violationTypeLabel, 'Alpha Type');
  assert.equal(groups[1].count, 2);
  assert.equal(groups[2].violationTypeLabel, 'Zebra Type');
  assert.equal(groups[2].count, 1);
});

test('buildReviewGroups: groupId matches groupIdFor helper', () => {
  const rows = assignRowIds([row()]);
  const groups = buildReviewGroups(rows, 'distressed');
  const g = groups[0];
  assert.equal(g.groupId, groupIdFor(g.section, g.violationTypeKey, g.descriptionKey));
});

test('buildReviewGroups: no private underscore fields on returned groups', () => {
  const rows = assignRowIds([row()]);
  const groups = buildReviewGroups(rows, 'distressed');
  for (const g of groups) {
    for (const key of Object.keys(g)) {
      assert.ok(!key.startsWith('_'), `private field leaked: ${key}`);
    }
  }
});

// --- Phase 49: stable group keys (GROUP-01..04) ---

test('buildReviewGroups: empty type + same phrase different timestamps → 1 group count N', () => {
  // GROUP-01
  const rows = assignRowIds([
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/15/2024 10:30',
      matchedIndicators: ['weeds']
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/16/2024 11:00',
      streetAddress: '456 Oak'
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/17/2024 09:15',
      streetAddress: '789 Pine'
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].isSingleton, false);
  assert.equal(groups[0].violationTypeKey, '__unknown__');
  // raw variants still visible in samples
  assert.ok(groups[0].descriptionSamples.length >= 2);
});

test('buildReviewGroups: typed values with embedded timestamps stack', () => {
  // GROUP-02
  const rows = assignRowIds([
    row({ violationIssueType: 'High Grass and Weeds - 01/15/2024 10:30' }),
    row({ violationIssueType: 'High Grass and Weeds - 01/16/2024 11:00' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].isSingleton, false);
});

test('buildReviewGroups: after timestamp stack isSingleton false when count > 1', () => {
  // GROUP-04 integration — formula remains count === 1
  const stacked = assignRowIds([
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/15/2024 10:30'
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'High Grass and Weeds - 01/16/2024 11:00',
      streetAddress: '456 Oak'
    })
  ]);
  const stackedGroups = buildReviewGroups(stacked, 'distressed');
  assert.equal(stackedGroups.length, 1);
  assert.equal(stackedGroups[0].count, 2);
  assert.equal(stackedGroups[0].isSingleton, false);

  const singleton = assignRowIds([
    row({
      violationIssueType: '',
      descriptionNotes: 'unique free-text only once - 01/15/2024 10:30'
    })
  ]);
  const singletonGroups = buildReviewGroups(singleton, 'distressed');
  assert.equal(singletonGroups.length, 1);
  assert.equal(singletonGroups[0].count, 1);
  assert.equal(singletonGroups[0].isSingleton, true);
});
