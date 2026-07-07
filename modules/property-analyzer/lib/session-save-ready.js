/**
 * Pure helper: client may POST to /api/session-backup only when the in-memory
 * results array matches the server canonical count (avoids 409 downgrade_blocked).
 */
function expectedServerResultCount(state) {
  if (!state) return 0;
  const targets = [state.total, state.serverCanonical, state.processed, state.recordsLength]
    .map((n) => Number(n) || 0)
    .filter((n) => n > 0);
  return targets.length ? Math.max(...targets) : 0;
}

function isSessionReadyForServerSave(state) {
  if (!state || state.loading) return false;
  const expected = expectedServerResultCount(state);
  const resultsLength = Number(state.resultsLength) || 0;
  if (expected > 0 && resultsLength < expected) return false;
  return true;
}

module.exports = { isSessionReadyForServerSave, expectedServerResultCount };