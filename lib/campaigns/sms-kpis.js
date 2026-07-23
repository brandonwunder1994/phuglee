'use strict';

const { searchContactsByTag } = require('./sms-ghl');
const { readSmsCount, isSmsDndContact } = require('./sms-ghl');
const { contactHasSuppressTag, firstSuppressReason } = require('./sms-tags');
const { evaluateContactEligibility } = require('./sms-eligibility');
const { listRuns } = require('./sms-store');
const { SOURCE_TAG } = require('./sms-policy');

let cache = { at: 0, value: null };
const CACHE_MS = 60_000;

async function countTag(tag, d) {
  try {
    const { total, contacts } = await searchContactsByTag(tag, { pageLimit: 100, maxPages: 5 }, d);
    // If total reliable use it; else contacts length on partial
    if (total != null && total > 0) return total;
    return contacts.length;
  } catch (_) {
    return 0;
  }
}

async function fetchOutcomeKpis(d = {}) {
  const [interested, notInterested, dnc, dnd, wrongNumber, followUp] = await Promise.all([
    countTag('interested', d),
    countTag('not interested', d),
    countTag('dnc', d),
    countTag('dnd', d),
    countTag('wrong number', d),
    countTag('follow up', d)
  ]);
  return {
    interested,
    notInterested,
    dncDnd: dnc + dnd,
    dnc,
    dnd,
    wrongNumber,
    followUp
  };
}

/**
 * Funnel KPIs from code-violation tagged contacts (paginated sample-aware).
 * For large accounts maxPages caps API load; counts may be approximate.
 */
async function fetchFunnelKpis(d = {}) {
  const { contacts, total } = await searchContactsByTag(SOURCE_TAG, {
    pageLimit: 200,
    maxPages: 15
  }, d);

  let neverTexted = 0;
  let inSequence = 0;
  let atMax = 0;
  let eligibleNow = 0;
  const now = Date.now();

  for (const c of contacts) {
    const tags = c.tags || [];
    const smsCount = readSmsCount(c);
    if (smsCount <= 0) neverTexted += 1;
    else if (smsCount >= 12) atMax += 1;
    else inSequence += 1;

    const hasPhone = !!(c.phone || c.phoneNumber);
    // Open DTS skipped in bulk KPI for cost — treat false here; send path checks live
    const r = evaluateContactEligibility({
      tags,
      dndSms: isSmsDndContact(c),
      hasOpenDts: false,
      smsCount,
      lastSmsAt: null,
      hasPhone,
      now
    });
    if (r.ok) eligibleNow += 1;
  }

  const runs = listRuns({ limit: 50 });
  const weekAgo = Date.now() - 7 * 86400000;
  let sentThisWeek = 0;
  let sentAllTime = 0;
  for (const run of runs) {
    if (run.dryRun) continue;
    const n = Number(run.sent) || 0;
    sentAllTime += n;
    if (run.at && Date.parse(run.at) >= weekAgo) sentThisWeek += n;
  }

  return {
    codeViolationContacts: total || contacts.length,
    sampled: contacts.length,
    neverTexted,
    inSequence,
    atMax,
    eligibleNow,
    sentThisWeek,
    sentAllTime,
    approximate: contacts.length < (total || 0)
  };
}

async function fetchOverviewKpis(d = {}) {
  if (cache.value && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.value, cached: true };
  }
  const [outcomes, funnel] = await Promise.all([
    fetchOutcomeKpis(d),
    fetchFunnelKpis(d)
  ]);
  const value = { outcomes, funnel, cached: false };
  cache = { at: Date.now(), value };
  return value;
}

function clearKpiCache() {
  cache = { at: 0, value: null };
}

module.exports = {
  fetchOutcomeKpis,
  fetchFunnelKpis,
  fetchOverviewKpis,
  clearKpiCache
};
