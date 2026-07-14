'use strict';

const path = require('path');
const config = require('../config');

function getAnalyzerDataRoot() {
  if (process.env.PDA_DATA_ROOT) {
    return path.resolve(process.env.PDA_DATA_ROOT);
  }
  if (config.ANALYZER_DATA_ROOT) {
    return path.resolve(config.ANALYZER_DATA_ROOT);
  }
  return path.join(config.ROOT, 'modules', 'property-analyzer');
}

/**
 * @param {string} [periodMonth] YYYY-MM — calendar month to report (defaults to current UTC month)
 */
function readMapsGeminiUsage(periodMonth) {
  try {
    const { createUsageStore, monthKey } = require('../../modules/property-analyzer/lib/api-usage');
    const store = createUsageStore(getAnalyzerDataRoot());
    const month = periodMonth && /^\d{4}-\d{2}$/.test(periodMonth) ? periodMonth : monthKey();
    const snap = store.snapshotForMonth(month);
    return {
      ok: true,
      source: 'ledger',
      period: month,
      maps: {
        month: snap.maps.month,
        okCalls: snap.maps.monthOk || 0,
        failCalls: snap.maps.monthFail || 0,
        estimatedUsd: Number(snap.maps.estimatedSpendUsdMonth) || 0,
        creditUsd: snap.maps.monthlyCreditUsdEst ?? null,
        remainingUsdEst: snap.maps.remainingCreditUsdEst ?? null
      },
      gemini: {
        month: snap.gemini.month,
        monthOk: snap.gemini.monthOk || 0,
        monthFail: snap.gemini.monthFail || 0,
        usedMonth: snap.gemini.monthTotal || 0,
        dayCount: snap.dayCount || 0
      },
      note: snap.note || null,
      updatedAt: snap.updatedAt || null
    };
  } catch (err) {
    return {
      ok: false,
      source: 'ledger',
      period: periodMonth || null,
      maps: null,
      gemini: null,
      error: err.message || String(err),
      code: 'ANALYZER_USAGE_READ_FAILED'
    };
  }
}

module.exports = {
  getAnalyzerDataRoot,
  readMapsGeminiUsage
};
