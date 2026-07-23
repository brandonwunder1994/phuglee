'use strict';

/** Locked suppress labels (normalized). */
const SUPPRESS_PHRASES = [
  'wrong number',
  'not interested',
  'dnc',
  'dnd',
  'interested',
  'follow up',
  'followup'
];

function normalizeTag(t) {
  if (typeof t !== 'string') return '';
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True if any contact tag matches a cold-blast suppress rule.
 * "interested" must not match when the tag is "not interested".
 */
function contactHasSuppressTag(tags) {
  if (!Array.isArray(tags)) return false;
  for (const tag of tags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    if (norm === 'dnc' || /\bdnc\b/.test(norm) || norm.includes('do not contact')) return true;
    if (norm === 'dnd' || /\bdnd\b/.test(norm)) return true;
    if (norm.includes('wrong number') || norm.includes('bad number')) return true;
    if (norm.includes('not interested') || norm === 'ni') return true;
    if (norm.includes('follow up') || norm.includes('followup')) return true;
    // bare "interested" but not "not interested" (already handled)
    if (norm === 'interested' || (norm.includes('interested') && !norm.includes('not interested'))) {
      return true;
    }
  }
  return false;
}

function firstSuppressReason(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    if (norm.includes('wrong number') || norm.includes('bad number')) return 'wrong number';
    if (norm.includes('not interested') || norm === 'ni') return 'not interested';
    if (norm === 'dnc' || /\bdnc\b/.test(norm) || norm.includes('do not contact')) return 'dnc';
    if (norm === 'dnd' || /\bdnd\b/.test(norm)) return 'dnd';
    if (norm.includes('follow up') || norm.includes('followup')) return 'follow up';
    if (norm === 'interested' || (norm.includes('interested') && !norm.includes('not interested'))) {
      return 'interested';
    }
  }
  return null;
}

module.exports = {
  SUPPRESS_PHRASES,
  normalizeTag,
  contactHasSuppressTag,
  firstSuppressReason
};
