/**
 * Phase 46-01 — phrase miner (PHRASE-01/02): extractCandidates, ≥2 threshold,
 * never-active, skip matrix, proposed no-op apply, active apply.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { emptyBrain } = require('../lib/bridge-brain-store');
const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { UPLOAD_TYPES } = require('../lib/bridge-intake-schema');
const { applyBrainToRow } = require('../lib/bridge-brain-apply');

const STANDARD = UPLOAD_TYPES.code_violation.defaultTag;

// Under test — missing module fails RED until Task 2
const {
  extractCandidates,
  minePhrasesFromEvent,
  escapeRegExp
} = require('../lib/bridge-phrase-miner');

function makeEvent(overrides = {}) {
  return {
    id: 'ev_' + Math.random().toString(16).slice(2, 8),
    action: 'deny_group',
    section: 'distressed',
    violationTypeLabel: 'Parking',
    descriptionSamples: ['Parking on lawn'],
    ...overrides
  };
}

function row(overrides = {}) {
  return {
    streetAddress: '123 Main St',
    city: 'Marana',
    state: 'Arizona',
    violationIssueType: 'Weeds',
    descriptionNotes: 'Parking on lawn near sidewalk',
    distressedSignalTag: STRONG_DISTRESSED_TAG,
    matchedIndicators: ['Tall/overgrown/high grass or weeds'],
    ...overrides
  };
}

// --- extractCandidates ---

test('extractCandidates includes unigrams/bigrams, drops stopwords, len≥4', () => {
  const cands = extractCandidates('Parking on lawn near curb');
  assert.ok(Array.isArray(cands));
  assert.ok(cands.includes('parking'), `expected parking in ${JSON.stringify(cands)}`);
  // "on" is too short; "near" is stopword → bigram parking lawn (not parking on)
  const hasLawnPhrase =
    cands.includes('parking lawn') ||
    cands.includes('parking on') ||
    cands.some((c) => c.includes('lawn'));
  assert.ok(hasLawnPhrase, `expected lawn-related phrase in ${JSON.stringify(cands)}`);
  assert.ok(!cands.includes('near'), 'stopword near must be dropped');
  assert.ok(!cands.includes('on'), 'short token on must be dropped');
  assert.ok(cands.every((c) => typeof c === 'string' && c === c.toLowerCase()));
});

test('extractCandidates drops pure numbers and caps at ~20', () => {
  const cands = extractCandidates('1234 junk yard trash heap fence post alley walk path drain pipe curb side lawn grass weeds brush pile debris');
  assert.ok(!cands.some((c) => /^\d+$/.test(c)));
  assert.ok(cands.length <= 20);
});

// --- escapeRegExp ---

test('escapeRegExp escapes regex metacharacters', () => {
  assert.equal(escapeRegExp('a.b+c?'), 'a\\.b\\+c\\?');
  assert.equal(escapeRegExp('(x)[y]{1}'), '\\(x\\)\\[y\\]\\{1\\}');
  assert.equal(escapeRegExp('a$b^c|d'), 'a\\$b\\^c\\|d');
});

// --- minePhrasesFromEvent: threshold & status ---

test('single suppress-direction event with one description sample does not propose', () => {
  const brain = emptyBrain();
  const event = makeEvent({
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Parking on lawn']
  });
  const out = minePhrasesFromEvent(event, brain);
  assert.equal(out.phraseRules.length, 0);
});

test('two same-direction events with Parking on lawn → one suppress_phrase proposed', () => {
  const brain = emptyBrain();
  const ev1 = makeEvent({
    id: 'ev_a1',
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Parking on lawn']
  });
  brain.events = [ev1];

  const ev2 = makeEvent({
    id: 'ev_a2',
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Parking on lawn again']
  });

  const out = minePhrasesFromEvent(ev2, brain);
  assert.ok(out.phraseRules.length >= 1, 'expected at least one proposed phrase rule');

  const suppress = out.phraseRules.filter((r) => r.kind === 'suppress_phrase');
  assert.ok(suppress.length >= 1);

  const rule = suppress.find(
    (r) =>
      r.pattern === 'parking on lawn' ||
      r.pattern === 'parking lawn' ||
      r.pattern.includes('parking')
  );
  assert.ok(rule, `expected parking-related suppress rule, got ${JSON.stringify(suppress)}`);
  assert.equal(rule.status, 'proposed');
  assert.equal(rule.patternType, 'literal');
  assert.ok(String(rule.pattern) === String(rule.pattern).toLowerCase());
  assert.ok(String(rule.id).startsWith('pr_'));
});

test('one event with ≥2 description samples containing candidate proposes', () => {
  const brain = emptyBrain();
  const event = makeEvent({
    id: 'ev_multi',
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Parking on lawn left side', 'Neighbor parking on lawn']
  });
  const out = minePhrasesFromEvent(event, brain);
  const suppress = out.phraseRules.filter(
    (r) => r.kind === 'suppress_phrase' && r.status === 'proposed'
  );
  assert.ok(suppress.length >= 1, 'multi-sample event should propose');
  assert.ok(suppress.every((r) => r.patternType === 'literal'));
  assert.ok(suppress.every((r) => String(r.id).startsWith('pr_')));
});

test('minePhrasesFromEvent never returns any phraseRule with status active', () => {
  const brain = emptyBrain();
  const ev1 = makeEvent({ id: 'ev_n1', descriptionSamples: ['Parking on lawn'] });
  brain.events = [ev1];
  const ev2 = makeEvent({ id: 'ev_n2', descriptionSamples: ['Parking on lawn'] });
  const out = minePhrasesFromEvent(ev2, brain);
  for (const r of out.phraseRules) {
    assert.notEqual(r.status, 'active', `rule ${r.id} must not be active`);
  }
});

// --- conflict & skip matrix ---

test('opposite-direction conflict for same candidate → no proposed rule', () => {
  const brain = emptyBrain();
  // suppress evidence
  const suppressEv = makeEvent({
    id: 'ev_sup',
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Trash cans everywhere']
  });
  // promote evidence for same phrase (not_distressed + deny = AI wrong, is distress)
  const promoteEv = makeEvent({
    id: 'ev_pro',
    action: 'deny_group',
    section: 'not_distressed',
    descriptionSamples: ['Trash cans everywhere']
  });
  brain.events = [suppressEv, promoteEv];

  // third suppress event tries to mine — still conflicted
  const next = makeEvent({
    id: 'ev_sup2',
    action: 'deny_group',
    section: 'distressed',
    descriptionSamples: ['Trash cans everywhere']
  });
  const out = minePhrasesFromEvent(next, brain);
  const conflicted = out.phraseRules.filter((r) => {
    const p = String(r.pattern || '').toLowerCase();
    return p.includes('trash') || p.includes('cans');
  });
  assert.equal(
    conflicted.length,
    0,
    `expected no conflicted trash/cans rule, got ${JSON.stringify(conflicted)}`
  );
});

test('distressed+approve skips phrase mining', () => {
  const brain = emptyBrain();
  brain.events = [
    makeEvent({
      id: 'ev_prior',
      action: 'approve_group',
      section: 'distressed',
      descriptionSamples: ['Parking on lawn']
    })
  ];
  const event = makeEvent({
    id: 'ev_aff',
    action: 'approve_group',
    section: 'distressed',
    descriptionSamples: ['Parking on lawn']
  });
  const out = minePhrasesFromEvent(event, brain);
  assert.equal(out.phraseRules.length, 0);
});

test('not_distressed+approve skips phrase mining', () => {
  const brain = emptyBrain();
  brain.events = [
    makeEvent({
      id: 'ev_prior',
      action: 'approve_group',
      section: 'not_distressed',
      descriptionSamples: ['Parking on lawn']
    })
  ];
  const event = makeEvent({
    id: 'ev_aff',
    action: 'approve_group',
    section: 'not_distressed',
    descriptionSamples: ['Parking on lawn']
  });
  const out = minePhrasesFromEvent(event, brain);
  assert.equal(out.phraseRules.length, 0);
});

test('not_distressed+deny mines promote_phrase when ≥2 evidence', () => {
  const brain = emptyBrain();
  const ev1 = makeEvent({
    id: 'ev_p1',
    action: 'deny_group',
    section: 'not_distressed',
    descriptionSamples: ['Trash cans everywhere']
  });
  brain.events = [ev1];
  const ev2 = makeEvent({
    id: 'ev_p2',
    action: 'deny_group',
    section: 'not_distressed',
    descriptionSamples: ['Trash cans everywhere on curb']
  });
  const out = minePhrasesFromEvent(ev2, brain);
  const promote = out.phraseRules.filter((r) => r.kind === 'promote_phrase');
  assert.ok(promote.length >= 1, 'expected promote_phrase from FN deny path');
  assert.ok(promote.every((r) => r.status === 'proposed'));
});

// --- PHRASE-02: proposed no-op; active applies ---

test('applyBrainToRow with proposed suppress_phrase does NOT change Strong tag', () => {
  const brain = emptyBrain();
  brain.phraseRules = [
    {
      id: 'pr_prop1',
      kind: 'suppress_phrase',
      pattern: 'parking on lawn',
      patternType: 'literal',
      status: 'proposed'
    }
  ];
  const out = applyBrainToRow(row(), brain, { uploadType: 'code_violation' });
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.deepEqual(out.brainAppliedRuleIds || [], []);
});

test('after phrase rule set active, applyBrainToRow demotes matching row', () => {
  const brain = emptyBrain();
  brain.phraseRules = [
    {
      id: 'pr_act1',
      kind: 'suppress_phrase',
      pattern: 'parking on lawn',
      patternType: 'literal',
      status: 'active'
    }
  ];
  const out = applyBrainToRow(row(), brain, { uploadType: 'code_violation' });
  assert.equal(out.distressedSignalTag, STANDARD);
  assert.ok(out.brainAppliedRuleIds.includes('pr_act1'));
});

test('active promote_phrase promotes matching Standard row', () => {
  const brain = emptyBrain();
  brain.phraseRules = [
    {
      id: 'pr_act2',
      kind: 'promote_phrase',
      pattern: 'trash cans everywhere',
      patternType: 'literal',
      status: 'active'
    }
  ];
  const out = applyBrainToRow(
    row({
      descriptionNotes: 'Trash cans everywhere behind house',
      distressedSignalTag: STANDARD,
      matchedIndicators: []
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(out.brainAppliedRuleIds.includes('pr_act2'));
});
