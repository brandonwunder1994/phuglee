/**
 * Push CSV enrichment (lat/lng + property fields) onto production Vault catalog.
 * Fill-blanks only — does not create new leads.
 *
 * Usage:
 *   node scripts/push-vault-enrichment-to-prod.js "C:/path/to/leads.csv"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { loadEnrichmentsFromFiles } = require('../lib/leads-platform/csv-enrich');

const ROOT = path.join(__dirname, '..');
const PROD = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const CHUNK = Math.max(25, Number(process.env.ENRICH_CHUNK || 200));
const DEFAULT_CSV = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'Untitled spreadsheet - 10k plus leads.csv'
);

function loadDotEnvPassword() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = text.match(/^PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD\s*=\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch (_) {
    return '';
  }
}

function fetchUrl(url, { method = 'GET', headers = {}, body = null, timeoutMs = 300000 } = {}) {
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

function slimEnrichment(e) {
  return {
    leadId: e.leadId,
    matchKey: e.matchKey,
    address: e.address,
    city: e.city,
    state: e.state,
    zip: e.zip,
    lat: e.lat,
    lng: e.lng,
    ownerName: e.ownerName,
    phones: e.phones,
    email: e.email,
    mailingAddress: e.mailingAddress,
    entityType: e.entityType,
    propertyType: e.propertyType,
    estARV: e.estARV,
    assessedValue: e.assessedValue,
    lastSale: e.lastSale,
    signalTags: e.signalTags,
    propertyDetails: e.propertyDetails,
    financialDetails: e.financialDetails
  };
}

async function main() {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const pass =
    process.env.PHUGLEE_PASS
    || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD
    || loadDotEnvPassword();
  if (!pass) throw new Error('Missing admin password (PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD)');

  console.log(`[vault-enrich-prod] loading ${csvPath}`);
  const { enrichments, stats } = loadEnrichmentsFromFiles([csvPath]);
  console.log(`[vault-enrich-prod] rows=${stats.rows} enrichments=${enrichments.length}`);

  console.log(`[vault-enrich-prod] login ${PROD}`);
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

  let updated = 0;
  let unchanged = 0;
  let matched = 0;
  let missing = 0;
  let errors = 0;

  for (let i = 0; i < enrichments.length; i += CHUNK) {
    const chunk = enrichments.slice(i, i + CHUNK).map(slimEnrichment);
    const res = await fetchUrl(`${PROD}/api/leads/admin/enrich`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enrichments: chunk }),
      timeoutMs: 300000
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`enrich chunk ${i}: ${res.status} ${res.text.slice(0, 400)}`);
    }
    const json = JSON.parse(res.text);
    updated += json.updated || 0;
    unchanged += json.unchanged || 0;
    matched += json.matched || 0;
    missing += json.missing || 0;
    errors += json.errors || 0;
    console.log(
      `[vault-enrich-prod] ${Math.min(i + CHUNK, enrichments.length)}/${enrichments.length}`
      + ` updated=${updated} missing=${missing} errors=${errors}`
    );
  }

  console.log(JSON.stringify({
    ok: true,
    prod: PROD,
    enrichments: enrichments.length,
    matched,
    missing,
    updated,
    unchanged,
    errors
  }, null, 2));
}

main().catch((err) => {
  console.error('[vault-enrich-prod] FAIL', err.message || err);
  process.exit(1);
});
