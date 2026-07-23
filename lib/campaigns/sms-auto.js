'use strict';

const { isSmsCampaignsLive, isSmsCampaignsAuto } = require('./sms-flags');
const { executeSend } = require('./sms-send');
const { getAutoState, setAutoState } = require('./sms-store');

/**
 * Option B tick: send next message for eligible contacts at each touch 0..11.
 * Fully no-ops unless LIVE && AUTO && autoState.enabled.
 */
async function runAutoTick({ perTouchLimit = 25, ghl, dripMs = 2500 } = {}) {
  if (!isSmsCampaignsLive() || !isSmsCampaignsAuto()) {
    return { ok: false, reason: 'live_or_auto_disabled' };
  }
  const state = getAutoState();
  if (!state.enabled) {
    return { ok: false, reason: 'auto_paused' };
  }

  const summaries = [];
  try {
    for (let touch = 0; touch <= 11; touch++) {
      const r = await executeSend({
        touch,
        limit: perTouchLimit,
        dryRun: false,
        confirm: 'SEND',
        ghl,
        dripMs
      });
      summaries.push({
        touch,
        sent: r.sent,
        failed: r.failed,
        runId: r.runId
      });
    }
    setAutoState({
      lastTickAt: new Date().toISOString(),
      lastError: null
    });
    return { ok: true, summaries };
  } catch (err) {
    setAutoState({
      lastTickAt: new Date().toISOString(),
      lastError: err.message || String(err)
    });
    return { ok: false, error: err.message || String(err), summaries };
  }
}

module.exports = {
  runAutoTick
};
