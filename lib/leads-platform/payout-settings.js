'use strict';

/**
 * Contract Tracker payout rules (admin-editable).
 * Default: no TC fee; assignment fee (minus photo cost) splits 50% Acq / 50% Dispo.
 */

const fs = require('fs');
const path = require('path');
const { catalogRoot } = require('./store');

/** Bump when product policy changes so stored settings migrate on read. */
const POLICY_VERSION = 2;

const DEFAULTS = Object.freeze({
  tcFee: 0,
  acqPercent: 50,
  dispoPercent: 50,
  policyVersion: POLICY_VERSION
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

function normalizeSettings(raw = {}) {
  // Product policy: TC is retired. Always force 0 regardless of stored/admin input.
  const tcFee = 0;
  let acqPercent = clampPercent(raw.acqPercent, DEFAULTS.acqPercent);
  let dispoPercent = clampPercent(raw.dispoPercent, DEFAULTS.dispoPercent);
  const sum = acqPercent + dispoPercent;
  if (Math.abs(sum - 100) > 0.05) {
    dispoPercent = Math.round((100 - acqPercent) * 100) / 100;
    if (dispoPercent < 0) dispoPercent = 0;
  }
  return {
    tcFee,
    acqPercent,
    dispoPercent,
    policyVersion: POLICY_VERSION,
    updatedAt: raw.updatedAt || null
  };
}

function needsPolicyMigration(raw) {
  if (!raw || typeof raw !== 'object') return true;
  const ver = Number(raw.policyVersion);
  if (!Number.isFinite(ver) || ver < POLICY_VERSION) return true;
  if (Number(raw.tcFee) > 0) return true;
  return false;
}

function readPayoutSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (needsPolicyMigration(raw)) {
      const migrated = normalizeSettings({
        ...raw,
        tcFee: 0,
        acqPercent: raw.acqPercent != null ? raw.acqPercent : DEFAULTS.acqPercent,
        dispoPercent: raw.dispoPercent != null ? raw.dispoPercent : DEFAULTS.dispoPercent,
        // One-time cutover from the old 70/30 + TC product default.
        ...(Number(raw.acqPercent) === 70 && Number(raw.dispoPercent) === 30
          ? { acqPercent: 50, dispoPercent: 50 }
          : {}),
        updatedAt: new Date().toISOString()
      });
      writeJsonAtomic(file, migrated);
      return migrated;
    }
    return normalizeSettings(raw);
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function writePayoutSettings(patch = {}) {
  const current = readPayoutSettings();
  const next = normalizeSettings({
    tcFee: 0,
    acqPercent: patch.acqPercent != null ? clampPercent(patch.acqPercent, current.acqPercent) : current.acqPercent,
    dispoPercent: patch.dispoPercent != null ? clampPercent(patch.dispoPercent, current.dispoPercent) : current.dispoPercent,
    updatedAt: new Date().toISOString()
  });
  if (patch.acqPercent != null && patch.dispoPercent == null) {
    next.dispoPercent = Math.round((100 - next.acqPercent) * 100) / 100;
  } else if (patch.dispoPercent != null && patch.acqPercent == null) {
    next.acqPercent = Math.round((100 - next.dispoPercent) * 100) / 100;
  }
  next.tcFee = 0;
  next.policyVersion = POLICY_VERSION;
  writeJsonAtomic(settingsPath(), next);
  return next;
}

/**
 * assignmentFee → after photo cost → acq% / dispo%
 * TC fee is retired (always $0).
 * @param {number|null|string} assignmentFee
 * @param {number|null|string} [photoCostOrSettings]
 * @param {object} [maybeSettings]
 * @returns {{ tcPay: number|null, acqPay: number|null, dispoPay: number|null, netAfterTc: number|null, photoCost: number|null, netAfterCosts: number|null, settings: object }}
 */
function computeDealPayouts(assignmentFee, photoCostOrSettings, maybeSettings) {
  let photoCost = 0;
  let settings = readPayoutSettings();
  if (photoCostOrSettings && typeof photoCostOrSettings === 'object' && !Array.isArray(photoCostOrSettings)
    && (photoCostOrSettings.tcFee != null || photoCostOrSettings.acqPercent != null)) {
    settings = normalizeSettings(photoCostOrSettings);
  } else if (arguments.length >= 2) {
    const n = Number(photoCostOrSettings);
    photoCost = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    if (maybeSettings && typeof maybeSettings === 'object') settings = normalizeSettings(maybeSettings);
  }

  const fee = assignmentFee == null || assignmentFee === ''
    ? null
    : Number(assignmentFee);
  if (fee == null || !Number.isFinite(fee)) {
    return {
      tcPay: null,
      acqPay: null,
      dispoPay: null,
      netAfterTc: null,
      photoCost: null,
      netAfterCosts: null,
      settings
    };
  }
  // TC retired — keep tcPay field as 0 for API compatibility.
  const tcPay = 0;
  const netAfterTc = Math.max(0, fee);
  const photo = Math.min(photoCost, netAfterTc);
  const netAfterCosts = Math.max(0, netAfterTc - photo);
  // Remainder math so acq + dispo always equals netAfterCosts (no penny drift).
  const acqPay = Math.round(netAfterCosts * (settings.acqPercent / 100) * 100) / 100;
  const dispoPay = Math.round((netAfterCosts - acqPay) * 100) / 100;
  return {
    tcPay,
    acqPay,
    dispoPay,
    netAfterTc,
    photoCost: photo,
    netAfterCosts,
    settings
  };
}

module.exports = {
  DEFAULTS,
  POLICY_VERSION,
  readPayoutSettings,
  writePayoutSettings,
  computeDealPayouts
};
