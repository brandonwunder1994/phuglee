/**
 * Run land parcel REAPI enrich on production (server has REALESTATE_API_KEY).
 * Fill-blanks only. Paginates admin endpoint until all land leads processed.
 *
 * Usage:
 *   node scripts/push-land-reapi-enrich-to-prod.js
 *   node scripts/push-land-reapi-enrich-to-prod.js --dry-run --limit=20
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const PROD = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const CHUNK = Math.max(10, Number(process.env.LAND_REAPI_CHUNK || 40));

function loadDotEnvPassword() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = text.match(/^PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD\s*=\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch (_) {
    return '';
  }
}

function parseArgs(argv) {
  const out = { dryRun: false, force: false, limit: 0 };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryRun') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a.startsWith('--limit=')) out.limit = Math.max(0, Number(a.slice(8)) || 0);
  }
  return out;
}

function fetchUrl(url, { method = 'GET', headers = {}, body = null, timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': payload.length } : {})
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: buf.toString('utf8'),
            setCookie: res.headers['set-cookie']
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function cookieHeader(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
  return list.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pass =
    process.env.PHUGLEE_PASS
    || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD
    || loadDotEnvPassword();
  if (!pass) throw new Error('Missing admin password (PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD)');

  console.log(`[land-reapi-prod] login ${PROD}`);
  const login = await fetchUrl(`${PROD}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: 'admin', password: pass })
  });
  if (login.status < 200 || login.status >= 300) {
    throw new Error(`login failed ${login.status} ${login.text.slice(0, 200)}`);
  }
  const cookie = cookieHeader(login.setCookie);
  if (!cookie) throw new Error('no session cookie from login');

  const headers = {
    Cookie: cookie,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  let offset = 0;
  let totalLand = null;
  let processed = 0;
  let updated = 0;
  const fieldsFilled = {};
  let errors = 0;
  let empty = 0;
  let skippedComplete = 0;

  while (true) {
    if (opts.limit > 0 && processed >= opts.limit) break;
    const limit = opts.limit > 0
      ? Math.min(CHUNK, opts.limit - processed)
      : CHUNK;

    const res = await fetchUrl(`${PROD}/api/leads/admin/enrich-land-reapi`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        offset,
        limit,
        dryRun: opts.dryRun,
        force: opts.force,
        concurrency: 2,
        delayMs: 120
      }),
      timeoutMs: 600000
    });
    if (res.status === 404) {
      throw new Error(
        'enrich-land-reapi endpoint not found on prod — deploy the land REAPI enrich code first'
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`enrich offset ${offset}: ${res.status} ${res.text.slice(0, 500)}`);
    }
    const json = JSON.parse(res.text);
    if (!json.ok) throw new Error(json.error || 'enrich failed');
    totalLand = json.totalLand;
    processed += json.processed || 0;
    updated += json.updated || 0;
    errors += json.summary?.errors || 0;
    empty += json.summary?.empty || 0;
    skippedComplete += json.summary?.skippedComplete || 0;
    for (const [k, v] of Object.entries(json.summary?.fieldsFilled || {})) {
      fieldsFilled[k] = (fieldsFilled[k] || 0) + v;
    }
    console.log(
      `[land-reapi-prod] offset=${offset} processed=${processed}/${totalLand}`
      + ` updated=${updated} errors=${errors} empty=${empty}`
    );
    if (json.sample?.length) {
      const hit = json.sample.find((s) => (s.filled || []).length);
      if (hit) console.log(`[land-reapi-prod] sample fill ${hit.address}: ${hit.filled.join(',')}`);
    }
    if (json.nextOffset == null) break;
    offset = json.nextOffset;
  }

  console.log(JSON.stringify({
    ok: true,
    prod: PROD,
    dryRun: opts.dryRun,
    totalLand,
    processed,
    updated,
    skippedComplete,
    empty,
    errors,
    fieldsFilled
  }, null, 2));
}

main().catch((err) => {
  console.error('[land-reapi-prod] FAIL', err.message || err);
  process.exit(1);
});
