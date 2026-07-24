'use strict';

/**
 * Campaigns → SMS policy constants.
 * FROM numbers match production drip scripts (scripts/_tmp-drip-blast-unique4.js).
 */

const SMS_SPACING_MS = 4 * 24 * 60 * 60 * 1000;
const SMS_HARD_MIN_MS = 24 * 60 * 60 * 1000;
const SMS_MAX_TOUCHES = 12;
/** Canonical tag on every Phuglee vault contact in GHL (KPI + blast scope). */
const PHUGLEE_TAG = 'phuglee';
const SOURCE_TAG = 'code violation';

/**
 * Auto-tagger labels (CRM filters + KPI split).
 * person:dnc  = human asked not to be contacted
 * system:landline = SMS channel blocked / landline / undeliverable (not a person opt-out)
 */
const TAG_PERSON_DNC = 'person:dnc';
const TAG_SYSTEM_LANDLINE = 'system:landline';

/** Local GHL numbers by property state (E.164). */
const FROM_BY_STATE = {
  AZ: '+16028387612',
  CO: '+17205758557',
  FL: '+13868682873',
  GA: '+16786080083',
  IN: '+13174691363',
  NC: '+19804103655',
  OH: '+13802674684',
  TX: '+19723629853'
};

/** When no local number, map state → FROM_BY_STATE key. */
const FALLBACK_BY_STATE = {
  NV: 'AZ',
  WY: 'CO',
  NE: 'CO',
  TN: 'GA',
  KY: 'OH',
  MA: 'NC',
  RI: 'NC',
  DE: 'NC',
  SC: 'NC',
  AL: 'GA',
  MS: 'GA',
  LA: 'TX',
  OK: 'TX',
  NM: 'AZ',
  UT: 'CO',
  KS: 'CO',
  MO: 'IN',
  IL: 'IN',
  MI: 'OH',
  PA: 'OH',
  VA: 'NC',
  WV: 'OH'
};

function classTagForLeadType(leadType) {
  if (!leadType) return null;
  const normalized = String(leadType).toLowerCase().trim();
  if (normalized === 'distressed') return 'class:distressed';
  if (normalized === 'well_maintained' || normalized === 'well-maintained') {
    return 'class:well maintained';
  }
  if (normalized === 'land') return 'class:land';
  return null;
}

function resolveFromNumber(state) {
  const st = String(state || '').trim().toUpperCase();
  if (FROM_BY_STATE[st]) return FROM_BY_STATE[st];
  const fb = FALLBACK_BY_STATE[st];
  if (fb && FROM_BY_STATE[fb]) return FROM_BY_STATE[fb];
  return FROM_BY_STATE.TX;
}

module.exports = {
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SMS_MAX_TOUCHES,
  PHUGLEE_TAG,
  SOURCE_TAG,
  TAG_PERSON_DNC,
  TAG_SYSTEM_LANDLINE,
  FROM_BY_STATE,
  FALLBACK_BY_STATE,
  classTagForLeadType,
  resolveFromNumber
};
