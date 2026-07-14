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

function readMapsGeminiUsage() {
  try {
    const { createUsageStore } = require('../../modules/property-analyzer/lib/api-usage');
    const store = createUsageStore(getAnalyzerDataRoot());
    const snap = store.snapshot();
    return {
      ok: true,
      source: 'ledger',
      maps: {
        month: snap.month,
        okCalls: snap.maps?.monthOk || 0,
        estimatedUsd: Number(snap.maps?.estimatedSpendUsdMonth) || 0,
        creditUsd: snap.maps?.monthlyCreditUsdEst ?? null,
        remainingUsdEst: snap.maps?.remainingCreditUsdEst ?? null,
        todayOk: snap.maps?.todayOk || 0,
        hardQuotaActive: !!(snap.hardQuotaActive && snap.lastHardQuota?.provider === 'maps')
      },
      gemini: {
        day: snap.day,
        todayOk: snap.gemini?.todayOk || 0,
        todayFail: snap.gemini?.todayFail || 0,
        usedToday: snap.gemini?.todayTotal || 0,
        dailyLimitEst: snap.gemini?.freeTierDailyLimitEst ?? null,
        remainingEst: snap.gemini?.remainingTodayEst ?? null,
        hardQuotaActive: !!(snap.hardQuotaActive && snap.lastHardQuota?.provider === 'gemini')
      },
      note: snap.note || null,
      updatedAt: snap.updatedAt || null
    };
  } catch (err) {
    return {
      ok: false,
      source: 'ledger',
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
