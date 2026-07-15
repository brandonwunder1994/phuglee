'use strict';
/**
 * Resolve the shared PDA service token for shell → analyzer proxying.
 * MUST match modules/property-analyzer auth (same value requireAuth accepts).
 *
 * Order:
 * 1. process.env.PDA_AUTH_TOKEN
 * 2. modules/property-analyzer/.env PDA_AUTH_TOKEN (via analyzer-auth)
 * 3. token file under PDA_DATA_ROOT or analyzer logs/
 */
const fs = require('fs');
const path = require('path');

let cached = null;

function tokenFilePath() {
  if (process.env.PDA_DATA_ROOT) {
    return path.join(path.resolve(process.env.PDA_DATA_ROOT), 'logs', 'pda-auth.token');
  }
  return path.join(
    __dirname,
    '..',
    'modules',
    'property-analyzer',
    'logs',
    'pda-auth.token'
  );
}

function getPdaAuthToken() {
  if (cached) return cached;

  // Same resolver the analyzer child / import tooling use — prevents
  // shell injecting the random token-file while analyzer loaded .env=0825
  // (that 401'd every /analyzer/api/* POST and froze live scan buckets).
  try {
    const { readAnalyzerAuthToken } = require('./analyzer-auth');
    const fromAnalyzer = String(readAnalyzerAuthToken() || '').trim();
    if (fromAnalyzer) {
      cached = fromAnalyzer;
      return cached;
    }
  } catch (_) {}

  const fromEnv = String(process.env.PDA_AUTH_TOKEN || '').trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  try {
    const file = tokenFilePath();
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) {
        cached = existing;
        return cached;
      }
    }
  } catch (_) {}

  return '';
}

function clearPdaAuthTokenCache() {
  cached = null;
}

module.exports = { getPdaAuthToken, clearPdaAuthTokenCache, tokenFilePath };
