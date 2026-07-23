'use strict';

const SUPPRESS_TAGS = new Set([
  'wrong number',
  'not interested',
  'dnc',
  'dnd',
  'interested',
  'follow up'
]);

function normalizeTag(t) {
  if (typeof t !== 'string') return '';
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function contactHasSuppressTag(tags) {
  if (!Array.isArray(tags)) return false;
  for (const tag of tags) {
    const norm = normalizeTag(tag);
    if (SUPPRESS_TAGS.has(norm)) return true;
  }
  return false;
}

module.exports = {
  normalizeTag,
  contactHasSuppressTag
};