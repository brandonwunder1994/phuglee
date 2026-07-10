/**
 * Pure Filter brain decision mutator — admin Approve/Deny matrix.
 * HTTP-free: no requireAdmin, no loadBrain/saveBrain.
 * Caller owns persistence.
 */

const { STRONG_DISTRESSED_TAG } = require('./bridge-distress-tagger');
const { violationTypeKey } = require('./bridge-brain-store');
const { buildReviewGroups } = require('./bridge-review-groups');
const { minePhrasesFromEvent } = require('./bridge-phrase-miner');

function shortId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Upsert an active type rule for (kind, violationTypeKey).
 * Re-hit: bump hitCount + updatedAt. Does not duplicate active same pair.
 */
function upsertTypeRule(brain, { kind, violationTypeKey: typeKey, violationTypeLabel, by, city }) {
  const key =
    typeKey != null && String(typeKey).trim()
      ? violationTypeKey(typeKey)
      : violationTypeKey(violationTypeLabel);
  const rules = Array.isArray(brain.typeRules) ? brain.typeRules : (brain.typeRules = []);

  const existing = rules.find(
    (r) => r && r.kind === kind && r.violationTypeKey === key && r.status === 'active'
  );
  if (existing) {
    existing.updatedAt = new Date().toISOString();
    existing.hitCount = (existing.hitCount || 0) + 1;
    if (violationTypeLabel) existing.violationTypeLabel = violationTypeLabel;
    return existing;
  }

  const rule = {
    id: shortId('tr'),
    kind,
    violationTypeKey: key,
    violationTypeLabel: violationTypeLabel || key,
    status: 'active',
    source: 'admin_review',
    createdAt: new Date().toISOString(),
    createdBy: by || '',
    sampleCity: (city && city.city) || '',
    sampleState: (city && city.state) || '',
    hitCount: 1
  };
  rules.push(rule);
  return rule;
}

/**
 * Disable all active type rules matching kind + key.
 */
function disableTypeRules(brain, { kind, violationTypeKey: typeKey }) {
  const key = violationTypeKey(typeKey);
  const rules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  for (const r of rules) {
    if (r && r.kind === kind && r.violationTypeKey === key && r.status === 'active') {
      r.status = 'disabled';
      r.disabledAt = new Date().toISOString();
    }
  }
}

function removeByRowIds(rows, rowIds) {
  const set = new Set(rowIds || []);
  return (rows || []).filter((r) => r && !set.has(r.rowId));
}

function promoteByRowIds(rows, notDistressedRows, rowIds) {
  const set = new Set(rowIds || []);
  const moved = [];
  const remainingFn = [];
  for (const r of notDistressedRows || []) {
    if (r && set.has(r.rowId)) {
      moved.push({
        ...r,
        distressedSignalTag: STRONG_DISTRESSED_TAG,
        confidenceLevel: r.confidenceLevel || 'high',
        brainDecision: 'promoted'
      });
    } else if (r) {
      remainingFn.push(r);
    }
  }
  return {
    rows: [...(rows || []), ...moved],
    notDistressedRows: remainingFn,
    movedCount: moved.length
  };
}

function buildDecisionEvent({ by, action, section, input, resultingRuleIds, rowCount }) {
  return {
    id: shortId('ev'),
    at: new Date().toISOString(),
    by: by || '',
    action, // approve_group | deny_group
    section,
    violationTypeKey: input.violationTypeKey,
    violationTypeLabel: input.violationTypeLabel || '',
    rowCount,
    sampleAddresses: (input.sampleAddresses || []).slice(0, 5),
    matchedIndicators: input.matchedIndicators || [],
    descriptionSamples: (input.descriptionSamples || []).slice(0, 5),
    city: input.city || {},
    sourceFile: input.sourceFile || '',
    resultingRuleIds: resultingRuleIds || [],
    groupId: input.groupId || '',
    batchId: input.batchId != null ? input.batchId : null
  };
}

function recountTypeRulesActive(brain) {
  const rules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  return rules.filter((r) => r && r.status === 'active').length;
}

function invalidDecision(message) {
  const err = new Error(message || 'Invalid decision action/section');
  err.code = 'INVALID_DECISION';
  return err;
}

/**
 * Apply one admin decision to working lists + brain (in place).
 *
 * @param {object} input - action, section, rowIds, violationTypeKey?, violationTypeLabel?, ...
 * @param {object} ctx - { brain, currentRows, notDistressedRows, by }
 * @returns {{ brain, rows, notDistressedRows, reviewGroups, event, brainSummary }}
 */
