'use strict';

const CHECK_IDS = [
  'infill',
  'utilities',
  'pavedAccess',
  'cleared',
  'flat',
  'flood',
  'zoning'
];

const STATUSES = new Set(['pass', 'fail', 'unknown']);
const VERDICTS = new Set(['pending', 'keep', 'toss']);

function normalizeCheck(raw = {}) {
  const status = STATUSES.has(String(raw.status || '').toLowerCase())
    ? String(raw.status).toLowerCase()
    : 'unknown';
  return {
    status,
    note: String(raw.note || '').trim()
  };
}

function emptyChecks() {
  const checks = {};
  for (const id of CHECK_IDS) {
    checks[id] = { status: 'unknown', note: '' };
  }
  return checks;
}

function normalizeLandScreen(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const checksIn = src.checks && typeof src.checks === 'object' ? src.checks : {};
  const checks = emptyChecks();
  for (const id of CHECK_IDS) {
    checks[id] = normalizeCheck(checksIn[id] || {});
  }
  const verdict = VERDICTS.has(String(src.verdict || '').toLowerCase())
    ? String(src.verdict).toLowerCase()
    : 'pending';
  let recommended = src.recommendedVerdict;
  if (recommended != null) {
    const r = String(recommended).toLowerCase();
    recommended = r === 'keep' || r === 'toss' ? r : null;
  } else {
    recommended = null;
  }
  return {
    demandBuilders: normalizeCheck(src.demandBuilders || {}),
    checks,
    verdict,
    verdictNote: String(src.verdictNote || '').trim(),
    recommendedVerdict: recommended,
    screenedAt: src.screenedAt ? String(src.screenedAt) : null,
    screenedBy: src.screenedBy ? String(src.screenedBy) : null
  };
}

/**
 * Recommend KEEP only when demand + all seven checks pass.
 * Hard fail on demand or any check → toss.
 * Any unknown (and no fails) → null (still needs screen).
 */
function recommendLandVerdict(screenInput = {}) {
  const screen = normalizeLandScreen(screenInput);
  if (screen.demandBuilders.status === 'fail') return 'toss';
  for (const id of CHECK_IDS) {
    if (screen.checks[id].status === 'fail') return 'toss';
  }
  if (screen.demandBuilders.status !== 'pass') return null;
  for (const id of CHECK_IDS) {
    if (screen.checks[id].status !== 'pass') return null;
  }
  return 'keep';
}

function normalizeFundMatch(raw = {}) {
  return {
    fundId: String(raw.fundId || '').trim(),
    fundName: String(raw.fundName || '').trim(),
    buyBoxId: String(raw.buyBoxId || '').trim(),
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    oneLiner: String(raw.oneLiner || '').trim(),
    reasons: Array.isArray(raw.reasons) ? raw.reasons.map(String).filter(Boolean) : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps.map(String).filter(Boolean) : []
  };
}

function normalizeFundMatches(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeFundMatch).filter((m) => m.fundId);
}

module.exports = {
  CHECK_IDS,
  STATUSES,
  VERDICTS,
  emptyChecks,
  normalizeCheck,
  normalizeLandScreen,
  recommendLandVerdict,
  normalizeFundMatch,
  normalizeFundMatches
};
