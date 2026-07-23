'use strict';

const SMS_SPACING_MS = 4 * 24 * 60 * 60 * 1000;
const SMS_HARD_MIN_MS = 24 * 60 * 60 * 1000;
const SMS_MAX_TOUCHES = 12;
const SOURCE_TAG = 'code violation';

const FROM_BY_STATE = {
  AZ: '+14806008366',
  CA: '+19492202366',
  CO: '+17202884766',
  FL: '+19547874066',
  GA: '+14702628366',
  IN: '+13174078266',
  KY: '+15022805066',
  MI: '+12485507166',
  NC: '+17047073366',
  NJ: '+17324557266',
  NV: '+17029006066',
  NY: '+17183807166',
  OH: '+12166803066',
  PA: '+12152836366',
  SC: '+18432695266',
  TN: '+16156227066',
  TX: '+12142814366',
  VA: '+17572676366'
};

const FALLBACK_BY_STATE = {
  AZ: '+14806008366',
  CA: '+19492202366',
  CO: '+17202884766',
  FL: '+19547874066',
  GA: '+14702628366',
  IN: '+13174078266',
  KY: '+15022805066',
  MI: '+12485507166',
  NC: '+17047073366',
  NJ: '+17324557266',
  NV: '+17029006066',
  NY: '+17183807166',
  OH: '+12166803066',
  PA: '+12152836366',
  SC: '+18432695266',
  TN: '+16156227066',
  TX: '+12142814366',
  VA: '+17572676366'
};

function classTagForLeadType(leadType) {
  if (!leadType) return null;
  const normalized = String(leadType).toLowerCase().trim();
  if (normalized === 'distressed') return 'class:distressed';
  if (normalized === 'well_maintained' || normalized === 'well-maintained') return 'class:well maintained';
  if (normalized === 'land') return 'class:land';
  return null;
}

function resolveFromNumber(state) {
  if (!state) return null;
  const upper = String(state).toUpperCase().trim();
  return FROM_BY_STATE[upper] || FALLBACK_BY_STATE[upper] || null;
}

module.exports = {
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SMS_MAX_TOUCHES,
  SOURCE_TAG,
  FROM_BY_STATE,
  FALLBACK_BY_STATE,
  classTagForLeadType,
  resolveFromNumber
};