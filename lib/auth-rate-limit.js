/**
 * In-memory login attempt tracking with prune (Wave 3).
 */
const MAX_KEYS = 5000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

/**
 * @param {Map<string, { count: number, resetAt: number }>} map
 * @param {number} [now]
 */
function pruneLoginAttempts(map, now = Date.now()) {
  for (const [k, row] of map) {
    if (!row || row.resetAt < now) map.delete(k);
  }
  if (map.size <= MAX_KEYS) return;
  const entries = [...map.entries()].sort(
    (a, b) => (a[1].resetAt || 0) - (b[1].resetAt || 0)
  );
  const drop = map.size - MAX_KEYS;
  for (let i = 0; i < drop; i++) map.delete(entries[i][0]);
}

/**
 * @param {Map} map
 * @param {string} ip
 * @param {string} username
 * @param {number} [now]
 * @returns {boolean} true if allowed
 */
function authRateLimitOk(map, ip, username, now = Date.now()) {
  if (map.size > MAX_KEYS / 2) pruneLoginAttempts(map, now);
  const key = `${ip}|${String(username || '').toLowerCase()}`;
  let row = map.get(key);
  if (!row || row.resetAt < now) {
    row = { count: 0, resetAt: now + WINDOW_MS };
    map.set(key, row);
  }
  row.count += 1;
  return row.count <= MAX_ATTEMPTS;
}

module.exports = {
  MAX_KEYS,
  WINDOW_MS,
  MAX_ATTEMPTS,
  pruneLoginAttempts,
  authRateLimitOk
};
