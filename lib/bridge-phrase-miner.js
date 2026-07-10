/**
 * Pure phrase mining from training events → proposed-only phraseRules.
 * No HTTP, no fs. Never writes status active.
 */

const crypto = require('crypto');

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'were',
  'been',
  'have',
  'into',
  'over',
  'under',
  'upon',
  'near',
  'property',
  'address',
  'street',
  'code',
  'violation'
]);

const MAX_CANDIDATES_PER_TEXT = 20;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenize free text into unigram + bigram candidates (lowercase, len≥4).
 */
function extractCandidates(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ');
  const tokens = raw
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t) && !STOPWORDS.has(t));

  const out = [];
  const seen = new Set();
  function add(c) {
    if (!c || seen.has(c)) return;
    if (out.length >= MAX_CANDIDATES_PER_TEXT) return;
    seen.add(c);
    out.push(c);
  }

  for (let i = 0; i < tokens.length; i++) {
    add(tokens[i]);
    if (i + 1 < tokens.length) add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/**
 * promote | suppress | null
 * Operator model: Approve = AI right (no phrase mine); Deny = AI wrong (mine).
 * - not_distressed + deny → promote (should have been distress)
 * - distressed + deny → suppress (should not have been distress)
 * - else skip
 */
function resolveDirection(event) {
  if (!event || typeof event !== 'object') return null;
  const section = String(event.section || '');
  const action = String(event.action || '').toLowerCase();
  const isDeny = action.includes('deny');

  if (section === 'not_distressed' && isDeny) return 'promote';
  if (section === 'distressed' && isDeny) return 'suppress';
  return null;
}

function kindForDirection(direction) {
  return direction === 'promote' ? 'promote_phrase' : 'suppress_phrase';
}

function oppositeDirection(direction) {
  return direction === 'promote' ? 'suppress' : 'promote';
}

function eventDirection(ev) {
  return resolveDirection(ev);
}

/**
 * Does a description sample support this candidate?
 * Prefer extractCandidates membership; also allow literal includes for multi-word.
 */
function sampleSupportsCandidate(sample, candidate) {
  const text = String(sample || '');
  if (!text || !candidate) return false;
  const cands = extractCandidates(text);
  if (cands.includes(candidate)) return true;
  return text.toLowerCase().includes(String(candidate).toLowerCase());
}

/**
 * Count same-direction evidence units for a candidate across events.
 * Each description sample that supports the candidate is one unit.
 * Events without mining direction are ignored for that direction tally.
 */
function countEvidence(events, candidate, direction) {
  let count = 0;
  for (const ev of events || []) {
    if (eventDirection(ev) !== direction) continue;
    const samples = Array.isArray(ev.descriptionSamples) ? ev.descriptionSamples : [];
    for (const sample of samples) {
      if (sampleSupportsCandidate(sample, candidate)) count += 1;
    }
  }
  return count;
}

function newPhraseRuleId() {
  return 'pr_' + crypto.randomBytes(4).toString('hex');
}

function shallowCloneBrain(brain) {
  const base =
    brain && typeof brain === 'object'
      ? brain
      : {
          version: 1,
          typeRules: [],
          phraseRules: [],
          events: [],
          metrics: {}
        };
  return {
    ...base,
    typeRules: Array.isArray(base.typeRules) ? base.typeRules.slice() : [],
    phraseRules: Array.isArray(base.phraseRules) ? base.phraseRules.slice() : [],
    events: Array.isArray(base.events) ? base.events.slice() : [],
    metrics:
      base.metrics && typeof base.metrics === 'object' ? { ...base.metrics } : {}
  };
}

/**
 * Mine phrase candidates from one decision event into proposed phraseRules.
 * Mutates a clone; never sets status active.
 *
 * @param {object} event
 * @param {object} brain
 * @returns {object} brain copy with phraseRules possibly updated
 */
function minePhrasesFromEvent(event, brain) {
  const direction = resolveDirection(event);
  const next = shallowCloneBrain(brain);

  if (!direction) return next;

  // Evidence pool: prior events + this event (if not already in list)
  const events = next.events.slice();
  const eventId = event && event.id;
  const alreadyIn = eventId && events.some((e) => e && e.id === eventId);
  if (!alreadyIn && event) events.push(event);

  const texts = [
    ...(Array.isArray(event.descriptionSamples) ? event.descriptionSamples : []),
    event.violationTypeLabel || ''
  ].filter((t) => t != null && String(t).trim());

  const candidateSet = new Set();
  for (const text of texts) {
    for (const c of extractCandidates(text)) candidateSet.add(c);
  }

  const kind = kindForDirection(direction);
  const opp = oppositeDirection(direction);
  const now = new Date().toISOString();

  for (const candidate of candidateSet) {
    const same = countEvidence(events, candidate, direction);
    if (same < 2) continue;

    const opposite = countEvidence(events, candidate, opp);
    if (opposite > 0) continue;

    // Upsert proposed rule for pattern+kind
    const existingIdx = next.phraseRules.findIndex(
      (r) =>
        r &&
        r.kind === kind &&
        String(r.pattern || '').toLowerCase() === candidate
    );

    if (existingIdx >= 0) {
      const existing = { ...next.phraseRules[existingIdx] };
      // Never upgrade status from miner
      if (existing.status === 'active' || existing.status === 'rejected' || existing.status === 'disabled') {
        // Leave reviewed rules alone; still may merge evidence ids only if proposed
        next.phraseRules[existingIdx] = existing;
        continue;
      }
      existing.status = 'proposed';
      existing.patternType = 'literal';
      const ids = Array.isArray(existing.evidenceEventIds)
        ? existing.evidenceEventIds.slice()
        : [];
      if (eventId && !ids.includes(eventId)) ids.push(eventId);
      // Also collect other supporting event ids
      for (const ev of events) {
        if (!ev || !ev.id) continue;
        if (eventDirection(ev) !== direction) continue;
        const samples = Array.isArray(ev.descriptionSamples) ? ev.descriptionSamples : [];
        if (samples.some((s) => sampleSupportsCandidate(s, candidate))) {
          if (!ids.includes(ev.id)) ids.push(ev.id);
        }
      }
      existing.evidenceEventIds = ids;
      next.phraseRules[existingIdx] = existing;
    } else {
      const evidenceEventIds = [];
      for (const ev of events) {
        if (!ev || !ev.id) continue;
        if (eventDirection(ev) !== direction) continue;
        const samples = Array.isArray(ev.descriptionSamples) ? ev.descriptionSamples : [];
        if (samples.some((s) => sampleSupportsCandidate(s, candidate))) {
          if (!evidenceEventIds.includes(ev.id)) evidenceEventIds.push(ev.id);
        }
      }
      next.phraseRules.push({
        id: newPhraseRuleId(),
        kind,
        pattern: candidate,
        patternType: 'literal',
        status: 'proposed',
        evidenceEventIds,
        createdAt: now,
        reviewedAt: null,
        reviewedBy: null
      });
    }
  }

  // Refresh proposed count if metrics present
  if (next.metrics && typeof next.metrics === 'object') {
    next.metrics.phraseRulesProposed = next.phraseRules.filter(
      (r) => r && r.status === 'proposed'
    ).length;
  }

  return next;
}

module.exports = {
  extractCandidates,
  minePhrasesFromEvent,
  escapeRegExp,
  // exported for unit clarity / decisions may not need these
  resolveDirection,
  STOPWORDS
};
