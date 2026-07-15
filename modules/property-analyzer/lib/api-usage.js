/**
 * API usage ledger + hard-quota classification for Maps / Gemini.
 *
 * Google does not expose live "credits remaining" for AI Studio / simple API keys.
 * We track call counts, surface free-tier estimates when configured, and detect
 * hard quota / billing exhaustion so scans can stop and resume cleanly.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Soft daily free-tier estimates (override via env). Used only for UI guidance. */
const DEFAULT_GEMINI_DAILY_LIMIT = Number(process.env.GEMINI_FREE_TIER_DAILY_LIMIT) || 1500;
const DEFAULT_MAPS_MONTHLY_CREDIT_USD = Number(process.env.MAPS_MONTHLY_CREDIT_USD) || 200;
/** Rough Street View Static + Static Maps blended cost per successful image request. */
const MAPS_USD_PER_OK = Number(process.env.MAPS_USD_PER_CALL) || 0.007;

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

function classifyApiError(status, message = '') {
  const m = String(message || '').toLowerCase();
  const st = Number(status) || 0;

  // Explicit prepaid / billing / free-tier daily exhaustion (stop the scan).
  const creditExhausted =
    /exceeded your current quota|quota exceeded|billing not enabled|enable billing|free_tier|generaterequestsperday|perdayperproject|limit:\s*0\b|insufficient.?credit|out of credits|credits?.?(exhausted|depleted|ran out)|no credits|spend.?limit|billing.?hard.?limit|consumer_?suspended|purchase additional|prepaid.?credit|payment required|invoice|account.*disabled|quota\/credits exhausted/i.test(
      m
    ) ||
    (/quota/i.test(m) && /exhausted|exceeded|daily|monthly|free.?tier|credit/i.test(m)
      && !/per.?minute|rate limit|try again|\/min\b|\brpm\b/i.test(m));

  const mapsHard =
    /over_query_limit|request_denied.*billing|billing.*not.?enabled|you must enable billing|this api project is not authorized|billing account|maps.*billing|street.?view.*billing/i.test(
      m
    );

  // Soft RPM / concurrency — Google often returns RESOURCE_EXHAUSTED while credits remain.
  // Bare resource_exhausted used to hard-stop scans for hours even with money left.
  const softRate =
    st === 503 ||
    /rate limit|too many requests|high demand|overloaded|try again later|temporarily unavailable|per minute|requests per minute|\brpm\b|quota.*per.?minute/i.test(m) ||
    (
      (st === 429 || /resource_exhausted|resource has been exhausted/i.test(m))
      && !creditExhausted
      && !mapsHard
    );

  if (creditExhausted || mapsHard) {
    return { kind: 'hard_quota', retryable: false };
  }
  if (softRate || st === 429) {
    return { kind: 'soft_rate_limit', retryable: true };
  }

  return { kind: 'other', retryable: false };
}

function isHardQuotaError(status, message) {
  return classifyApiError(status, message).kind === 'hard_quota';
}

function isSoftRateLimitError(status, message) {
  return classifyApiError(status, message).kind === 'soft_rate_limit';
}

