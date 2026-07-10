/**
 * Phase 47-01 — brain hardening: caps, version 409, metrics, undoLastDecision.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalRoot = config.BRIDGE_BRAIN_ROOT;
let tempRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-hard-'));
  config.BRIDGE_BRAIN_ROOT = tempRoot;
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalRoot;
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});

beforeEach(() => {
  // Isolate each test to a clean brain root
  const sub = fs.mkdtempSync(path.join(tempRoot, 'case-'));
  config.BRIDGE_BRAIN_ROOT = sub;
});

const {
  emptyBrain,
  loadBrain,
  saveBrain,
  BRAIN_CAPS,
  capArray,
  enforceBrainCaps,
  recomputeMetrics
} = require('../lib/bridge-brain-store');
const { undoLastDecision, applyDecision } = require('../lib/bridge-brain-decisions');

// ─── Caps ───────────────────────────────────────────────────────────────────

test('BRAIN_CAPS defaults: events 2000, typeRules 500, phraseRules 500', () => {
  assert.equal(BRAIN_CAPS.events, 2000);
  assert.equal(BRAIN_CAPS.typeRules, 500);
  assert.equal(BRAIN_CAPS.phraseRules, 500);
});

test('capArray keeps last N items; non-array → []', () => {
  assert.deepEqual(capArray([1, 2, 3, 4, 5], 3), [3, 4, 5]);
  assert.deepEqual(capArray(null, 5), []);
  assert.deepEqual(capArray(undefined, 5), []);
});

test('saveBrain with 2500 events caps to 2000 and increments version', () => {
  const brain = emptyBrain();
  brain.events = Array.from({ length: 2500 }, (_, i) => ({
    id: `ev_${i}`,
    at: new Date().toISOString(),
    by: 'admin',
    action: 'deny_group'
  }));
  const before = loadBrain();
  const saved = saveBrain(brain);
  assert.equal(saved.events.length, 2000);
  // Simple slice(-cap): keeps newest (highest indices)
  assert.equal(saved.events[0].id, 'ev_500');
  assert.equal(saved.events[1999].id, 'ev_2499');
  assert.equal(saved.version, (Number(before.version) || 0) + 1);

  const loaded = loadBrain();
  assert.equal(loaded.events.length, 2000);
});

test('saveBrain caps typeRules and phraseRules at 500', () => {
  const brain = emptyBrain();
  brain.typeRules = Array.from({ length: 600 }, (_, i) => ({
    id: `tr_${i}`,
    kind: 'suppress_type',
    violationTypeKey: `type ${i}`,
    status: i < 100 ? 'disabled' : 'active'
  }));
  brain.phraseRules = Array.from({ length: 550 }, (_, i) => ({
    id: `pr_${i}`,
    kind: 'suppress_phrase',
    pattern: `p${i}`,
    status: 'proposed'
  }));
  const saved = saveBrain(brain);
  assert.equal(saved.typeRules.length, 500);
  assert.equal(saved.phraseRules.length, 500);
});

test('enforceBrainCaps mutates arrays in place within caps', () => {
  const brain = emptyBrain();
  brain.events = Array.from({ length: 10 }, (_, i) => ({ id: i }));
  enforceBrainCaps(brain);
  assert.ok(brain.events.length <= BRAIN_CAPS.events);
});

// ─── Version conflict ───────────────────────────────────────────────────────

test('saveBrain with stale expectedVersion throws VERSION_CONFLICT statusCode 409', () => {
  const first = saveBrain(emptyBrain());
  assert.ok(first.version >= 1);

  const stale = emptyBrain();
  stale.typeRules = [{ id: 'tr_x', kind: 'suppress_type', status: 'active' }];
  assert.throws(
    () => saveBrain(stale, { expectedVersion: first.version - 1 }),
    (err) => {
      assert.equal(err.code, 'VERSION_CONFLICT');
      assert.equal(err.statusCode, 409);
      return true;
    }
  );

  // Disk unchanged by failed write (still first version content)
  const loaded = loadBrain();
  assert.equal(loaded.version, first.version);
  assert.equal(loaded.typeRules.length, 0);
});

test('saveBrain with matching expectedVersion succeeds and bumps version', () => {
  const first = saveBrain(emptyBrain());
  const next = emptyBrain();
  next.typeRules = [{ id: 'tr_ok', kind: 'promote_type', status: 'active' }];
  const saved = saveBrain(next, { expectedVersion: first.version });
  assert.equal(saved.version, first.version + 1);
  assert.equal(saved.typeRules[0].id, 'tr_ok');
});

// ─── Metrics ────────────────────────────────────────────────────────────────

test('recomputeMetrics matches fixture counts (decisions, active, proposed, suppress/promote)', () => {
  const brain = emptyBrain();
  brain.typeRules = [
    { id: 't1', kind: 'suppress_type', status: 'active' },
    { id: 't2', kind: 'suppress_type', status: 'disabled' },
    { id: 't3', kind: 'promote_type', status: 'active' },
    { id: 't4', kind: 'promote_type', status: 'active' }
  ];
  brain.phraseRules = [
    { id: 'p1', kind: 'suppress_phrase', status: 'active' },
    { id: 'p2', kind: 'promote_phrase', status: 'proposed' },
    { id: 'p3', kind: 'promote_phrase', status: 'proposed' },
    { id: 'p4', kind: 'promote_phrase', status: 'active' }
  ];
  brain.events = [
    { id: 'e1', action: 'approve_group' },
    { id: 'e2', action: 'deny_group' },
    { id: 'e3', action: 'approve_row' },
    { id: 'e4', action: 'deny_row' },
    { id: 'e5', action: 'undo' },
    { id: 'e6', action: 'enable_rule' }
  ];

  const m = recomputeMetrics(brain);
  assert.equal(m.totalDecisions, 4); // approve/deny group/row only
  assert.equal(m.typeRulesActive, 3); // t1, t3, t4
  assert.equal(m.phraseRulesActive, 2); // p1, p4
  assert.equal(m.phraseRulesProposed, 2); // p2, p3
  // suppress: t1 + p1 = 2; promote: t3 + t4 + p4 = 3
  assert.equal(m.suppressCount, 2);
  assert.equal(m.promoteCount, 3);
});

test('saveBrain recomputes metrics on every successful write', () => {
  const brain = emptyBrain();
  brain.typeRules = [
    { id: 't1', kind: 'suppress_type', status: 'active' }
  ];
  brain.events = [{ id: 'e1', action: 'deny_group' }];
  const saved = saveBrain(brain);
  assert.equal(saved.metrics.totalDecisions, 1);
  assert.equal(saved.metrics.typeRulesActive, 1);
  assert.equal(saved.metrics.suppressCount, 1);
  assert.equal(saved.metrics.promoteCount, 0);
});

// ─── undoLastDecision ───────────────────────────────────────────────────────

test('undoLastDecision disables rules in last event.resultingRuleIds; marks undone; appends undo event', () => {
  const brain = emptyBrain();
  brain.typeRules = [
    {
      id: 'tr_suppress_1',
      kind: 'suppress_type',
      violationTypeKey: 'fence permit',
      status: 'active'
    }
  ];
  brain.events = [
    {
      id: 'ev_old',
      at: '2026-07-01T00:00:00.000Z',
      by: 'admin',
      action: 'deny_group',
      resultingRuleIds: ['tr_suppress_1'],
      undone: false
    }
  ];

  const result = undoLastDecision(brain, { by: 'admin' });
  assert.ok(result);
  const rule = brain.typeRules.find((r) => r.id === 'tr_suppress_1');
  assert.equal(rule.status, 'disabled');
  assert.equal(brain.events[0].undone, true);
  const undoEv = brain.events[brain.events.length - 1];
  assert.equal(undoEv.action, 'undo');
  assert.equal(undoEv.by, 'admin');
  assert.equal(undoEv.undoneEventId, 'ev_old');
  assert.deepEqual(undoEv.resultingRuleIds, ['tr_suppress_1']);
});

test('second undoLastDecision with nothing left throws NOTHING_TO_UNDO', () => {
  const brain = emptyBrain();
  brain.events = [
    {
      id: 'ev_1',
      by: 'admin',
      action: 'deny_group',
      resultingRuleIds: [],
      undone: true
    },
    {
      id: 'ev_undo',
      by: 'admin',
      action: 'undo',
      undoneEventId: 'ev_1'
    }
  ];

  assert.throws(
    () => undoLastDecision(brain, { by: 'admin' }),
    (err) => {
      assert.equal(err.code, 'NOTHING_TO_UNDO');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test('undoLastDecision only undoes events for the given by user', () => {
  const brain = emptyBrain();
  brain.typeRules = [
    { id: 'tr_a', kind: 'suppress_type', status: 'active' }
  ];
  brain.events = [
    {
      id: 'ev_other',
      by: 'other',
      action: 'deny_group',
      resultingRuleIds: ['tr_a']
    }
  ];

  assert.throws(
    () => undoLastDecision(brain, { by: 'admin' }),
    (err) => err.code === 'NOTHING_TO_UNDO'
  );
  assert.equal(brain.typeRules[0].status, 'active');
});

test('applyDecision then undoLastDecision reverts the created suppress rule', () => {
  const brain = emptyBrain();
  const rows = [
    {
      rowId: 'r1',
      streetAddress: '1 Main',
      violationIssueType: 'Fence Permit',
      distressedSignalTag: 'Strong Distressed Signal'
    }
  ];
  const result = applyDecision(
    {
      action: 'deny',
      section: 'distressed',
      rowIds: ['r1'],
      violationTypeKey: 'fence permit',
      violationTypeLabel: 'Fence Permit'
    },
    { brain, currentRows: rows, notDistressedRows: [], by: 'admin' }
  );
  assert.ok(result.event.resultingRuleIds.length >= 1);
  const ruleId = result.event.resultingRuleIds[0];
  assert.equal(
    brain.typeRules.find((r) => r.id === ruleId).status,
    'active'
  );

  undoLastDecision(brain, { by: 'admin' });
  assert.equal(brain.typeRules.find((r) => r.id === ruleId).status, 'disabled');
  assert.equal(result.event.undone, true);
});

// ─── HARD-04: docs document Superpower Brain layers ─────────────────────────

test('TAGGING-RULES.md documents Filter Superpower Brain promote/suppress layers', () => {
  const docPath = path.join(__dirname, '..', 'docs', 'bridge', 'TAGGING-RULES.md');
  const text = fs.readFileSync(docPath, 'utf8');
  assert.match(text, /Superpower Brain/);
  assert.match(text, /promote type/i);
  assert.match(text, /suppress type/i);
  assert.match(text, /base regex/i);
  assert.match(text, /Water shut-off/i);
});
