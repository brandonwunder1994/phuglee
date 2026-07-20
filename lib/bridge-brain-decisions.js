/**
 * Pure Filter brain decision mutator — admin Approve/Deny matrix.
 * HTTP-free: no requireAdmin, no loadBrain/saveBrain.
 * Caller owns persistence.
 */

const { STRONG_DISTRESSED_TAG } = require('./bridge-distress-tagger');
const { stableTypeKey } = require('./bridge-stable-text');
const { buildReviewGroups } = require('./bridge-review-groups');
const { minePhrasesFromEvent } = require('./bridge-phrase-miner');

function shortId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Upsert an active type rule for (kind, violationTypeKey).
 * Keys use stableTypeKey so municipal codes (HGW - …) match on re-scrub.
 * Never stores bare __unknown__ type rules (empty-type groups use phrase mining).
 * Re-hit: bump hitCount + updatedAt. Does not duplicate active same pair.
 */
function upsertTypeRule(brain, { kind, violationTypeKey: typeKey, violationTypeLabel, by, city }) {
  const key =
    typeKey != null && String(typeKey).trim()
      ? stableTypeKey(typeKey)
      : stableTypeKey(violationTypeLabel);
  if (!key || key === '__unknown__') return null;
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
  const key = stableTypeKey(typeKey);
  if (!key || key === '__unknown__') return;
  const rules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  for (const r of rules) {
    if (r && r.kind === kind && r.violationTypeKey === key && r.status === 'active') {
      r.status = 'disabled';
      r.disabledAt = new Date().toISOString();
    }
  }
}

/** Normalize rowIds so number/string mismatches still match after JSON round-trips. */
function rowIdKey(id) {
  if (id == null || id === '') return '';
  return String(id);
}

function rowIdSet(rowIds) {
  const set = new Set();
  for (const id of rowIds || []) {
    const k = rowIdKey(id);
    if (k) set.add(k);
  }
  return set;
}

function removeByRowIds(rows, rowIds) {
  const set = rowIdSet(rowIds);
  return (rows || []).filter((r) => r && !set.has(rowIdKey(r.rowId)));
}

/**
 * Move rowIds from not-distressed pool into kept (strong distress).
 * Operator: not_distressed + Deny = "AI was wrong; this IS distress".
 */
