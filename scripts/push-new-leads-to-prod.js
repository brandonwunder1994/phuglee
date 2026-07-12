/**
 * Push locally imported "New Analyzer Leads" records to production Analyzer.
 * Uses bridge-import-records in chunks so we never wipe existing scan results.
 *
 * Usage: node scripts/push-new-leads-to-prod.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SESSION_PATH = path.join(
  ROOT,
  'modules',
  'property-analyzer',
  'users',
  'admin',
  'distressAnalyzerSession_LATEST.json'
);
const PROD = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const CHUNK = Number(process.env.IMPORT_CHUNK || 150);
const IMPORT_SOURCE = 'new_analyzer_leads_2026-07-11';

function fetchUrl(url, { method = 'GET', headers = {}, body = null, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload
            ? { 'Content-Length': payload.length }
            : {})
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
            body: buf,
            text: buf.toString('utf8')
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

async function extractToken() {
  const html = await fetchUrl(`${PROD}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No PDA auth token in production analyzer HTML');
  return m[1];
}

async function main() {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(`Missing local session: ${SESSION_PATH}`);
  }
  console.log('[prod-push] reading local admin session…');
  const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  const allNew = (session.records || []).filter((r) => r.importSource === IMPORT_SOURCE);
  console.log(`[prod-push] new leads on local: ${allNew.length}`);
  if (!allNew.length) {
    console.log('[prod-push] nothing to push');
    return;
  }

  const token = await extractToken();
  console.log(`[prod-push] token ok (len ${token.length})`);
  const headers = {
    'X-PDA-Token': token,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  // Before counts
  const before = await fetchUrl(`${PROD}/analyzer/api/session-backup`, { headers });
  if (before.status !== 200) {
    throw new Error(`GET session-backup failed: ${before.status} ${before.text.slice(0, 200)}`);
  }
  let beforePayload;
  try {
    beforePayload = JSON.parse(before.text);
  } catch (err) {
    throw new Error(`session-backup parse: ${err.message}`);
  }
  const beforeSession = beforePayload.session || beforePayload;
  const beforeRecords = Array.isArray(beforeSession.records)
    ? beforeSession.records.length
    : Number(beforePayload.records) || 0;
  console.log(`[prod-push] prod before records≈${beforeRecords} (raw bytes ${before.body.length})`);

  let totalAdded = 0;
  let totalSkipped = 0;
  const importedAt = allNew[0].importedAt || Date.now();

  for (let i = 0; i < allNew.length; i += CHUNK) {
    const chunk = allNew.slice(i, i + CHUNK);
    // Ensure address field exists (API requires it)
    const records = chunk.map((r) => ({
      ...r,
      address:
        r.address ||
        [r.street, r.city, r.state, r.postal || r.zip].filter(Boolean).join(', ')
    }));
    const body = JSON.stringify({
      records,
      sourceFile: 'New Analyzer Leads.csv',
      uploadType: 'code_violation',
      city: '',
      state: '',
      importedAt
    });
    const res = await fetchUrl(`${PROD}/analyzer/api/bridge-import-records`, {
      method: 'POST',
      headers,
      body,
      timeoutMs: 300000
    });
    let parsed = {};
    try {
      parsed = JSON.parse(res.text);
    } catch (_) {
      parsed = { raw: res.text.slice(0, 300) };
    }
    if (res.status < 200 || res.status >= 300 || !parsed.ok) {
      console.error(`[prod-push] chunk ${i / CHUNK + 1} FAILED`, res.status, parsed);
      throw new Error(`Import chunk failed at offset ${i}: ${res.status}`);
    }
    totalAdded += Number(parsed.added) || 0;
    totalSkipped += Number(parsed.skipped) || 0;
    console.log(
      `[prod-push] chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(allNew.length / CHUNK)} ` +
        `added=${parsed.added} skipped=${parsed.skipped} totalRecords=${parsed.totalRecords}`
    );
  }

  // Verify
  const after = await fetchUrl(`${PROD}/analyzer/api/session-backup`, { headers });
  let afterRecords = '?';
  if (after.status === 200) {
    try {
      const p = JSON.parse(after.text);
      const s = p.session || p;
      afterRecords = Array.isArray(s.records) ? s.records.length : p.records;
      const withSource = Array.isArray(s.records)
        ? s.records.filter((r) => r.importSource === IMPORT_SOURCE).length
        : 'n/a';
      console.log(`[prod-push] verify records=${afterRecords} with importSource=${withSource}`);
    } catch (err) {
      console.warn('[prod-push] verify parse fail', err.message);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        pushed: allNew.length,
        totalAdded,
        totalSkipped,
        beforeRecords,
        afterRecords
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[prod-push] FATAL', err);
  process.exit(1);
});
