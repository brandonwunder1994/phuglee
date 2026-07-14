'use strict';
/**
 * Resolve the shared PDA service token for shell → analyzer proxying.
 * Prefer PDA_AUTH_TOKEN env; else read the token file under PDA_DATA_ROOT.
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
