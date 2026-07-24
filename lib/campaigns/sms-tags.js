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

/** Person asked out — STOP / DNC language (not landline delivery failures). */
function hasPersonOptOutTag(tags) {
  if (!Array.isArray(tags)) return false;
  for (const tag of tags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    if (norm === 'dnc' || /\bdnc\b/.test(norm) || norm.includes('do not contact')) return true;
    if (norm.includes('do not call') || norm.includes('do not text') || norm.includes('dont text')) return true;
    if (norm.includes('don t text') || norm.includes('dont contact') || norm.includes('don t contact')) return true;
    if (/\bstop\b/.test(norm) && (norm.includes('sms') || norm.includes('text') || norm === 'stop')) return true;
    if (norm.includes('unsubscribe') || norm.includes('opt out') || norm.includes('opted out')) return true;
    if (norm.includes('remove me') || norm.includes('take me off')) return true;
    // Explicit person DND wording (not bare "dnd" — bare often means system)
    if (norm.includes('do not disturb') && !norm.includes('system')) return true;
    if (norm === 'person dnd' || norm === 'person dnc' || norm.includes('seller dnc')) return true;
  }
  return false;
}

/**
 * Delivery / landline / carrier failure signals (system blocked SMS).
 * Bare "dnd" alone is NOT enough — often used for both; pair with system flag.
 */
function hasSystemDeliveryBlockTag(tags) {
  if (!Array.isArray(tags)) return false;
  for (const tag of tags) {
    const norm = normalizeTag(tag);
    if (!norm) continue;
    if (norm.includes('landline') || norm.includes('land line')) return true;
    if (norm.includes('undeliverable') || norm.includes('undelivered')) return true;
    if (norm.includes('cannot receive') || norm.includes('can t receive') || norm.includes('cant receive')) return true;
    if (norm.includes('not a mobile') || norm.includes('not mobile') || norm.includes('no sms')) return true;
    if (norm.includes('sms fail') || norm.includes('sms failed') || norm.includes('text fail')) return true;
    if (norm.includes('delivery fail') || norm.includes('failed delivery')) return true;
    if (norm.includes('invalid number') && (norm.includes('sms') || norm.includes('text'))) return true;
    if (norm.includes('system dnd') || norm.includes('system sms') || norm.includes('sms dnd system')) return true;
    if (norm.includes('carrier block') || norm.includes('carrier reject')) return true;
  }
  return false;
}

/**
 * Split DNC/DND for KPIs:
 * - personOptOut: human said don't contact (DNC / STOP / etc.)
 * - systemSmsBlock: GHL SMS DND or landline/delivery failure — not a person opt-out
 *
 * Priority: person language wins when both present (still not eligible to text).
 */
function classifyDncDnd({ tags = [], systemSmsDnd = false } = {}) {
  const person = hasPersonOptOutTag(tags);
  const systemTag = hasSystemDeliveryBlockTag(tags);
  const bareDnd = (tags || []).some((t) => {
    const n = normalizeTag(t);
    return n === 'dnd' || n === 'sms dnd' || n === 'dnd sms';
  });

  // Person: explicit opt-out language
  const personOptOut = person;

  // System: delivery failure tags, or GHL SMS DND channel without person opt-out
  // Bare "dnd" + system SMS DND → treat as system (landline/error path)
  // Bare "dnd" without system flag → treat as person (manual tag)
  let systemSmsBlock = false;
  if (!personOptOut) {
    if (systemTag) systemSmsBlock = true;
    else if (systemSmsDnd) systemSmsBlock = true;
    else if (bareDnd && systemSmsDnd) systemSmsBlock = true;
  } else if (systemTag || systemSmsDnd) {
    // Still track system channel when person also opted out (for dual visibility optional)
    // KPI "system" stays false so person bucket is pure; both suppress eligibility
  }

  // Bare dnd, no system flag, no person language → person
  if (!personOptOut && !systemSmsBlock && bareDnd && !systemSmsDnd) {
    return {
      personOptOut: true,
      systemSmsBlock: false,
      kind: 'person'
    };
  }

  if (personOptOut) {
    return { personOptOut: true, systemSmsBlock: false, kind: 'person' };
  }
  if (systemSmsBlock || (systemSmsDnd && !personOptOut)) {
    return { personOptOut: false, systemSmsBlock: true, kind: 'system' };
  }
  return { personOptOut: false, systemSmsBlock: false, kind: null };
}

module.exports = {
  SUPPRESS_PHRASES,
  normalizeTag,
  contactHasSuppressTag,
  firstSuppressReason,
  hasPersonOptOutTag,
  hasSystemDeliveryBlockTag,
  classifyDncDnd
};