function promoteByRowIds(rows, notDistressedRows, rowIds) {
  const set = rowIdSet(rowIds);
  const moved = [];
  const remainingFn = [];
  for (const r of notDistressedRows || []) {
    if (r && set.has(rowIdKey(r.rowId))) {
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

/**
 * Move rowIds from kept into not-distressed pool.
 * Operator: distressed + Deny = "AI was wrong; this is NOT distress".
 */
function demoteByRowIds(rows, notDistressedRows, rowIds) {
  const set = rowIdSet(rowIds);
  const moved = [];
  const remainingKept = [];
  for (const r of rows || []) {
    if (r && set.has(rowIdKey(r.rowId))) {
      moved.push({
        ...r,
        distressedSignalTag: 'Standard',
        brainDecision: 'demoted'
      });
    } else if (r) {
      remainingKept.push(r);
    }
  }
  return {
    rows: remainingKept,
    notDistressedRows: [...(notDistressedRows || []), ...moved],
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
  const typeKey = stableTypeKey(typeKeyRaw);
  const typeLabel = input.violationTypeLabel || typeKey;
  const rowIds = Array.isArray(input.rowIds) ? input.rowIds : [];
  const by = ctx.by || '';
  const city = input.city;
  const resultingRuleIds = [];
  const isUnknownType = !typeKey || typeKey === '__unknown__';

  // Normalize key/label on input copy for event
  const eventInput = {
    ...input,
    violationTypeKey: typeKey,
    violationTypeLabel: typeLabel
  };

  // Operator model (v1.7+):
  //   Approve = AI was right (leave on this list)
  //   Deny    = AI was wrong (move to the other list + type rule)
  // Deny MUST move ≥1 matching row — never train a type rule on a no-op move
  // (stale client snapshots used to "succeed" with 0 moves and clobber kept counts).
  //
  // clientApplied: browser already mutated working lists for snappy Train UX.
  // Server only persists type rules + audit; skips list rebuild (large payloads).
  // Non-draft clientApplied still requires rowIds — never invent movedCount.
  const clientApplied = Boolean(input && input.clientApplied);
  let movedCount = 0;
  if (section === 'distressed' && action === 'deny') {
    if (clientApplied) {
      if (!rowIds.length) {
        const err = invalidDecision('rowIds required when clientApplied');
        err.code = 'ROW_IDS_REQUIRED';
        throw err;
      }
      movedCount = rowIds.length;
    } else {
      // Move kept → not distressed; suppress type; disable promote
      const demoted = demoteByRowIds(rows, notDistressedRows, rowIds);
      if (!demoted.movedCount) {
        const err = invalidDecision('None of the provided rowIds were found in kept rows');
        err.code = 'ROW_IDS_NOT_FOUND';
        throw err;
      }
      movedCount = demoted.movedCount;
      rows = demoted.rows;
      notDistressedRows = demoted.notDistressedRows;
    }
    if (!isUnknownType) {
      const rule = upsertTypeRule(brain, {
        kind: 'suppress_type',
        violationTypeKey: typeKey,
        violationTypeLabel: typeLabel,
        by,
        city
      });
      if (rule) resultingRuleIds.push(rule.id);
      disableTypeRules(brain, { kind: 'promote_type', violationTypeKey: typeKey });
    }
  } else if (section === 'distressed' && action === 'approve') {
    // Affirmation: leave on kept; disable suppress so type stays eligible
    if (!isUnknownType) {
      disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
    }
  } else if (section === 'not_distressed' && action === 'approve') {
    // Affirmation: leave out of kept; no type rule
  } else if (section === 'not_distressed' && action === 'deny') {
    if (clientApplied) {
      if (!rowIds.length) {
        const err = invalidDecision('rowIds required when clientApplied');
        err.code = 'ROW_IDS_REQUIRED';
        throw err;
      }
      movedCount = rowIds.length;
    } else {
      // Move FN → kept strong; promote type; disable suppress
      const promoted = promoteByRowIds(rows, notDistressedRows, rowIds);
      if (!promoted.movedCount) {
        const err = invalidDecision(
          'None of the provided rowIds were found in not-distressed rows'
        );
        err.code = 'ROW_IDS_NOT_FOUND';
        throw err;
      }
      movedCount = promoted.movedCount;
      rows = promoted.rows;
      notDistressedRows = promoted.notDistressedRows;
    }
    if (!isUnknownType) {
      const rule = upsertTypeRule(brain, {
        kind: 'promote_type',
        violationTypeKey: typeKey,
        violationTypeLabel: typeLabel,
        by,
        city
      });
      if (rule) resultingRuleIds.push(rule.id);
      disableTypeRules(brain, { kind: 'suppress_type', violationTypeKey: typeKey });
    }
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

  // Skip group rebuild when client already applied list moves (Train speed path)
  const reviewGroups = clientApplied
    ? null
    : {
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
    rows: clientApplied ? null : rows,
    notDistressedRows: clientApplied ? null : notDistressedRows,
    reviewGroups,
    event,
    brainSummary,
    movedCount,
    clientApplied
  };
}

function findRuleById(brain, ruleId) {
  const id = String(ruleId || '');
  if (!id) return null;
  const typeRules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  const phraseRules = Array.isArray(brain.phraseRules) ? brain.phraseRules : [];
  for (const rule of typeRules) {
    if (rule && rule.id === id) return rule;
  }
  for (const rule of phraseRules) {
    if (rule && rule.id === id) return rule;
  }
  return null;
}

/**
 * Best-effort undo of the last training decision for `by`.
 * Disables still-active rules from resultingRuleIds; marks event.undone;
 * appends undo audit event. Does NOT restore client list rows.
 *
 * @param {object} brain
 * @param {{ by: string }} opts
 * @throws {Error} code NOTHING_TO_UNDO statusCode 400
 */
function undoLastDecision(brain, opts = {}) {
  const by = opts.by || '';
  if (!brain || typeof brain !== 'object') {
    const err = new Error('Missing brain');
    err.code = 'NOTHING_TO_UNDO';
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(brain.events)) brain.events = [];
  if (!Array.isArray(brain.typeRules)) brain.typeRules = [];
  if (!Array.isArray(brain.phraseRules)) brain.phraseRules = [];

  const last = [...brain.events].reverse().find(
    (e) => e && e.by === by && e.action !== 'undo' && !e.undone
  );
  if (!last) {
    const err = new Error('Nothing to undo');
    err.code = 'NOTHING_TO_UNDO';
    err.statusCode = 400;
    throw err;
  }

  for (const id of last.resultingRuleIds || []) {
    const rule = findRuleById(brain, id);
    if (!rule) continue;
    // Best-effort: disable if still active
    if (rule.status === 'active') {
      rule.status = 'disabled';
      rule.disabledAt = new Date().toISOString();
    }
  }

  last.undone = true;
  brain.events.push({
    id: shortId('ev'),
    at: new Date().toISOString(),
    by,
    action: 'undo',
    resultingRuleIds: Array.isArray(last.resultingRuleIds) ? last.resultingRuleIds.slice() : [],
    undoneEventId: last.id
  });

  if (!brain.metrics || typeof brain.metrics !== 'object') {
    brain.metrics = {
      totalDecisions: 0,
      typeRulesActive: 0,
      phraseRulesActive: 0,
      phraseRulesProposed: 0
    };
  }
  brain.metrics.typeRulesActive = recountTypeRulesActive(brain);
  if (Array.isArray(brain.phraseRules)) {
    brain.metrics.phraseRulesProposed = brain.phraseRules.filter(
      (r) => r && r.status === 'proposed'
    ).length;
    brain.metrics.phraseRulesActive = brain.phraseRules.filter(
      (r) => r && r.status === 'active'
    ).length;
  }

  return brain;
}

module.exports = {
  applyDecision,
  undoLastDecision,
  upsertTypeRule,
  disableTypeRules
};
