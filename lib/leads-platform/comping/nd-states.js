/** U.S. non-disclosure states — sold prices not in public record without MLS. */
const NON_DISCLOSURE_STATES = new Set([
  'AK', 'ID', 'KS', 'LA', 'MS', 'MO', 'MT', 'NM', 'ND', 'TX', 'UT', 'WY'
]);

function isNonDisclosureState(state) {
  return NON_DISCLOSURE_STATES.has(String(state || '').trim().toUpperCase());
}

module.exports = { NON_DISCLOSURE_STATES, isNonDisclosureState };
