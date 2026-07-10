/**
 * Pure Filter brain apply — active type/phrase rules on top of base tagRow.
 * No fs, no loadBrain inside apply. Water shut-off is always a no-op.
 */

const { STRONG_DISTRESSED_TAG, buildSearchText } = require('./bridge-distress-tagger');
const { UPLOAD_TYPES } = require('./bridge-intake-schema');
const { violationTypeKey } = require('./bridge-brain-store');

const STANDARD_TAG = UPLOAD_TYPES.code_violation.defaultTag;

function ruleTypeKey(rule) {
  if (rule.violationTypeKey && String(rule.violationTypeKey).trim()) {
    return violationTypeKey(rule.violationTypeKey);
  }
  if (rule.violationTypeLabel) {
    return violationTypeKey(rule.violationTypeLabel);
  }
  return null;
}

function typeRuleMatches(rule, row) {
  const key = ruleTypeKey(rule);
  if (!key) return false;
  return violationTypeKey(row.violationIssueType) === key;
}

function phraseMatches(rule, searchText) {
  const pattern = String(rule.pattern || '');
  if (!pattern) return false;
  const haystack = String(searchText || '');
  const patternType = rule.patternType || 'literal';

  if (patternType === 'regex') {
    try {
      const re = new RegExp(pattern, 'i');
      return re.test(haystack);
    } catch (_) {
      return false;
    }
  }

  // literal (default): case-insensitive includes
  return haystack.toLowerCase().includes(pattern.toLowerCase());
}

function clearMatchedIndicators(row) {
  if (Array.isArray(row.matchedIndicators)) return [];
  if (typeof row.matchedIndicators === 'string') return '';
  return [];
}

function promote(row, ruleId, applied) {
  row.distressedSignalTag = STRONG_DISTRESSED_TAG;
  applied.push(ruleId);
}

function suppress(row, ruleId, applied) {
  row.distressedSignalTag = STANDARD_TAG;
  row.matchedIndicators = clearMatchedIndicators(row);
  applied.push(ruleId);
}

/**
 * Apply active brain rules to a single row.
 * Order (code_violation only): promote_type → promote_phrase → suppress_phrase → suppress_type.
 * water_shut_off: return shallow copy unchanged.
 */
function applyBrainToRow(row, brain, opts = {}) {
  const uploadType = opts.uploadType;
  const base = row && typeof row === 'object' ? { ...row } : {};

  if (uploadType === 'water_shut_off') {
    base.brainAppliedRuleIds = [];
    return base;
  }

  if (!brain || typeof brain !== 'object') {
    base.brainAppliedRuleIds = [];
    return base;
  }

  const typeRules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  const phraseRules = Array.isArray(brain.phraseRules) ? brain.phraseRules : [];
  const activeTypes = typeRules.filter((r) => r && r.status === 'active');
  const activePhrases = phraseRules.filter((r) => r && r.status === 'active');
  const applied = [];
  const searchText = buildSearchText(base);

  // 1. promote_type
  for (const rule of activeTypes) {
    if (rule.kind === 'promote_type' && typeRuleMatches(rule, base)) {
      promote(base, rule.id, applied);
    }
  }

  // 2. promote_phrase
  for (const rule of activePhrases) {
    if (rule.kind === 'promote_phrase' && phraseMatches(rule, searchText)) {
      promote(base, rule.id, applied);
    }
  }

  // 3. suppress_phrase
  for (const rule of activePhrases) {
    if (rule.kind === 'suppress_phrase' && phraseMatches(rule, searchText)) {
      suppress(base, rule.id, applied);
    }
  }

  // 4. suppress_type (wins last)
  for (const rule of activeTypes) {
    if (rule.kind === 'suppress_type' && typeRuleMatches(rule, base)) {
      suppress(base, rule.id, applied);
    }
  }

  base.brainAppliedRuleIds = applied;
  return base;
}

/**
 * Apply brain rules to all rows.
 * @returns {{ rows: object[], appliedRuleIds: string[] }}
 */
function applyBrainToRows(rows, brain, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const out = list.map((r) => applyBrainToRow(r, brain, opts));
  const seen = new Set();
  const appliedRuleIds = [];
  for (const r of out) {
    for (const id of r.brainAppliedRuleIds || []) {
      if (id != null && !seen.has(id)) {
        seen.add(id);
        appliedRuleIds.push(id);
      }
    }
  }
  return { rows: out, appliedRuleIds };
}

module.exports = {
  applyBrainToRow,
  applyBrainToRows
};
