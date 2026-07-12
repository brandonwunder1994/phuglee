/**
 * Per-key daily Geocodio usage ledger (2,500 free lookups/day).
 * Counts lookups made through this app; hard-syncs when Geocodio rejects a key.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { loadGeocodioKeys, fingerprint } = require('./geocodio-keys');

function usageRoot(rootOverride) {
  return rootOverride || config.GEOCODIO_ROOT;
}

function usagePath(rootOverride) {
  return path.join(usageRoot(rootOverride), 'usage.json');
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[Geocodio usage] could not read', filePath, err.message);
    return fallback;
  }
}

/**
 * Calendar day YYYY-MM-DD in the given IANA timezone.
 * @param {string} timezone
 * @param {Date} [now]
 */
function calendarDayInTz(timezone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) { /* fall through */ }
  return now.toISOString().slice(0, 10);
}

/**
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 */
function loadUsage(opts = {}) {
  const env = opts.env || process.env;
  const { keys, dailyLimit, timezone } = loadGeocodioKeys(env);
  const day = calendarDayInTz(timezone, opts.now || new Date());
  const file = usagePath(opts.root);
  const stored = readJson(file, null);

  const byId = new Map();
  if (stored && stored.day === day && Array.isArray(stored.keys)) {
    for (const row of stored.keys) {
      if (row && row.id) byId.set(row.id, row);
    }
  }

  const outKeys = keys.map((k) => {
    const prev = byId.get(k.id);
    const used = Math.min(
      dailyLimit,
      Math.max(0, Number(prev?.used) || 0)
    );
    const exhausted = Boolean(prev?.exhausted) || used >= dailyLimit;
    return {
      id: k.id,
      email: k.email,
      fingerprint: k.fingerprint,
      used: exhausted && used < dailyLimit ? dailyLimit : used,
      exhausted: exhausted || used >= dailyLimit,
      lastError: prev?.lastError || null
    };
  });

  return {
    timezone,
    day,
    dailyLimit,
    keys: outKeys
  };
}

/**
 * @param {object} usage
 * @param {{ root?: string }} [opts]
 */
function saveUsage(usage, opts = {}) {
  const payload = {
    timezone: usage.timezone,
    day: usage.day,
    dailyLimit: usage.dailyLimit,
    keys: (usage.keys || []).map((k) => ({
      id: k.id,
      email: k.email,
      fingerprint: k.fingerprint || fingerprint(k.key),
      used: Math.max(0, Number(k.used) || 0),
      exhausted: Boolean(k.exhausted),
      lastError: k.lastError || null
    })),
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(usagePath(opts.root), payload);
  return payload;
}

/**
 * @param {string} keyId
 * @param {number} n
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 */
function recordLookups(keyId, n, opts = {}) {
  const usage = loadUsage(opts);
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const row = usage.keys.find((k) => k.id === keyId);
  if (!row || count === 0) return usage;
  row.used = Math.min(usage.dailyLimit, row.used + count);
  if (row.used >= usage.dailyLimit) row.exhausted = true;
  saveUsage(usage, opts);
  return usage;
}

/**
 * @param {string} keyId
 * @param {string} [message]
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 */
function markExhausted(keyId, message, opts = {}) {
  const usage = loadUsage(opts);
  const row = usage.keys.find((k) => k.id === keyId);
  if (!row) return usage;
  row.used = usage.dailyLimit;
  row.exhausted = true;
  row.lastError = message ? String(message).slice(0, 300) : 'Daily limit reached';
  saveUsage(usage, opts);
  return usage;
}

/**
 * Remaining capacity for a key today.
 * @param {string} keyId
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 */
function remainingForKey(keyId, opts = {}) {
  const usage = loadUsage(opts);
  const row = usage.keys.find((k) => k.id === keyId);
  if (!row || row.exhausted) return 0;
  return Math.max(0, usage.dailyLimit - row.used);
}

/**
 * Modal payload: includes full API keys from env (authenticated operator only).
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 */
function getUsageForModal(opts = {}) {
  const env = opts.env || process.env;
  const { keys: envKeys, dailyLimit, timezone } = loadGeocodioKeys(env);
  const usage = loadUsage(opts);
  const byId = new Map(usage.keys.map((k) => [k.id, k]));

  const accounts = envKeys.map((k) => {
    const row = byId.get(k.id) || { used: 0, exhausted: false };
    const used = Math.min(dailyLimit, Math.max(0, Number(row.used) || 0));
    const remaining = row.exhausted ? 0 : Math.max(0, dailyLimit - used);
    return {
      id: k.id,
      email: k.email,
      apiKey: k.key,
      fingerprint: k.fingerprint,
      used,
      remaining,
      dailyLimit,
      exhausted: Boolean(row.exhausted) || remaining === 0,
      status: row.exhausted || remaining === 0 ? 'Exhausted' : 'OK',
      lastError: row.lastError || null
    };
  });

  const totalRemaining = accounts.reduce((s, a) => s + a.remaining, 0);
  const totalUsed = accounts.reduce((s, a) => s + a.used, 0);

  return {
    ok: true,
    timezone,
    day: usage.day,
    dailyLimit,
    totalRemaining,
    totalUsed,
    keyCount: accounts.length,
    accounts,
    note:
      'Counts lookups made through Phuglee/Distress OS. External use is detected when Geocodio blocks the key.'
  };
}

/**
 * Pick next key with remaining capacity, in order.
 * @param {{ root?: string, env?: NodeJS.ProcessEnv, now?: Date }} [opts]
 * @returns {{ id: string, key: string, email: string, remaining: number } | null}
 */
function pickNextKey(opts = {}) {
  const env = opts.env || process.env;
  const { keys } = loadGeocodioKeys(env);
  for (const k of keys) {
    const rem = remainingForKey(k.id, opts);
    if (rem > 0) {
      return { id: k.id, key: k.key, email: k.email, remaining: rem };
    }
  }
  return null;
}

module.exports = {
  calendarDayInTz,
  loadUsage,
  saveUsage,
  recordLookups,
  markExhausted,
  remainingForKey,
  getUsageForModal,
  pickNextKey,
  usagePath
};
