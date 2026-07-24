'use strict';

/**
 * KPIs are scoped to contacts tagged `phuglee` only.
 * Never count whole-location "interested" / DNC tags from unrelated CRM lists.
 *
 * Overview is fail-soft + stale-while-revalidate: never block the SMS desk on a
 * full GHL contact crawl (can be 10k+ pages after vault backfill).
 */

const fs = require('fs');
const path = require('path');
const { searchContactsByTag, readSmsCount, isSmsDndContact } = require('./sms-ghl');
const { evaluateContactEligibility } = require('./sms-eligibility');
const { classifyDncDnd } = require('./sms-tags');
const { listRuns, dataRoot, ensureDirs } = require('./sms-store');
const { writeJsonAtomic } = require('../write-json-atomic');
const { PHUGLEE_TAG } = require('./sms-policy');

/** Serve memory as fresh without GHL. */
const FRESH_MS = 5 * 60_000;
/** Disk snapshot older than this still returns, but forces a background recompute. */
const STALE_REFRESH_MS = 5 * 60_000;

let cache = { at: 0, value: null };
let refreshInFlight = null;

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

function snapshotPath() {
  return path.join(dataRoot(), 'kpi-snapshot.json');
}

function emptyOutcomes() {
  return {
    interested: 0,
    notInterested: 0,
    personOptOut: 0,
    systemSmsBlock: 0,
    dncDnd: 0,
    dnc: 0,
    dnd: 0,
    wrongNumber: 0,
    followUp: 0
  };
}

function emptyFunnel() {
  return {
    phugleeContacts: 0,
    neverTexted: 0,
    inSequence: 0,
    atMax: 0,
    eligibleNow: 0,
    codeViolationContacts: 0,
    sampled: 0,
    totalReported: 0,
    approximate: false,
    sentThisWeek: 0,
    sentAllTime: 0
  };
}

function placeholderKpis(extra = {}) {
  return {
    scope: PHUGLEE_TAG,
    note: 'Counts only GHL contacts tagged phuglee (Phuglee vault / site leads).',
    outcomes: emptyOutcomes(),
    funnel: emptyFunnel(),
    cached: true,
    kpisLoading: true,
    stale: true,
    ...extra
  };
}

function readKpiSnapshot() {
  try {
    const file = snapshotPath();
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.outcomes) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

function writeKpiSnapshot(value) {
  try {
    ensureDirs();
    const row = {
      ...value,
      computedAt: new Date().toISOString(),
      cached: false,
      kpisLoading: false,
      stale: false
    };
    writeJsonAtomic(snapshotPath(), row);
    return row;
  } catch (err) {
    console.warn('[campaigns-sms] kpi snapshot write failed:', err && err.message);
    return value;
  }
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
      personOptOut,
      systemSmsBlock,
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

function buildKpiValue(contacts, total) {
  const t = tallyFromContacts(contacts);
  const sent = sentFromRuns();
  return {
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
    cached: false,
    kpisLoading: false,
    stale: false
  };
}

/** Full GHL crawl + persist. Used by background refresh and force=true. */
async function computeOverviewKpis(d = {}) {
  const { contacts, total } = await loadAllPhugleeContacts(d);
  const value = buildKpiValue(contacts, total);
  cache = { at: Date.now(), value };
  writeKpiSnapshot(value);
  return { ...value, cached: false, kpisLoading: false, stale: false };
}

function scheduleKpiRefresh(d = {}) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = Promise.resolve()
    .then(() => computeOverviewKpis(d))
    .catch((err) => {
      console.warn('[campaigns-sms] kpi refresh failed:', err && err.message);
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
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

/**
 * Fast overview KPIs for the SMS admin desk.
 * @param {object} d injectables
 * @param {{ force?: boolean }} [opts] force=true blocks on a full recompute
 */
async function fetchOverviewKpis(d = {}, opts = {}) {
  if (opts && opts.force) {
    return computeOverviewKpis(d);
  }

  const now = Date.now();

  if (cache.value && now - cache.at < FRESH_MS) {
    return {
      ...cache.value,
      cached: true,
      kpisLoading: false,
      stale: false
    };
  }

  const snap = readKpiSnapshot();
  if (snap && snap.outcomes) {
    const computedMs = snap.computedAt ? Date.parse(snap.computedAt) : 0;
    const age = Number.isFinite(computedMs) && computedMs > 0
      ? now - computedMs
      : STALE_REFRESH_MS + 1;
    const stale = age >= STALE_REFRESH_MS;
    cache = {
      at: Number.isFinite(computedMs) && computedMs > 0 ? computedMs : now,
      value: {
        scope: snap.scope || PHUGLEE_TAG,
        note: snap.note,
        outcomes: snap.outcomes,
        funnel: snap.funnel || emptyFunnel()
      }
    };
    if (stale) scheduleKpiRefresh(d);
    const sent = sentFromRuns();
    return {
      scope: snap.scope || PHUGLEE_TAG,
      note: snap.note || 'Counts only GHL contacts tagged phuglee (Phuglee vault / site leads).',
      outcomes: snap.outcomes,
      funnel: {
        ...(snap.funnel || emptyFunnel()),
        // Local runs update without a full GHL crawl
        ...sent
      },
      cached: true,
      stale,
      kpisLoading: stale,
      computedAt: snap.computedAt || null
    };
  }

  scheduleKpiRefresh(d);
  return placeholderKpis({
    note: 'KPIs loading from GHL in the background…'
  });
}

function clearKpiCache() {
  cache = { at: 0, value: null };
}

module.exports = {
  loadAllPhugleeContacts,
  fetchOutcomeKpis,
  fetchFunnelKpis,
  fetchOverviewKpis,
  computeOverviewKpis,
  scheduleKpiRefresh,
  clearKpiCache,
  readKpiSnapshot,
  PHUGLEE_TAG,
  FRESH_MS
};
