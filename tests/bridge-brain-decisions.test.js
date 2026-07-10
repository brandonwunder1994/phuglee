/**
 * Phase 45-01 — pure applyDecision four-way matrix (DEC-01–05).
 * RED then GREEN via lib/bridge-brain-decisions.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { emptyBrain, violationTypeKey } = require('../lib/bridge-brain-store');
const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { applyBrainToRows } = require('../lib/bridge-brain-apply');
const {
  applyDecision,
  upsertTypeRule,
  disableTypeRules
} = require('../lib/bridge-brain-decisions');

function makeBrain(overrides = {}) {
  const brain = emptyBrain();
  return Object.assign(brain, overrides);
}

function row(partial = {}) {
  return {
    rowId: partial.rowId || 'r_1',
    streetAddress: partial.streetAddress || '100 Main St',
    violationIssueType: partial.violationIssueType || 'Fence Permit',
    violationDate: partial.violationDate || '2024-01-01',
    descriptionNotes: partial.descriptionNotes || '',
    distressedSignalTag: partial.distressedSignalTag,
    matchedIndicators: partial.matchedIndicators,
    confidenceLevel: partial.confidenceLevel,
    ...partial
  };
}

function ctx(brain, currentRows, notDistressedRows, by = 'admin') {
  return { brain, currentRows, notDistressedRows, by };
}

// ─── DEC-01: distressed + deny moves rowIds to not-distressed ───────────────

test('DEC-01: distressed deny moves matching rowIds to notDistressed; keeps others', () => {
  const brain = makeBrain();
  const rows = [
    row({ rowId: 'r_keep', violationIssueType: 'Weeds' }),
    row({ rowId: 'r_drop', violationIssueType: 'Fence Permit' }),
    row({ rowId: 'r_drop2', violationIssueType: 'Fence Permit' })
  ];
  const result = applyDecision(
    {
      action: 'deny',
      section: 'distressed',
      rowIds: ['r_drop', 'r_drop2'],
      violationTypeKey: violationTypeKey('Fence Permit'),
      violationTypeLabel: 'Fence Permit'
    },
    ctx(brain, rows, [])
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].rowId, 'r_keep');
  assert.equal(result.notDistressedRows.length, 2);
  assert.ok(result.notDistressedRows.every((r) => r.rowId === 'r_drop' || r.rowId === 'r_drop2'));
  assert.ok(result.notDistressedRows.every((r) => r.brainDecision === 'demoted'));
  assert.ok(Array.isArray(result.reviewGroups.distressed));
  assert.ok(Array.isArray(result.reviewGroups.notDistressed));
});

// ─── DEC-02: not_distressed + deny promotes into kept with Strong tag ───────

test('DEC-02: not_distressed deny moves rows into kept with Strong Distressed Signal', () => {
  const brain = makeBrain();
  const currentRows = [row({ rowId: 'r_existing', violationIssueType: 'Weeds' })];
  const notDistressedRows = [
    row({
      rowId: 'r_promote',
      violationIssueType: 'High Grass and Weeds',
      distressedSignalTag: 'Standard'
    }),
    row({ rowId: 'r_stay', violationIssueType: 'Fence Permit' })
  ];

  const result = applyDecision(
    {
      action: 'deny',
      section: 'not_distressed',
      rowIds: ['r_promote'],
      violationTypeKey: violationTypeKey('High Grass and Weeds'),
      violationTypeLabel: 'High Grass and Weeds'
    },
    ctx(brain, currentRows, notDistressedRows)
  );

  assert.equal(result.notDistressedRows.length, 1);
  assert.equal(result.notDistressedRows[0].rowId, 'r_stay');
  const promoted = result.rows.find((r) => r.rowId === 'r_promote');
  assert.ok(promoted, 'promoted row should appear in kept rows');
  assert.equal(promoted.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.equal(result.rows.length, 2);
});

// ─── DEC-03: distressed + deny upserts suppress_type; disables promote ──────

test('DEC-03: distressed deny upserts active suppress_type and disables promote_type same key', () => {
  const key = violationTypeKey('Fence Permit');
  const brain = makeBrain({
    typeRules: [
      {
        id: 'tr_old_promote',
        kind: 'promote_type',
        violationTypeKey: key,
        violationTypeLabel: 'Fence Permit',
        status: 'active',
        hitCount: 1
      }
    ]
  });
  const rows = [row({ rowId: 'r1', violationIssueType: 'Fence Permit' })];

  const result = applyDecision(
    {
      action: 'deny',
      section: 'distressed',
      rowIds: ['r1'],
      violationTypeKey: key,
      violationTypeLabel: 'Fence Permit'
    },
    ctx(brain, rows, [])
  );

  const suppress = result.brain.typeRules.filter(
    (r) => r.kind === 'suppress_type' && r.violationTypeKey === key && r.status === 'active'
  );
  assert.equal(suppress.length, 1, 'exactly one active suppress_type');

  const promote = result.brain.typeRules.find((r) => r.id === 'tr_old_promote');
  assert.equal(promote.status, 'disabled');
  assert.ok(promote.disabledAt);
});

// ─── DEC-04: not_distressed + deny upserts promote_type; disables suppress ──

test('DEC-04: not_distressed deny upserts promote_type and disables suppress_type same key', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = makeBrain({
    typeRules: [
      {
        id: 'tr_old_suppress',
        kind: 'suppress_type',
        violationTypeKey: key,
        violationTypeLabel: 'High Grass and Weeds',
        status: 'active',
        hitCount: 2
      }
    ]
  });
  const notDistressedRows = [
    row({ rowId: 'r_p', violationIssueType: 'High Grass and Weeds' })
  ];

  const result = applyDecision(
    {
      action: 'deny',
      section: 'not_distressed',
      rowIds: ['r_p'],
      violationTypeKey: key,
      violationTypeLabel: 'High Grass and Weeds'
    },
    ctx(brain, [], notDistressedRows)
  );

  const promote = result.brain.typeRules.filter(
    (r) => r.kind === 'promote_type' && r.violationTypeKey === key && r.status === 'active'
  );
  assert.equal(promote.length, 1, 'exactly one active promote_type');

  const suppress = result.brain.typeRules.find((r) => r.id === 'tr_old_suppress');
  assert.equal(suppress.status, 'disabled');
});

// ─── DEC-05: every path appends audit event ──────────────────────────────────

test('DEC-05: every decision path appends one event with by/at/action/section/type/counts', () => {
  const cases = [
    { action: 'deny', section: 'distressed', label: 'Fence Permit' },
    { action: 'approve', section: 'distressed', label: 'Weeds' },
    { action: 'approve', section: 'not_distressed', label: 'High Grass' },
    { action: 'deny', section: 'not_distressed', label: 'Fence Permit' }
  ];

  for (const c of cases) {
    const brain = makeBrain();
    const key = violationTypeKey(c.label);
    const rows =
      c.section === 'distressed'
        ? [row({ rowId: 'r1', violationIssueType: c.label })]
        : [];
    const notDistressedRows =
      c.section === 'not_distressed'
        ? [row({ rowId: 'r1', violationIssueType: c.label })]
        : [];

    const result = applyDecision(
      {
        action: c.action,
        section: c.section,
        rowIds: ['r1'],
        violationTypeKey: key,
        violationTypeLabel: c.label
      },
      ctx(brain, rows, notDistressedRows)
    );

    assert.equal(result.brain.events.length, 1, `${c.section}+${c.action} should append one event`);
    const ev = result.event;
    assert.equal(ev, result.brain.events[0]);
    assert.ok(String(ev.id).startsWith('ev_'));
    assert.equal(ev.by, 'admin');
    assert.ok(ev.at);
    assert.match(String(ev.at), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(ev.action, c.action === 'approve' ? 'approve_group' : 'deny_group');
    assert.equal(ev.section, c.section);
    assert.equal(ev.violationTypeKey, key);
    assert.equal(typeof ev.rowCount, 'number');
  }
});

// ─── Affirmations: no wrong type rules ──────────────────────────────────────

test('affirmation: distressed+approve does NOT add promote_type; disables suppress if present', () => {
  const key = violationTypeKey('Weeds');
  const brain = makeBrain({
    typeRules: [
      {
        id: 'tr_s',
        kind: 'suppress_type',
        violationTypeKey: key,
        status: 'active'
      }
    ]
  });
  const rows = [row({ rowId: 'r1', violationIssueType: 'Weeds' })];

  const result = applyDecision(
    {
      action: 'approve',
      section: 'distressed',
      rowIds: ['r1'],
      violationTypeKey: key,
      violationTypeLabel: 'Weeds'
    },
    ctx(brain, rows, [])
  );

  assert.equal(result.rows.length, 1, 'rows unchanged');
  const promotes = result.brain.typeRules.filter((r) => r.kind === 'promote_type');
  assert.equal(promotes.length, 0, 'no promote_type from affirmation');
  const suppress = result.brain.typeRules.find((r) => r.id === 'tr_s');
  assert.equal(suppress.status, 'disabled');
});

test('affirmation: not_distressed+approve does NOT add suppress_type or promote_type', () => {
  const key = violationTypeKey('Fence Permit');
  const brain = makeBrain();
  const notDistressedRows = [row({ rowId: 'r1', violationIssueType: 'Fence Permit' })];

  const result = applyDecision(
    {
      action: 'approve',
      section: 'not_distressed',
      rowIds: ['r1'],
      violationTypeKey: key,
      violationTypeLabel: 'Fence Permit'
    },
    ctx(brain, [], notDistressedRows)
  );

  assert.equal(result.rows.length, 0);
  assert.equal(result.notDistressedRows.length, 1);
  assert.equal(result.brain.typeRules.length, 0, 'no type rules from FN approve affirmation');
});

// ─── Sequential promotes must accumulate (client race regression) ───────────

test('sequential not_distressed denies accumulate kept count (no stale overwrite)', () => {
  const brain = makeBrain();
  const kept = Array.from({ length: 84 }, (_, i) =>
    row({ rowId: `k${i}`, violationIssueType: 'Weeds' })
  );
  const fn = [
    row({ rowId: 'fn1', violationIssueType: 'Boarded Windows', distressedSignalTag: 'Standard' }),
    row({ rowId: 'fn2', violationIssueType: 'Junk Vehicle', distressedSignalTag: 'Standard' })
  ];

  const r1 = applyDecision(
    {
      action: 'deny',
      section: 'not_distressed',
      rowIds: ['fn1'],
      violationTypeLabel: 'Boarded Windows',
      violationTypeKey: violationTypeKey('Boarded Windows')
    },
    ctx(brain, kept, fn)
  );
  assert.equal(r1.rows.length, 85);
  assert.equal(r1.movedCount, 1);
  assert.ok(r1.rows.find((r) => r.rowId === 'fn1'));

  const r2 = applyDecision(
    {
      action: 'deny',
      section: 'not_distressed',
      rowIds: ['fn2'],
      violationTypeLabel: 'Junk Vehicle',
      violationTypeKey: violationTypeKey('Junk Vehicle')
    },
    ctx(brain, r1.rows, r1.notDistressedRows)
  );
  assert.equal(r2.rows.length, 86, 'second promote must keep first promote');
  assert.equal(r2.movedCount, 1);
  assert.ok(r2.rows.find((r) => r.rowId === 'fn1'), 'first promoted row still kept');
  assert.ok(r2.rows.find((r) => r.rowId === 'fn2'), 'second promoted row kept');
  assert.equal(r2.notDistressedRows.length, 0);
});

test('not_distressed deny coerces string/number rowId match', () => {
  const brain = makeBrain();
  const kept = [row({ rowId: 'k1', violationIssueType: 'Weeds' })];
  const fn = [row({ rowId: 42, violationIssueType: 'Boarded' })]; // number id
  const result = applyDecision(
    {
      action: 'deny',
      section: 'not_distressed',
      rowIds: ['42'], // string id from JSON
      violationTypeLabel: 'Boarded'
    },
    ctx(brain, kept, fn)
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.movedCount, 1);
  assert.ok(result.rows.find((r) => String(r.rowId) === '42'));
});

test('not_distressed deny with no matching rowIds throws ROW_IDS_NOT_FOUND (no silent no-op)', () => {
  const brain = makeBrain();
  const kept = [row({ rowId: 'k1' })];
  const fn = [row({ rowId: 'fn1', violationIssueType: 'Boarded' })];
  assert.throws(
    () =>
      applyDecision(
        {
          action: 'deny',
          section: 'not_distressed',
          rowIds: ['missing'],
          violationTypeLabel: 'Boarded'
        },
        ctx(brain, kept, fn)
      ),
    (err) => err && err.code === 'ROW_IDS_NOT_FOUND'
  );
  // Brain must not gain a promote rule on failed move
  assert.equal((brain.typeRules || []).filter((r) => r.status === 'active').length, 0);
});

// ─── Invalid action/section ─────────────────────────────────────────────────

test('invalid action/section throws Error with code INVALID_DECISION', () => {
  const brain = makeBrain();
  assert.throws(
    () =>
      applyDecision(
        { action: 'maybe', section: 'distressed', rowIds: [] },
        ctx(brain, [], [])
      ),
    (err) => err && err.code === 'INVALID_DECISION'
  );
  assert.throws(
    () =>
      applyDecision(
        { action: 'approve', section: 'middle', rowIds: [] },
        ctx(brain, [], [])
      ),
    (err) => err && err.code === 'INVALID_DECISION'
  );
});

// ─── Metrics + version ──────────────────────────────────────────────────────

test('metrics: totalDecisions increments; typeRulesActive recounts; version increments', () => {
  const brain = makeBrain({ version: 3 });
  const rows = [row({ rowId: 'r1', violationIssueType: 'Fence Permit' })];

  const result = applyDecision(
    {
      action: 'deny',
      section: 'distressed',
      rowIds: ['r1'],
      violationTypeKey: violationTypeKey('Fence Permit'),
      violationTypeLabel: 'Fence Permit'
    },
    ctx(brain, rows, [])
  );

  assert.equal(result.brain.metrics.totalDecisions, 1);
  assert.equal(result.brain.metrics.typeRulesActive, 1);
  assert.equal(result.brain.version, 4);
  assert.equal(result.brainSummary.totalDecisions, 1);
  assert.equal(result.brainSummary.typeRulesActive, 1);
  assert.equal(result.brainSummary.version, 4);
});

// ─── Learning proof: suppress → applyBrain demotes ──────────────────────────

test('learning proof: after distressed deny suppress, applyBrain demotes strong fence-permit row', () => {
  const brain = makeBrain();
  const key = violationTypeKey('Fence Permit');
  const rows = [row({ rowId: 'r1', violationIssueType: 'Fence Permit' })];

  const result = applyDecision(
    {
      action: 'deny',
      section: 'distressed',
      rowIds: ['r1'],
      violationTypeKey: key,
      violationTypeLabel: 'Fence Permit'
    },
    ctx(brain, rows, [])
  );

  const strongRow = row({
    rowId: 'r_next',
    violationIssueType: 'Fence Permit',
    distressedSignalTag: STRONG_DISTRESSED_TAG,
    matchedIndicators: ['something']
  });

  const applied = applyBrainToRows([strongRow], result.brain, {
    uploadType: 'code_violation'
  });
  assert.notEqual(
    applied.rows[0].distressedSignalTag,
    STRONG_DISTRESSED_TAG,
    'suppress_type from decision must demote strong tag on next apply'
  );
  assert.ok(applied.appliedRuleIds.length >= 1);
});

// ─── Helpers: upsert / disable ──────────────────────────────────────────────

test('upsertTypeRule bumps hitCount on re-hit; does not duplicate active same kind+key', () => {
  const brain = makeBrain();
  const key = violationTypeKey('Weeds');
  const a = upsertTypeRule(brain, {
    kind: 'suppress_type',
    violationTypeKey: key,
    violationTypeLabel: 'Weeds',
    by: 'admin',
    city: { city: 'Austin', state: 'TX' }
  });
  assert.ok(String(a.id).startsWith('tr_'));
  assert.equal(a.hitCount, 1);
  assert.equal(a.source, 'admin_review');

  const b = upsertTypeRule(brain, {
    kind: 'suppress_type',
    violationTypeKey: key,
    violationTypeLabel: 'Weeds',
    by: 'admin'
  });
  assert.equal(a.id, b.id);
  assert.equal(b.hitCount, 2);
  assert.equal(
    brain.typeRules.filter((r) => r.kind === 'suppress_type' && r.status === 'active').length,
    1
  );
});

test('disableTypeRules sets status disabled + disabledAt', () => {
  const brain = makeBrain();
  const key = violationTypeKey('Weeds');
  upsertTypeRule(brain, {
    kind: 'promote_type',
    violationTypeKey: key,
    violationTypeLabel: 'Weeds',
    by: 'admin'
  });
  disableTypeRules(brain, { kind: 'promote_type', violationTypeKey: key });
  const r = brain.typeRules[0];
  assert.equal(r.status, 'disabled');
  assert.ok(r.disabledAt);
});
