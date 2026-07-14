'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULTS = {
  ghlPlanName: 'Starter',
  ghlPlanMonthlyUsd: 97,
  signnowPlanName: 'Business',
  signnowPlanMonthlyUsd: 20,
  notes: '',
  updatedAt: null
};

function rootDir() {
  if (config.OPERATING_COSTS_ROOT) {
    return config.OPERATING_COSTS_ROOT;
  }
  if (process.env.OPERATING_COSTS_ROOT) {
    return path.resolve(process.env.OPERATING_COSTS_ROOT);
  }
  if (process.env.PDA_DATA_ROOT) {
    return path.join(path.resolve(process.env.PDA_DATA_ROOT), 'operating-costs');
  }
  return path.join(config.ROOT, 'data', 'operating-costs');
}

function rateCardPath() {
  return path.join(rootDir(), 'rate-card.json');
}

function ensureRoot() {
  const dir = rootDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readRateCard() {
  try {
    const file = rateCardPath();
    if (!fs.existsSync(file)) return { ...DEFAULTS };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      ghlPlanMonthlyUsd: Number(raw.ghlPlanMonthlyUsd) || DEFAULTS.ghlPlanMonthlyUsd,
      signnowPlanMonthlyUsd: Number(raw.signnowPlanMonthlyUsd) || DEFAULTS.signnowPlanMonthlyUsd
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function writeRateCard(patch = {}) {
  ensureRoot();
  const current = readRateCard();
  const next = {
    ...current,
    ...patch,
    ghlPlanMonthlyUsd:
      patch.ghlPlanMonthlyUsd != null
        ? Math.max(0, Number(patch.ghlPlanMonthlyUsd) || 0)
        : current.ghlPlanMonthlyUsd,
    signnowPlanMonthlyUsd:
      patch.signnowPlanMonthlyUsd != null
        ? Math.max(0, Number(patch.signnowPlanMonthlyUsd) || 0)
        : current.signnowPlanMonthlyUsd,
    ghlPlanName:
      patch.ghlPlanName != null ? String(patch.ghlPlanName).trim() || current.ghlPlanName : current.ghlPlanName,
    signnowPlanName:
      patch.signnowPlanName != null
        ? String(patch.signnowPlanName).trim() || current.signnowPlanName
        : current.signnowPlanName,
    notes: patch.notes != null ? String(patch.notes) : current.notes,
    updatedAt: new Date().toISOString()
  };
  const file = rateCardPath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return next;
}

module.exports = {
  DEFAULTS,
  rootDir,
  ensureRoot,
  readRateCard,
  writeRateCard
};
