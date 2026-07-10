/**
 * Phase 58 pure learning metrics (LRN-01, LRN-02)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeDecisionTrend,
  scoreGoldKeepKill,
  scoreApplyCoverage,
  buildLearningHealth,
  GOLD_KEEP_FRAGS,
  GOLD_DENY_FRAGS,
  BANNED_SILENT_DROP_RE
} = require('../lib/bridge-learning-metrics');
const { DECISION_ACTIONS } = require('../lib/bridge-brain-store');

const STRONG = 'Strong Distressed Signal';

function strongRow(addr) {
  return { streetAddress: addr, distressedSignalTag: STRONG };
}

test('LRN-01: computeDecisionTrend fewer recent decisions → down (time buckets)', () => {
  const events = [];
  // latest = 2026-03-01; window 25d → recent (Feb 4–Mar 1], previous (Jan 10–Feb 4]
  for (let i = 0; i < 20; i++) {
    events.push({ action: 'deny_group', at: `2026-01-${String(10 + (i % 20)).padStart(2, '0')}T12:00:00Z` });
  }
  for (let i = 0; i < 5; i++) {
    events.push({ action: 'deny_group', at: `2026-02-${String(10 + i).padStart(2, '0')}T12:00:00Z` });
  }
  events.push({ action: 'deny_group', at: '2026-03-01T12:00:00Z' });
  const t = computeDecisionTrend(events, { windowSize: 25 });
  assert.equal(t.direction, 'down');
  assert.ok(t.previousCount > t.recentCount);
  assert.equal(t.decisionActionsOnly, true);
  assert.ok(DECISION_ACTIONS.has('deny_group'));
});

test('LRN-01: computeDecisionTrend more recent decisions → up (time buckets)', () => {
  const events = [];
  for (let i = 0; i < 5; i++) {
    events.push({ action: 'approve_group', at: `2026-01-${String(12 + i).padStart(2, '0')}T12:00:00Z` });
  }
  for (let i = 0; i < 20; i++) {
    events.push({ action: 'approve_group', at: `2026-02-${String(5 + (i % 20)).padStart(2, '0')}T12:00:00Z` });
  }
  events.push({ action: 'approve_group', at: '2026-03-01T12:00:00Z' });
  const t = computeDecisionTrend(events, { windowSize: 25 });
  assert.equal(t.direction, 'up');
  assert.ok(t.recentCount > t.previousCount);
});

test('LRN-01: computeDecisionTrend ignores undo and non-decision actions', () => {
  const events = [
    { action: 'deny_group' },
    { action: 'undo' },
    { action: 'approve_phrase_rule' },
    { action: 'process_apply' },
    { action: 'approve_group' }
  ];
  const t = computeDecisionTrend(events, { windowSize: 25 });
  assert.equal(t.recentCount + t.previousCount, 2);
});

test('LRN-01: scoreGoldKeepKill perfect keep+deny', () => {
  const rows = GOLD_KEEP_FRAGS.map((f) => strongRow(`${f} St`));
  const s = scoreGoldKeepKill({ rows });
  assert.equal(s.tp, 5);
  assert.equal(s.fn, 0);
  assert.equal(s.fp, 0);
  assert.equal(s.precision, 1);
  assert.equal(s.recall, 1);
  assert.ok(GOLD_DENY_FRAGS.length === 5);
});

test('LRN-01: scoreGoldKeepKill FN and FP', () => {
  const rows = [
    strongRow('100 Gold Keep St'),
    strongRow('200 Gold Keep St'),
    strongRow('300 Gold Keep St'),
    strongRow('400 Gold Keep St'),
    strongRow('100 Gold Deny St')
  ];
  const s = scoreGoldKeepKill({ rows });
  assert.equal(s.tp, 4);
  assert.equal(s.fn, 1);
  assert.equal(s.fp, 1);
  assert.equal(s.recall, 0.8);
  assert.ok(s.precision < 1);
});

test('LRN-02: scoreApplyCoverage empty applied → not sufficient', () => {
  const c = scoreApplyCoverage({ appliedRuleIds: [] });
  assert.equal(c.sufficient, false);
  assert.equal(c.rulesAppliedCount, 0);
});

test('LRN-02: scoreApplyCoverage expected type rule hit → sufficient', () => {
  const c = scoreApplyCoverage({
    appliedRuleIds: ['tr_x'],
    activeRuleIdsExpected: ['tr_x']
  });
  assert.equal(c.sufficient, true);
});

test('LRN-02: proposed phrase alone does not satisfy expected type rules', () => {
  const c = scoreApplyCoverage({
    appliedRuleIds: ['pr_phrase_only'],
    activeRuleIdsExpected: ['tr_type_suppress']
  });
  assert.equal(c.sufficient, false);
});

test('LRN-02: silent-drop blob forces pairedOk false', () => {
  const health = buildLearningHealth({
    events: Array.from({ length: 5 }, () => ({ action: 'deny_group' })),
    goldScore: { precision: 1, recall: 1, source: 'test' },
    applyCoverage: { appliedRuleIds: ['tr_x'], source: 'test' },
    discardBlob: 'no_type_column'
  });
  assert.equal(health.silentDropFailure, true);
  assert.equal(health.pairedOk, false);
  assert.equal(Object.prototype.hasOwnProperty.call(health, 'groupsHidden'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(health, 'hiddenGroups'), false);
  assert.ok(BANNED_SILENT_DROP_RE.test('no_type'));
});

test('LRN-01: fewer decisions alone does not set pairedOk without coverage', () => {
  const health = buildLearningHealth({
    events: [{ action: 'deny_group' }],
    goldScore: { precision: 1, recall: 1, source: 'test' },
    applyCoverage: { appliedRuleIds: [], source: 'unknown' }
  });
  assert.equal(health.gold.degraded, false);
  assert.equal(health.applyCoverage.sufficient, false);
  assert.equal(health.pairedOk, false);
});

test('LRN-01: perfect gold + sufficient coverage → pairedOk true', () => {
  const health = buildLearningHealth({
    events: [{ action: 'approve_group' }, { action: 'deny_group' }],
    goldScore: { precision: 1, recall: 1, source: 'test' },
    applyCoverage: { appliedRuleIds: ['tr_live'], source: 'process' }
  });
  assert.ok(health.decisionTrend);
  assert.equal(health.gold.degraded, false);
  assert.equal(health.applyCoverage.sufficient, true);
  assert.equal(health.pairedOk, true);
});
