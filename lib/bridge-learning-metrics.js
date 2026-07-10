/**
 * Phase 58 — pure learning health metrics (no I/O side effects except optional gold fixture scorer).
 * Zero new npm packages.
 */
const fs = require('fs');
const path = require('path');
const { DECISION_ACTIONS } = require('./bridge-brain-store');

const GOLD_KEEP_FRAGS = [
  '100 Gold Keep',
  '200 Gold Keep',
  '300 Gold Keep',
  '400 Gold Keep',
  '500 Gold Keep'
];
const GOLD_DENY_FRAGS = [
  '100 Gold Deny',
  '200 Gold Deny',
  '300 Gold Deny',
  '400 Gold Deny',
  '500 Gold Deny'
];

const BANNED_SILENT_DROP_RE = /no_type(_column)?|unresolved_map|missing_type|low_confidence|cleaner|silent/i;

const STRONG_HINT = 'Strong Distressed';

function isStrongTag(tag) {
  const s = String(tag || '');
  return s === 'Strong Distressed Signal' || s.includes(STRONG_HINT);
}

function addressIn(rows, fragment) {
  return (rows || []).find((r) => String(r.streetAddress || '').includes(fragment));
}

/**
 * Decision volume trend. Only DECISION_ACTIONS count.
 * Prefer time buckets when events have `at` ISO strings: count in last W days vs prior W days.
 * Else fall back to last `windowSize` decisions vs the prior `windowSize` decisions
 * (when both full, direction is flat by count — product uses timestamps in production).
 */
function computeDecisionTrend(events, opts = {}) {
  const windowSize = Math.max(1, Number(opts.windowSize) || 25);
  const dayMs = 24 * 60 * 60 * 1000;
  const list = Array.isArray(events) ? events.slice() : [];
  const decisions = list.filter((e) => e && DECISION_ACTIONS.has(e.action));
  const dated = decisions.filter((e) => e.at && !Number.isNaN(Date.parse(e.at)));

  if (dated.length >= 2) {
    dated.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const latest = Date.parse(dated[dated.length - 1].at);
    const recentStart = latest - windowSize * dayMs;
    const previousStart = recentStart - windowSize * dayMs;
    let recentCount = 0;
    let previousCount = 0;
    for (const e of dated) {
      const t = Date.parse(e.at);
      if (t > recentStart && t <= latest) recentCount += 1;
      else if (t > previousStart && t <= recentStart) previousCount += 1;
    }
    let direction = 'flat';
    if (recentCount < previousCount) direction = 'down';
    else if (recentCount > previousCount) direction = 'up';
    return {
      recentCount,
      previousCount,
      direction,
      window: `last_${windowSize}d_vs_prior_${windowSize}d`,
      decisionActionsOnly: true
    };
  }

  const recent = decisions.slice(-windowSize);
  const previous = decisions.slice(-windowSize * 2, -windowSize);
  const recentCount = recent.length;
  const previousCount = previous.length;
  let direction = 'flat';
  if (recentCount < previousCount) direction = 'down';
  else if (recentCount > previousCount) direction = 'up';
  return {
    recentCount,
    previousCount,
    direction,
    window: `last_${windowSize}_vs_prior_${windowSize}`,
    decisionActionsOnly: true
  };
}

function scoreGoldKeepKill(result, opts = {}) {
  const keepFrags = opts.keepFrags || GOLD_KEEP_FRAGS;
  const denyFrags = opts.denyFrags || GOLD_DENY_FRAGS;
  const rows = (result && result.rows) || [];
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (const frag of keepFrags) {
    const row = addressIn(rows, frag);
    if (row && isStrongTag(row.distressedSignalTag)) tp += 1;
    else fn += 1;
  }
  for (const frag of denyFrags) {
    const row = addressIn(rows, frag);
    if (row && isStrongTag(row.distressedSignalTag)) fp += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall, keepFrags, denyFrags };
}

function scoreApplyCoverage(input = {}) {
  const appliedRuleIds = Array.isArray(input.appliedRuleIds)
    ? input.appliedRuleIds.map(String).filter(Boolean)
    : [];
  const expected = Array.isArray(input.activeRuleIdsExpected)
    ? input.activeRuleIdsExpected.map(String).filter(Boolean)
    : null;
  const rulesAppliedCount = appliedRuleIds.length;
  let sufficient = false;
  let note = '';
  if (expected && expected.length > 0) {
    const set = new Set(appliedRuleIds);
    const hit = expected.some((id) => set.has(id));
    sufficient = hit;
    note = hit
      ? 'expected type rules present in appliedRuleIds'
      : 'expected type rules not applied (proposed phrases alone do not count)';
  } else {
    sufficient = rulesAppliedCount > 0;
    note = sufficient
      ? 'process applied at least one brain rule'
      : 'coverage needs process apply evidence (brainAppliedRuleIds)';
  }
  return {
    appliedRuleIds,
    rulesAppliedCount,
    rowHitRate: input.rowHitRate == null ? null : Number(input.rowHitRate),
    sufficient,
    note,
    source: String(input.source || 'unknown')
  };
}

