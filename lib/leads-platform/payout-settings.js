'use strict';

/**
 * Contract Tracker payout rules (admin-editable).
 * Default: TC $250 off the top of assignment fee, then 70% Acq / 30% Dispo.
 */

const fs = require('fs');
const path = require('path');
const { catalogRoot } = require('./store');

const DEFAULTS = Object.freeze({
  tcFee: 250,
  acqPercent: 70,
  dispoPercent: 30
});

function settingsPath() {
  return path.join(catalogRoot(), 'contracts', 'payout-settings.json');
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function clampMoney(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.round(v * 100) / 100;
}

function clampPercent(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 100) return fallback;
  return Math.round(v * 100) / 100;
}

function readPayoutSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tcFee = clampMoney(raw.tcFee, DEFAULTS.tcFee);
    let acqPercent = clampPercent(raw.acqPercent, DEFAULTS.acqPercent);
    let dispoPercent = clampPercent(raw.dispoPercent, DEFAULTS.dispoPercent);
    // If both present and don't sum to ~100, trust acq and derive dispo.
    const sum = acqPercent + dispoPercent;
    if (Math.abs(sum - 100) > 0.05) {
      dispoPercent = Math.round((100 - acqPercent) * 100) / 100;
      if (dispoPercent < 0) dispoPercent = 0;
    }
    return {
      tcFee,
      acqPercent,
      dispoPercent,
      updatedAt: raw.updatedAt || null
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function writePayoutSettings(patch = {}) {
  const current = readPayoutSettings();
  const next = {
    tcFee: patch.tcFee != null ? clampMoney(patch.tcFee, current.tcFee) : current.tcFee,
    acqPercent: patch.acqPercent != null ? clampPercent(patch.acqPercent, current.acqPercent) : current.acqPercent,
    dispoPercent: patch.dispoPercent != null ? clampPercent(patch.dispoPercent, current.dispoPercent) : current.dispoPercent,
    updatedAt: new Date().toISOString()
  };
  if (patch.acqPercent != null && patch.dispoPercent == null) {
    next.dispoPercent = Math.round((100 - next.acqPercent) * 100) / 100;
  } else if (patch.dispoPercent != null && patch.acqPercent == null) {
    next.acqPercent = Math.round((100 - next.dispoPercent) * 100) / 100;
  }
  writeJsonAtomic(settingsPath(), next);
  return next;
}

/**
 * assignmentFee → after TC fee → acq% / dispo%
 * @returns {{ tcPay: number|null, acqPay: number|null, dispoPay: number|null, netAfterTc: number|null, settings: object }}
 */
function computeDealPayouts(assignmentFee, settings = readPayoutSettings()) {
  const fee = assignmentFee == null || assignmentFee === ''
    ? null
    : Number(assignmentFee);
  if (fee == null || !Number.isFinite(fee)) {
    return {
      tcPay: null,
      acqPay: null,
      dispoPay: null,
      netAfterTc: null,
      settings
    };
  }
  const tcPay = Math.min(settings.tcFee, Math.max(0, fee));
  const netAfterTc = Math.max(0, fee - tcPay);
  const acqPay = Math.round(netAfterTc * (settings.acqPercent / 100) * 100) / 100;
  const dispoPay = Math.round(netAfterTc * (settings.dispoPercent / 100) * 100) / 100;
  return { tcPay, acqPay, dispoPay, netAfterTc, settings };
}

module.exports = {
  DEFAULTS,
  readPayoutSettings,
  writePayoutSettings,
  computeDealPayouts
};
