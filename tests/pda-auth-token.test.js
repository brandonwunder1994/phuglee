'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('getPdaAuthToken matches analyzer .env (not a stale token file)', () => {
  const { getPdaAuthToken, clearPdaAuthTokenCache } = require('../lib/pda-auth-token');
  clearPdaAuthTokenCache();
  const tok = getPdaAuthToken();
  assert.ok(tok, 'expected a PDA token');

  const envPath = path.join(__dirname, '..', 'modules', 'property-analyzer', '.env');
  if (!fs.existsSync(envPath)) return;
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^\s*PDA_AUTH_TOKEN\s*=\s*(.+)\s*$/m);
  if (!m) return;
  const fromDotEnv = m[1].trim().replace(/^["']|["']$/g, '');
  assert.equal(
    tok,
    fromDotEnv,
    'shell proxy token must match analyzer .env — otherwise /analyzer scan POSTs 401'
  );
});
