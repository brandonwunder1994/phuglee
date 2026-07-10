/**
 * Pure helpers for stable review-group keys.
 * Strip incidental dates/times so same-category free-text stacks.
 * Does not mutate process rows.
 */

const { violationTypeKey } = require('./bridge-brain-store');

// Order matters: ISO first (date+optional time), then US date, then leftover times.
const DATE_ISO_RE =
  /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gi;
const DATE_US_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\b/g;

/**
 * Remove incidental US/ISO dates and times from free-text or type labels.
 * Leaves category words and ordinance-like short numbers intact.
 * @param {unknown} text
 * @returns {string}
 */
function stripIncidentalTimestamps(text) {
  let s = String(text || '');
  s = s.replace(DATE_ISO_RE, ' ');
  s = s.replace(DATE_US_RE, ' ');
  s = s.replace(TIME_RE, ' ');
  // Dangling separators left after date/time removal
  s = s.replace(/\s+[-–—|,;:/]+\s+/g, ' ');
  s = s.replace(/^[-–—|,;:/]+\s*/, '').replace(/\s*[-–—|,;:/]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Stable type key: strip timestamps then violationTypeKey (empty → '__unknown__').
 * @param {unknown} text
 * @returns {string}
 */
function stableTypeKey(text) {
  return violationTypeKey(stripIncidentalTimestamps(text));
}

/**
 * Stable free-text description key for empty-type groups.
 * Strip + lower + collapse spaces; empty → '' (never '__unknown__').
 * @param {unknown} text
 * @returns {string}
 */
function stableDescriptionKey(text) {
  const stripped = stripIncidentalTimestamps(String(text || ''));
  return String(stripped || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

module.exports = {
  stripIncidentalTimestamps,
  stableTypeKey,
  stableDescriptionKey
};
