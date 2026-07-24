'use strict';

/**
 * KPIs are scoped to contacts tagged `phuglee` only.
 * Never count whole-location "interested" / DNC tags from unrelated CRM lists.
 */

const { searchContactsByTag, readSmsCount, isSmsDndContact } = require('./sms-ghl');
const { evaluateContactEligibility } = require('./sms-eligibility');
const { classifyDncDnd } = require('./sms-tags');
const { listRuns } = require('./sms-store');
const { PHUGLEE_TAG } = require('./sms-policy');

let cache = { at: 0, value: null };
const CACHE_MS = 60_000;

function hasTag(tags, needle) {
  const n = String(needle || '').toLowerCase();
  return (tags || []).some((t) => {
    const s = String(t || '').toLowerCase();
    if (n === 'interested') {
      return (s === 'interested' || s.includes('interested')) && !s.includes('not interested');
    }
    if (n === 'not interested') {
      return s.includes('not interested') || s === 'ni';
    }
    if (n === 'follow up') {
      return s.includes('follow up') || s.includes('follow-up') || s.includes('followup');
    }
    if (n === 'wrong number') {
      return s.includes('wrong number') || s.includes('bad number');
    }
    if (n === 'dnc') {
      return s === 'dnc' || s.includes('do not contact') || /\bdnc\b/.test(s);
    }
    if (n === 'dnd') {
      return s === 'dnd' || /\bdnd\b/.test(s);
    }
    return s === n || s.includes(n);
  });
}

async function loadAllPhugleeContacts(d = {}) {
  const { contacts, total } = await searchContactsByTag(PHUGLEE_TAG, {
    pageLimit: 200,
    maxPages: 100
  }, d);
  return { contacts, total: total != null ? total : contacts.length };
}

function tallyFromContacts(contacts) {
  const now = Date.now();
  let interested = 0;
  let notInterested = 0;
  let dnc = 0;
  let dnd = 0;
  let personOptOut = 0;
  let systemSmsBlock = 0;
  let wrongNumber = 0;
  let followUp = 0;
  let neverTexted = 0;
  let inSequence = 0;
  let atMax = 0;
  let eligibleNow = 0;

  for (const c of contacts) {
    const tags = c.tags || [];
    const systemSmsDnd = isSmsDndContact(c);
    if (hasTag(tags, 'interested')) interested += 1;
    if (hasTag(tags, 'not interested')) notInterested += 1;
    if (hasTag(tags, 'dnc')) dnc += 1;
    if (hasTag(tags, 'dnd') || systemSmsDnd) dnd += 1;
    if (hasTag(tags, 'wrong number')) wrongNumber += 1;
    if (hasTag(tags, 'follow up')) followUp += 1;

    const cls = classifyDncDnd({ tags, systemSmsDnd });
    if (cls.personOptOut) personOptOut += 1;
    if (cls.systemSmsBlock) systemSmsBlock += 1;

    const smsCount = readSmsCount(c);
    if (smsCount <= 0) neverTexted += 1;
    else if (smsCount >= 12) atMax += 1;
    else inSequence += 1;

    const hasPhone = !!(c.phone || c.phoneNumber);
    const r = evaluateContactEligibility({
      tags,
      dndSms: systemSmsDnd,
      hasOpenDts: false,
      smsCount,
      lastSmsAt: null,
      hasPhone,
      now
    });
    if (r.ok) eligibleNow += 1;
  }

  return {
    outcomes: {
      interested,
      notInterested,
      // Split (primary KPIs)
      personOptOut,
      systemSmsBlock,
      // Combined still available for back-compat
      dncDnd: personOptOut + systemSmsBlock,
      dnc,
      dnd,
      wrongNumber,
      followUp
    },
    funnel: {
      phugleeContacts: contacts.length,
      neverTexted,
      inSequence,
      atMax,
      eligibleNow
    }
  };
}

function sentFromRuns() {
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
  return { sentThisWeek, sentAllTime };
}

async function fetchOutcomeKpis(d = {}) {
  const { contacts } = await loadAllPhugleeContacts(d);
  return tallyFromContacts(contacts).outcomes;
}

async function fetchFunnelKpis(d = {}) {
  const { contacts, total } = await loadAllPhugleeContacts(d);
  const t = tallyFromContacts(contacts);
  const sent = sentFromRuns();
  return {
    ...t.funnel,
    codeViolationContacts: t.funnel.phugleeContacts,
    sampled: contacts.length,
    totalReported: total,
    approximate: contacts.length < (total || 0),
    ...sent
  };
}

async function fetchOverviewKpis(d = {}) {
  if (cache.value && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.value, cached: true };
  }
  const { contacts, total } = await loadAllPhugleeContacts(d);
  const t = tallyFromContacts(contacts);
  const sent = sentFromRuns();
  const value = {
    scope: PHUGLEE_TAG,
    note: 'Counts only GHL contacts tagged phuglee (Phuglee vault / site leads).',
    outcomes: t.outcomes,
    funnel: {
      ...t.funnel,
      codeViolationContacts: t.funnel.phugleeContacts,
      sampled: contacts.length,
      totalReported: total,
      approximate: contacts.length < (total || 0),
      ...sent
    },
    cached: false
  };
  cache = { at: Date.now(), value };
  return value;
}

function clearKpiCache() {
  cache = { at: 0, value: null };
}

module.exports = {
  loadAllPhugleeContacts,
  fetchOutcomeKpis,
  fetchFunnelKpis,
  fetchOverviewKpis,
  clearKpiCache,
  PHUGLEE_TAG
};
