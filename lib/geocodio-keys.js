/**
 * Load Geocodio API keys + account labels from environment.
 * Never log full keys — use fingerprint only.
 */

function splitList(raw) {
  return String(raw || '')
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fingerprint(key) {
  const k = String(key || '');
  if (k.length <= 4) return k || '????';
  return `…${k.slice(-4)}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ keys: Array<{ id: string, key: string, email: string, fingerprint: string }>, dailyLimit: number, timezone: string }}
 */
function loadGeocodioKeys(env = process.env) {
  const keysRaw = splitList(env.GEOCODIO_API_KEYS);
  const emails = splitList(env.GEOCODIO_API_ACCOUNTS);
  const dailyLimit = Math.max(
    1,
    Number(env.GEOCODIO_DAILY_LIMIT) || 2500
  );
  const timezone = String(env.GEOCODIO_USAGE_TZ || 'America/Phoenix').trim() || 'America/Phoenix';

  const keys = keysRaw.map((key, i) => ({
    id: `k${i}`,
    key,
    email: emails[i] || `key-${i + 1}`,
    fingerprint: fingerprint(key)
  }));

  if (emails.length && emails.length !== keysRaw.length) {
    console.warn(
      `[Geocodio] GEOCODIO_API_ACCOUNTS count (${emails.length}) != keys (${keysRaw.length})`
    );
  }

  return { keys, dailyLimit, timezone };
}

function hasGeocodioKeys(env = process.env) {
  return loadGeocodioKeys(env).keys.length > 0;
}

module.exports = {
  splitList,
  fingerprint,
  loadGeocodioKeys,
  hasGeocodioKeys
};
