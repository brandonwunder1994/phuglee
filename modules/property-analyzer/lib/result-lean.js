'use strict';

/**
 * Lean list projection for paginated session-results.
 * Never mutates the on-disk session — copies only.
 */

const PROFILE_TOP_LEVEL = [
  'marketValue',
  'avm',
  'wholesaleValue',
  'county',
  'ownerType',
  'ownerName'
];

function leanResultForList(result) {
  if (!result || typeof result !== 'object') return result;
  const hadProfile = !!(result.profile && typeof result.profile === 'object');
  const out = { ...result };
  delete out.profile;
  // Keep tiny top-level scalars (marketValue, etc.) for cards/filters.
  // Nested profile (phones, flags, amenities) loads on property open.
  if (hadProfile) out.profileDeferred = true;
  return out;
}

function leanResultsForList(results) {
  if (!Array.isArray(results)) return [];
  return results.map(leanResultForList);
}

function profilePayloadFromResult(result) {
  if (!result || typeof result !== 'object') {
    return { profile: null };
  }
  const payload = {
    profile: result.profile && typeof result.profile === 'object' ? result.profile : null
  };
  for (const key of PROFILE_TOP_LEVEL) {
    if (result[key] != null && result[key] !== '') payload[key] = result[key];
  }
  return payload;
}

module.exports = {
  leanResultForList,
  leanResultsForList,
  profilePayloadFromResult,
  PROFILE_TOP_LEVEL
};