function buildLearningHealth(input = {}) {
  const events = input.events || [];
  const decisionTrend = computeDecisionTrend(events, input.trendOpts);
  const baseline = input.baseline || { precision: 1, recall: 1 };
  const eps = Number(input.epsilon) || 0;
  const discardBlob = String(input.discardBlob || '');
  const silentDropFailure = BANNED_SILENT_DROP_RE.test(discardBlob);

  let goldScore = input.goldScore;
  let gold;
  if (!goldScore) {
    gold = {
      precision: null,
      recall: null,
      baselinePrecision: baseline.precision,
      baselineRecall: baseline.recall,
      degraded: false,
      source: 'unavailable'
    };
  } else {
    const precision = goldScore.precision;
    const recall = goldScore.recall;
    const baselinePrecision = goldScore.baselinePrecision != null
      ? goldScore.baselinePrecision
      : baseline.precision;
    const baselineRecall = goldScore.baselineRecall != null
      ? goldScore.baselineRecall
      : baseline.recall;
    const degraded =
      precision != null &&
      recall != null &&
      (precision < baselinePrecision - eps || recall < baselineRecall - eps);
    gold = {
      precision,
      recall,
      baselinePrecision,
      baselineRecall,
      degraded: !!degraded,
      source: goldScore.source || 'gold_fixtures'
    };
  }

  let applyCoverage;
  if (input.applyCoverage && typeof input.applyCoverage.sufficient === 'boolean') {
    applyCoverage = input.applyCoverage;
  } else {
    applyCoverage = scoreApplyCoverage(input.applyCoverage || {});
  }

  // Paired health: cannot win on decision trend alone
  const pairedOk =
    !silentDropFailure && !gold.degraded && applyCoverage.sufficient === true;

  return {
    decisionTrend,
    gold,
    applyCoverage,
    silentDropFailure,
    pairedOk
  };
}

// --- Optional gold fixture scoring (async; used by API only) ---
let goldCache = { key: null, at: 0, value: null };
const GOLD_TTL_MS = 10 * 60 * 1000;

function clearGoldScoreCache() {
  goldCache = { key: null, at: 0, value: null };
}

function goldFixtureDir() {
  return path.join(__dirname, '..', 'tests', 'fixtures', 'bridge', 'gold');
}

/**
 * Aggregate keep+deny gold processUpload scores. Never writes brain/lists.
 * @param {Function} processUpload
 * @param {{ brainVersion?: number|string, city?: object }} [opts]
 */
async function scoreGoldFixtures(processUpload, opts = {}) {
  const dir = goldFixtureDir();
  const keepPath = path.join(dir, 'keep-distress-mixed.csv');
  const denyPath = path.join(dir, 'deny-junk-admin.csv');
  if (!fs.existsSync(keepPath) || !fs.existsSync(denyPath)) {
    return {
      precision: null,
      recall: null,
      baselinePrecision: 1,
      baselineRecall: 1,
      degraded: false,
      source: 'unavailable',
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0
    };
  }

  const cacheKey = String(opts.brainVersion != null ? opts.brainVersion : 'na');
  if (
    goldCache.key === cacheKey &&
    goldCache.value &&
    Date.now() - goldCache.at < GOLD_TTL_MS
  ) {
    return goldCache.value;
  }

  const city = opts.city || { id: 'gold-metrics-city', city: 'Goldville', state: 'AZ' };
  const keepBuf = fs.readFileSync(keepPath);
  const denyBuf = fs.readFileSync(denyPath);
  const keepRes = await processUpload({
    buffer: keepBuf,
    filename: 'keep-distress-mixed.csv',
    city,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  const denyRes = await processUpload({
    buffer: denyBuf,
    filename: 'deny-junk-admin.csv',
    city,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });

  const k = scoreGoldKeepKill(keepRes, { keepFrags: GOLD_KEEP_FRAGS, denyFrags: [] });
  const d = scoreGoldKeepKill(denyRes, { keepFrags: [], denyFrags: GOLD_DENY_FRAGS });
  const tp = k.tp;
  const fn = k.fn;
  const fp = d.fp;
  const tn = d.tn;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const baselinePrecision = 1;
  const baselineRecall = 1;
  const value = {
    precision,
    recall,
    baselinePrecision,
    baselineRecall,
    degraded: precision < baselinePrecision || recall < baselineRecall,
    source: 'gold_fixtures',
    tp,
    fp,
    fn,
    tn
  };
  goldCache = { key: cacheKey, at: Date.now(), value };
  return value;
}

module.exports = {
  GOLD_KEEP_FRAGS,
  GOLD_DENY_FRAGS,
  BANNED_SILENT_DROP_RE,
  computeDecisionTrend,
  scoreGoldKeepKill,
  scoreApplyCoverage,
  buildLearningHealth,
  scoreGoldFixtures,
  clearGoldScoreCache
};
