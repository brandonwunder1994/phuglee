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

// --- Confident category stack (STACK-01..04) ---

test('buildReviewGroups: Irving-like HGW note variants stack (STACK-01)', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'HGW' }),
    row({
      violationIssueType: 'HGW - OVERGROWN GRASS',
      streetAddress: '100 A St'
    }),
    row({
      violationIssueType: 'HGW\n*CALL BACK WITH UPDATES*',
      streetAddress: '200 B St'
    }),
    row({
      violationIssueType: 'HGW X2',
      streetAddress: '300 C St'
    }),
    row({
      violationIssueType: 'HGW-AROUND FOUNDATION OF HOME',
      streetAddress: '400 D St'
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1, 'STACK-01: all pure HGW tails → 1 group');
  assert.equal(groups[0].count, 5);
  assert.equal(groups[0].isSingleton, false);
  assert.equal(groups[0].violationTypeKey, 'hgw');
});

test('buildReviewGroups: HGW combo set separate from pure HGW (STACK-02)', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'HGW' }),
    row({ violationIssueType: 'HGW - OVERGROWN', streetAddress: '2' }),
    row({ violationIssueType: 'HGW/TD - trash front', streetAddress: '3' }),
    row({ violationIssueType: 'HGW, TD - move out', streetAddress: '4' })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 2, 'STACK-02: pure HGW vs HGW+TD');
  const byKey = Object.fromEntries(groups.map((g) => [g.violationTypeKey, g]));
  assert.equal(byKey.hgw.count, 2);
  assert.equal(byKey['hgw+td'].count, 2);
});

test('buildReviewGroups: O/S stacks as os not letter-split (STACK-01)', () => {
  const rows = assignRowIds([
    row({ violationIssueType: 'O/S - washer in driveway' }),
    row({
      violationIssueType: 'O/S - containers on curb',
      streetAddress: '9 Oak'
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].violationTypeKey, 'os');
});

test('buildReviewGroups: free-text fence vs pool still 2 groups (STACK-03)', () => {
  const rows = assignRowIds([
    row({ violationIssueType: '', descriptionNotes: 'fence permit only' }),
    row({
      violationIssueType: '',
      descriptionNotes: 'pool permit expired',
      streetAddress: '2'
    })
  ]);
  const groups = buildReviewGroups(rows, 'not_distressed');
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.isSingleton && g.count === 1));
});

test('buildReviewGroups: empty-type HGW free-text tails stack (STACK-01 desc path)', () => {
  const rows = assignRowIds([
    row({
      violationIssueType: '',
      descriptionNotes: 'HGW - FRONT AND BACK'
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'HGW SIDEWALK',
      streetAddress: '2'
    }),
    row({
      violationIssueType: '',
      descriptionNotes: 'Hgw',
      streetAddress: '3'
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].isSingleton, false);
});

// --- Phase 53: display-only shortLabel (LBL-01 / LBL-02) — RED until Plan 03 ---

const LONG_ORDINANCE_TYPE =
  'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels and enforcement procedures';

test('LBL-01/02: buildReviewGroups attaches parallel shortLabel; full violationTypeLabel preserved', () => {
  const rows = assignRowIds([
    row({ violationIssueType: LONG_ORDINANCE_TYPE })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(groups.length, 1);
  const g = groups[0];

  // Parallel field — not a replacement for full label
  assert.equal(typeof g.shortLabel, 'string', 'LBL-01: group.shortLabel must be a string');
  assert.ok(g.shortLabel.length > 0, 'LBL-01: shortLabel non-empty for non-empty type');
  assert.ok(
    g.shortLabel.length <= 64,
    `LBL-01: shortLabel length ≤ 64 (got ${g.shortLabel.length})`
  );
  assert.ok(
    g.shortLabel.length <= g.violationTypeLabel.length,
    'LBL-01: shortLabel must be shorter or equal to full violationTypeLabel'
  );

  // Full cleaned label must remain the wall (or cleaned full) — not ellipsis-only mutation
  assert.equal(typeof g.violationTypeLabel, 'string');
  assert.ok(
    g.violationTypeLabel.length > g.shortLabel.length ||
      g.violationTypeLabel === g.shortLabel,
    'LBL-02: violationTypeLabel stays FULL (not shortened in place)'
  );
  assert.ok(
    !g.violationTypeLabel.endsWith('…') || g.violationTypeLabel.includes('—') || g.violationTypeLabel.includes('Sec.'),
    'LBL-02: full field must not be hard-truncated-only replacement of type wall'
  );
  // When wall is long, full label should still contain ordinance cues after clean
  assert.ok(
    g.violationTypeLabel.includes('High Grass') || g.violationTypeLabel.includes('Weeds'),
    'LBL-02: full label retains category text'
  );
});

test('LBL-02: two long types sharing long prefix still produce 2 groups (short must not merge)', () => {
  // Same first 48+ chars; differ only after — short label must NOT become group key
  const prefix =
    'Residential Property Maintenance Violation Category Alpha Shared Prefix Text ';
  assert.ok(prefix.length >= 40, 'fixture prefix must be 40+ chars');
  const typeA = `${prefix}ENDING_ALPHA_UNIQUE_TAIL_ONE`;
  const typeB = `${prefix}ENDING_BETA_UNIQUE_TAIL_TWO`;
  assert.notEqual(typeA, typeB);

  const rows = assignRowIds([
    row({ violationIssueType: typeA, streetAddress: '1 Alpha St' }),
    row({
      violationIssueType: typeB,
      streetAddress: '2 Beta St',
      matchedIndicators: ['maintenance']
    })
  ]);
  const groups = buildReviewGroups(rows, 'distressed');
  assert.equal(
    groups.length,
    2,
    'LBL-02: distinct full types must not collapse into one group via short label'
  );
  const ids = new Set(groups.map((g) => g.groupId));
  const keys = new Set(groups.map((g) => g.violationTypeKey));
  assert.equal(ids.size, 2, 'LBL-02: distinct groupId for each full type');
  assert.equal(keys.size, 2, 'LBL-02: distinct violationTypeKey for each full type');
});

test('LBL-02: buildReviewGroups does not mutate input row violationIssueType', () => {
  const originalType = LONG_ORDINANCE_TYPE;
  const rows = assignRowIds([
    row({ violationIssueType: originalType, streetAddress: '99 Immutable Ln' })
  ]);
  const before = rows.map((r) => r.violationIssueType);
  buildReviewGroups(rows, 'distressed');
  const after = rows.map((r) => r.violationIssueType);
  assert.deepEqual(
    after,
    before,
    'LBL-02: source row.violationIssueType must remain full after grouping'
  );
  assert.equal(rows[0].violationIssueType, originalType);
});

test('LBL-02: shortLabel is public (no private _ fields); shortLabel allowed on public group', () => {
  const rows = assignRowIds([row({ violationIssueType: LONG_ORDINANCE_TYPE })]);
  const groups = buildReviewGroups(rows, 'distressed');
  for (const g of groups) {
    for (const key of Object.keys(g)) {
      assert.ok(!key.startsWith('_'), `private field leaked: ${key}`);
    }
    assert.ok(
      Object.prototype.hasOwnProperty.call(g, 'shortLabel'),
      'LBL-01: shortLabel is a public field on the group DTO'
    );
  }
});
