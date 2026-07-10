const { test } = require('node:test');
const assert = require('node:assert/strict');

const { emptyBrain, violationTypeKey } = require('../lib/bridge-brain-store');
const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { UPLOAD_TYPES } = require('../lib/bridge-intake-schema');
const { applyBrainToRow, applyBrainToRows } = require('../lib/bridge-brain-apply');

const STANDARD = UPLOAD_TYPES.code_violation.defaultTag;
const WATER_TAG = UPLOAD_TYPES.water_shut_off.defaultTag;

function row(overrides = {}) {
  return {
    streetAddress: '123 Main St',
    city: 'Marana',
    state: 'Arizona',
    violationIssueType: 'High Grass and Weeds',
    descriptionNotes: '',
    distressedSignalTag: STANDARD,
    matchedIndicators: [],
    ...overrides
  };
}

function brainWith(overrides = {}) {
  const brain = emptyBrain();
  if (overrides.typeRules) brain.typeRules = overrides.typeRules;
  if (overrides.phraseRules) brain.phraseRules = overrides.phraseRules;
  if (overrides.version != null) brain.version = overrides.version;
  return brain;
}

test('empty brain leaves distressedSignalTag unchanged', () => {
  const r = row({ distressedSignalTag: STRONG_DISTRESSED_TAG });
  const out = applyBrainToRow(r, emptyBrain(), { uploadType: 'code_violation' });
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
});

test('null/missing brain is a no-op', () => {
  const r = row({ distressedSignalTag: STRONG_DISTRESSED_TAG });
  const out = applyBrainToRow(r, null, { uploadType: 'code_violation' });
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
});

test('active promote_type sets STRONG even when row was Standard', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_promote',
        kind: 'promote_type',
        violationTypeKey: key,
        violationTypeLabel: 'High Grass and Weeds',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(row({ distressedSignalTag: STANDARD }), brain, {
    uploadType: 'code_violation'
  });
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(out.brainAppliedRuleIds.includes('tr_promote'));
});

test('active suppress_type sets Standard even when row was Strong', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_suppress',
        kind: 'suppress_type',
        violationTypeKey: key,
        violationTypeLabel: 'High Grass and Weeds',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      distressedSignalTag: STRONG_DISTRESSED_TAG,
      matchedIndicators: ['Tall/overgrown/high grass or weeds']
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STANDARD);
  assert.deepEqual(out.matchedIndicators, []);
  assert.ok(out.brainAppliedRuleIds.includes('tr_suppress'));
});

test('promote + suppress same key ends Standard (suppress wins)', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_promote',
        kind: 'promote_type',
        violationTypeKey: key,
        status: 'active'
      },
      {
        id: 'tr_suppress',
        kind: 'suppress_type',
        violationTypeKey: key,
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(row({ distressedSignalTag: STANDARD }), brain, {
    uploadType: 'code_violation'
  });
  assert.equal(out.distressedSignalTag, STANDARD);
  assert.ok(out.brainAppliedRuleIds.includes('tr_promote'));
  assert.ok(out.brainAppliedRuleIds.includes('tr_suppress'));
});

test('disabled type rule has no effect', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_disabled',
        kind: 'suppress_type',
        violationTypeKey: key,
        status: 'disabled'
      }
    ]
  });
  const out = applyBrainToRow(
    row({ distressedSignalTag: STRONG_DISTRESSED_TAG }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.deepEqual(out.brainAppliedRuleIds || [], []);
});

test('active promote_phrase literal matches description → Strong', () => {
  const brain = brainWith({
    phraseRules: [
      {
        id: 'pr_promote',
        kind: 'promote_phrase',
        pattern: 'trash cans everywhere',
        patternType: 'literal',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      violationIssueType: 'Fence permit',
      descriptionNotes: 'Trash cans everywhere on curb',
      distressedSignalTag: STANDARD
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(out.brainAppliedRuleIds.includes('pr_promote'));
});

test('active suppress_phrase → Standard', () => {
  const brain = brainWith({
    phraseRules: [
      {
        id: 'pr_suppress',
        kind: 'suppress_phrase',
        pattern: 'parking on lawn',
        patternType: 'literal',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      violationIssueType: 'Weeds',
      descriptionNotes: 'Parking on lawn near sidewalk',
      distressedSignalTag: STRONG_DISTRESSED_TAG,
      matchedIndicators: ['Tall/overgrown/high grass or weeds']
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STANDARD);
  assert.ok(out.brainAppliedRuleIds.includes('pr_suppress'));
});

test('proposed phrase rule has no effect', () => {
  const brain = brainWith({
    phraseRules: [
      {
        id: 'pr_proposed',
        kind: 'promote_phrase',
        pattern: 'trash cans',
        patternType: 'literal',
        status: 'proposed'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      descriptionNotes: 'trash cans behind house',
      distressedSignalTag: STANDARD
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STANDARD);
  assert.deepEqual(out.brainAppliedRuleIds || [], []);
});

test('water_shut_off skips all brain apply including suppress_type', () => {
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_water_suppress',
        kind: 'suppress_type',
        violationTypeKey: violationTypeKey('Water shut off delinquency'),
        status: 'active'
      }
    ],
    phraseRules: [
      {
        id: 'pr_water',
        kind: 'suppress_phrase',
        pattern: 'disconnected',
        patternType: 'literal',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      violationIssueType: 'Water shut off delinquency',
      descriptionNotes: 'Disconnected for non-payment',
      distressedSignalTag: WATER_TAG
    }),
    brain,
    { uploadType: 'water_shut_off' }
  );
  assert.equal(out.distressedSignalTag, WATER_TAG);
  assert.deepEqual(out.brainAppliedRuleIds || [], []);
});

test('applyBrainToRows returns unique appliedRuleIds', () => {
  const key = violationTypeKey('High Grass and Weeds');
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_suppress',
        kind: 'suppress_type',
        violationTypeKey: key,
        status: 'active'
      }
    ]
  });
  const rows = [
    row({ streetAddress: '1 A St', distressedSignalTag: STRONG_DISTRESSED_TAG }),
    row({ streetAddress: '2 B St', distressedSignalTag: STRONG_DISTRESSED_TAG }),
    row({
      streetAddress: '3 C St',
      violationIssueType: 'Fence permit',
      distressedSignalTag: STANDARD
    })
  ];
  const result = applyBrainToRows(rows, brain, { uploadType: 'code_violation' });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.appliedRuleIds, ['tr_suppress']);
  assert.equal(result.rows[0].distressedSignalTag, STANDARD);
  assert.equal(result.rows[1].distressedSignalTag, STANDARD);
  assert.equal(result.rows[2].distressedSignalTag, STANDARD);
});

test('type key case/spacing: rule key matches label with extra spaces and case', () => {
  const brain = brainWith({
    typeRules: [
      {
        id: 'tr_space',
        kind: 'promote_type',
        violationTypeKey: 'high grass and weeds',
        status: 'active'
      }
    ]
  });
  const out = applyBrainToRow(
    row({
      violationIssueType: 'High Grass  and Weeds',
      distressedSignalTag: STANDARD
    }),
    brain,
    { uploadType: 'code_violation' }
  );
  assert.equal(out.distressedSignalTag, STRONG_DISTRESSED_TAG);
  assert.ok(out.brainAppliedRuleIds.includes('tr_space'));
});