function createUsageStore(dataRoot) {
  const file = path.join(dataRoot || process.cwd(), 'logs', 'api-usage-ledger.json');
  let state = load();

  function load() {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (_) {}
    return {
      days: {},
      months: {},
      lastHardQuota: null,
      updatedAt: 0
    };
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      console.warn('[api-usage] save failed:', err.message);
    }
  }

  function ensureDay(day) {
    if (!state.days[day]) {
      state.days[day] = {
        geminiOk: 0,
        geminiFail: 0,
        gemini429: 0,
        gemini503: 0,
        geminiHardQuota: 0,
        mapsOk: 0,
        mapsFail: 0,
        streetViewOk: 0,
        streetViewFail: 0,
        mapsHardQuota: 0
      };
    }
    return state.days[day];
  }

  function ensureMonth(month) {
    if (!state.months[month]) {
      state.months[month] = {
        mapsOk: 0,
        mapsFail: 0,
        streetViewOk: 0,
        estimatedMapsUsd: 0
      };
    }
    return state.months[month];
  }

  function prune() {
    const days = Object.keys(state.days || {}).sort();
    while (days.length > 45) {
      delete state.days[days.shift()];
    }
    const months = Object.keys(state.months || {}).sort();
    while (months.length > 18) {
      delete state.months[months.shift()];
    }
  }

  function recordGemini({ ok, status, error } = {}) {
    const day = ensureDay(dayKey());
    if (ok) {
      day.geminiOk += 1;
      // Live success means credits work — drop sticky false "exhausted" halt.
      if (state.lastHardQuota?.provider === 'gemini') {
        state.lastHardQuota = null;
      }
    } else {
      day.geminiFail += 1;
      if (Number(status) === 429) day.gemini429 += 1;
      if (Number(status) === 503) day.gemini503 += 1;
      if (isHardQuotaError(status, error)) {
        day.geminiHardQuota += 1;
        state.lastHardQuota = {
          provider: 'gemini',
          at: Date.now(),
          status: Number(status) || 0,
          message: String(error || '').slice(0, 280)
        };
      }
    }
    state.updatedAt = Date.now();
    prune();
    save();
    return snapshot();
  }

  function recordMaps({ ok, kind = 'maps', status, error } = {}) {
    const day = ensureDay(dayKey());
    const month = ensureMonth(monthKey());
    const isSv = kind === 'streetView' || kind === 'streetview';
    if (ok) {
      day.mapsOk += 1;
      month.mapsOk += 1;
      if (isSv) {
        day.streetViewOk += 1;
        month.streetViewOk += 1;
      }
      month.estimatedMapsUsd = Number(
        ((month.estimatedMapsUsd || 0) + MAPS_USD_PER_OK).toFixed(4)
      );
    } else {
      day.mapsFail += 1;
      month.mapsFail += 1;
      if (isSv) day.streetViewFail += 1;
      if (isHardQuotaError(status, error)) {
        day.mapsHardQuota += 1;
        state.lastHardQuota = {
          provider: 'maps',
          at: Date.now(),
          status: Number(status) || 0,
          message: String(error || '').slice(0, 280)
        };
      }
    }
    state.updatedAt = Date.now();
    prune();
    save();
    return snapshot();
  }

  function clearHardQuota() {
    state.lastHardQuota = null;
    state.updatedAt = Date.now();
    save();
  }

  /**
   * Read-only stats for a calendar month (YYYY-MM). Does not mutate the ledger.
   * Used by Operating Costs so each month shows that month's API usage only.
   */
  function snapshotForMonth(periodMonth) {
    const month = String(periodMonth || monthKey()).slice(0, 7);
    const m = state.months?.[month] || {
      mapsOk: 0,
      mapsFail: 0,
      streetViewOk: 0,
      estimatedMapsUsd: 0
    };

    let geminiOk = 0;
    let geminiFail = 0;
    let gemini429 = 0;
    let gemini503 = 0;
    let mapsOkDays = 0;
    let mapsFailDays = 0;
    let dayCount = 0;
    for (const [day, d] of Object.entries(state.days || {})) {
      if (!String(day).startsWith(`${month}-`)) continue;
      dayCount += 1;
      geminiOk += Number(d.geminiOk) || 0;
      geminiFail += Number(d.geminiFail) || 0;
      gemini429 += Number(d.gemini429) || 0;
      gemini503 += Number(d.gemini503) || 0;
      mapsOkDays += Number(d.mapsOk) || 0;
      mapsFailDays += Number(d.mapsFail) || 0;
    }

    const mapsOk = Number(m.mapsOk) || mapsOkDays;
    const mapsFail = Number(m.mapsFail) || mapsFailDays;
    let mapsSpentEst = Number(m.estimatedMapsUsd);
    if (!Number.isFinite(mapsSpentEst) || mapsSpentEst <= 0) {
      mapsSpentEst = Number((mapsOk * MAPS_USD_PER_OK).toFixed(4));
    }
    const mapsCredit = DEFAULT_MAPS_MONTHLY_CREDIT_USD;
    const geminiUsed = geminiOk + geminiFail;

    return {
      ok: true,
      period: month,
      dayCount,
      note:
        'Usage for the selected calendar month only (from this app’s ledger). Google does not publish live remaining balance for API keys.',
      maps: {
        month,
        monthOk: mapsOk,
        monthFail: mapsFail,
        estimatedSpendUsdMonth: mapsSpentEst,
        monthlyCreditUsdEst: mapsCredit,
        remainingCreditUsdEst: Math.max(0, mapsCredit - mapsSpentEst)
      },
      gemini: {
        month,
        monthOk: geminiOk,
        monthFail: geminiFail,
        month429: gemini429,
        month503: gemini503,
        monthTotal: geminiUsed
      },
      updatedAt: state.updatedAt || null
    };
  }

  function snapshot(apiStats = null) {
    const day = dayKey();
    const month = monthKey();
    const d = ensureDay(day);
    const m = ensureMonth(month);
    const geminiUsed = d.geminiOk + d.geminiFail;
    const geminiLimit = DEFAULT_GEMINI_DAILY_LIMIT;
    const geminiRemainingEst = Math.max(0, geminiLimit - geminiUsed);
    const mapsCredit = DEFAULT_MAPS_MONTHLY_CREDIT_USD;
    const mapsSpentEst = Number(m.estimatedMapsUsd) || 0;
    const mapsRemainingUsdEst = Math.max(0, mapsCredit - mapsSpentEst);
    const last = state.lastHardQuota;
    const lastAgeSec = last?.at ? Math.floor((Date.now() - last.at) / 1000) : null;
    // Sticky halt only for real credit stops, and only ~20 minutes (was 6 hours —
    // rate-limit RESOURCE_EXHAUSTED false positives blocked scans despite remaining credits).
    const hardQuotaActive = !!(last && lastAgeSec != null && lastAgeSec < 20 * 60);

    return {
      ok: true,
      day,
      month,
      note:
        'Google does not publish live remaining balance for API keys. ' +
        'Counts below are from this app. “Remaining” estimates use free-tier / credit defaults and are approximate.',
      gemini: {
        todayOk: d.geminiOk,
        todayFail: d.geminiFail,
        today429: d.gemini429,
        today503: d.gemini503,
        todayHardQuota: d.geminiHardQuota,
        todayTotal: geminiUsed,
        freeTierDailyLimitEst: geminiLimit,
        remainingTodayEst: geminiRemainingEst,
        remainingLabel:
          geminiLimit > 0
            ? `~${geminiRemainingEst.toLocaleString()} of ~${geminiLimit.toLocaleString()} free-tier calls left today (est.)`
            : 'Daily free-tier limit not configured',
        sessionOk: apiStats ? apiStats.geminiOk : null,
        sessionFail: apiStats ? apiStats.geminiFail : null
      },
      maps: {
        todayOk: d.mapsOk,
        todayFail: d.mapsFail,
        todayStreetViewOk: d.streetViewOk,
        todayStreetViewFail: d.streetViewFail,
        todayHardQuota: d.mapsHardQuota,
        monthOk: m.mapsOk,
        monthFail: m.mapsFail,
        estimatedSpendUsdMonth: mapsSpentEst,
        monthlyCreditUsdEst: mapsCredit,
        remainingCreditUsdEst: mapsRemainingUsdEst,
        remainingLabel: `~$${mapsRemainingUsdEst.toFixed(2)} of ~$${mapsCredit.toFixed(0)} Maps credit left this month (est.)`,
        sessionOk: apiStats ? apiStats.mapsOk : null,
        sessionFail: apiStats ? apiStats.mapsFail : null,
        sessionStreetViewOk: apiStats ? apiStats.streetViewOk : null,
        sessionStreetViewFail: apiStats ? apiStats.streetViewFail : null
      },
      lastHardQuota: last,
      hardQuotaActive,
      hardQuotaAgeSec: lastAgeSec,
      updatedAt: state.updatedAt || Date.now()
    };
  }

  return {
    recordGemini,
    recordMaps,
    clearHardQuota,
    snapshot,
    snapshotForMonth,
    isHardQuotaError,
    isSoftRateLimitError,
    classifyApiError
  };
}

module.exports = {
  createUsageStore,
  classifyApiError,
  isHardQuotaError,
  isSoftRateLimitError,
  dayKey,
  monthKey
};