function applyDecision(input, ctx) {
  const action = input && input.action;
  const section = input && input.section;
  const validAction = action === 'approve' || action === 'deny';
  const validSection = section === 'distressed' || section === 'not_distressed';
  if (!validAction || !validSection) {
    throw invalidDecision(`Invalid decision: action=${action} section=${section}`);
  }

  const brain = ctx.brain;
  if (!brain || typeof brain !== 'object') {
    throw invalidDecision('Missing brain context');
  }
  if (!Array.isArray(brain.typeRules)) brain.typeRules = [];
  if (!Array.isArray(brain.events)) brain.events = [];
  if (!brain.metrics || typeof brain.metrics !== 'object') {
    brain.metrics = {
      totalDecisions: 0,
      typeRulesActive: 0,
      phraseRulesActive: 0,
      phraseRulesProposed: 0
    };
  }

  let rows = Array.isArray(ctx.currentRows) ? ctx.currentRows.slice() : [];
  let notDistressedRows = Array.isArray(ctx.notDistressedRows)
    ? ctx.notDistressedRows.slice()
    : [];

  const typeKeyRaw =
    (input.violationTypeKey != null && String(input.violationTypeKey).trim()) ||
    input.violationTypeLabel;
  const typeKey = violationTypeKey(typeKeyRaw);
  const typeLabel = input.violationTypeLabel || typeKey;
  const rowIds = Array.isArray(input.rowIds) ? input.rowIds : [];
  const by = ctx.by || '';
  const city = input.city;
  const resultingRuleIds = [];

  // Normalize key/label on input copy for event
  const eventInput = {
    ...input,
    violationTypeKey: typeKey,
    violationTypeLabel: typeLabel
  };

  if (section === 'distressed' && action === 'deny') {
    // DEC-01 + DEC-03: remove from kept; upsert suppress; disable promote
    rows = removeByRowIds(rows, rowIds);
    const rule = upsertTypeRule(brain, {
      kind: 'suppress_type',
      violationTypeKey: typeKey,
      violationTypeLabel: typeLabel,
      by,
      city
    });
    resultingRuleIds.push(rule.id);
    disableTypeRules(brain, { kind: 'promote_type', violationTypeKey: typeKey });
  } else if (section === 'distressed' && action === 'approve') {
    // Affirmation: leave rows; disable suppress; NO promote_type
    disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
  } else if (section === 'not_distressed' && action === 'approve') {
    // DEC-02 + DEC-04: promote to kept strong; upsert promote; disable suppress
    const promoted = promoteByRowIds(rows, notDistressedRows, rowIds);
    rows = promoted.rows;
    notDistressedRows = promoted.notDistressedRows;
    const rule = upsertTypeRule(brain, {
      kind: 'promote_type',
      violationTypeKey: typeKey,
      violationTypeLabel: typeLabel,
      by,
      city
    });
    resultingRuleIds.push(rule.id);
    disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
  } else if (section === 'not_distressed' && action === 'deny') {
    // Affirmation only: no list change, no type rule
  }

  const event = buildDecisionEvent({
    by,
    action: action === 'approve' ? 'approve_group' : 'deny_group',
    section,
    input: eventInput,
    resultingRuleIds,
    rowCount: rowIds.length
  });
  brain.events.push(event);

  // Phrase mining (PHRASE-01): proposed-only; never auto-activates.
  // Skip water_shut_off training if caller marks uploadType on input.
  const uploadType = input.uploadType || input.listType || null;
  if (uploadType !== 'water_shut_off') {
    if (!Array.isArray(brain.phraseRules)) brain.phraseRules = [];
    const mined = minePhrasesFromEvent(event, brain);
    if (mined && Array.isArray(mined.phraseRules)) {
      brain.phraseRules = mined.phraseRules;
    }
    if (mined && mined.metrics && typeof mined.metrics === 'object') {
      brain.metrics.phraseRulesProposed =
        Number(mined.metrics.phraseRulesProposed) ||
        brain.phraseRules.filter((r) => r && r.status === 'proposed').length;
    }
  }

  brain.version = (Number(brain.version) || 0) + 1;
  brain.updatedAt = new Date().toISOString();
  brain.metrics.totalDecisions = (Number(brain.metrics.totalDecisions) || 0) + 1;
  brain.metrics.typeRulesActive = recountTypeRulesActive(brain);
  if (Array.isArray(brain.phraseRules)) {
    brain.metrics.phraseRulesProposed = brain.phraseRules.filter(
      (r) => r && r.status === 'proposed'
    ).length;
    brain.metrics.phraseRulesActive = brain.phraseRules.filter(
      (r) => r && r.status === 'active'
    ).length;
  }

  const reviewGroups = {
    distressed: buildReviewGroups(rows, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };

  const brainSummary = {
    version: brain.version,
    typeRulesActive: brain.metrics.typeRulesActive,
    totalDecisions: brain.metrics.totalDecisions
  };

  return {
    brain,
    rows,
    notDistressedRows,
    reviewGroups,
    event,
    brainSummary
  };
}

module.exports = {
  applyDecision,
  upsertTypeRule,
  disableTypeRules
};
