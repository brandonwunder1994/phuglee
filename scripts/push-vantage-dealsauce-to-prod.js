#!/usr/bin/env node
/**
 * Push local Vantage→DealSauce scrub queue to production Analyzer.
 * APPENDS via bridge-import-records — does not wipe existing results.
 *
 * Usage: node scripts/push-vantage-dealsauce-to-prod.js
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
const CHUNK = Number(process.env.IMPORT_CHUNK || 100);
const IMPORT_SOURCE = 'vantage_dealsauce_scrub';

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

function leanRecord(r) {
  const address =
    r.address ||
    [r.street, r.city, r.state, r.postal || r.zip].filter(Boolean).join(', ');
  // Drop fat profile blobs for faster prod import; scan still works on address fields.
  const { profile, ...rest } = r;
  return {
    ...rest,
    address,
    importSource: IMPORT_SOURCE,
    forceRescan: true,
    leadType: rest.leadType || 'code_violation'
  };
}

async function main() {
  // Prefer session from main repo checkout if worktree has no users/
  let sessionPath = SESSION_PATH;
  const alt = path.join(
    ROOT,
    '..',
    'distress-os',
    'modules',
    'property-analyzer',
    'users',
    'admin',
    'distressAnalyzerSession_LATEST.json'
  );
  if (!fs.existsSync(sessionPath) && fs.existsSync(alt)) sessionPath = alt;
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Missing local session: ${sessionPath}`);
  }

  console.log('[prod-push] reading', sessionPath);
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const allNew = (session.records || []).filter((r) => r.importSource === IMPORT_SOURCE);
  console.log(`[prod-push] vantage dealsauce leads local: ${allNew.length}`);
  if (!allNew.length) {
    console.log('[prod-push] nothing to push');
    return;
  }

  const token = await extractToken();
  const headers = {
    'X-PDA-Token': token,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'max',
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  const before = await fetchUrl(`${PROD}/analyzer/api/session-summary?lite=1`, { headers });
  console.log('[prod-push] prod summary', before.status, before.text.slice(0, 240));

  let totalAdded = 0;
  let totalSkipped = 0;
  const importedAt = allNew[0].importedAt || Date.now();

  for (let i = 0; i < allNew.length; i += CHUNK) {
    const chunk = allNew.slice(i, i + CHUNK).map(leanRecord);
    const body = JSON.stringify({
      records: chunk,
      sourceFile: 'vantage-dealsauce-analyzer-import.xlsx',
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
      parsed = { raw: res.text.slice(0, 400) };
    }
    if (res.status < 200 || res.status >= 300 || !parsed.ok) {
      console.error(`[prod-push] chunk FAILED`, res.status, parsed);
      throw new Error(`Import chunk failed at offset ${i}: ${res.status}`);
    }
    totalAdded += Number(parsed.added) || 0;
    totalSkipped += Number(parsed.skipped) || 0;
    console.log(
      `[prod-push] chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(allNew.length / CHUNK)} ` +
        `added=${parsed.added} skipped=${parsed.skipped} totalRecords=${parsed.totalRecords}`
    );
  }

  const after = await fetchUrl(`${PROD}/analyzer/api/session-summary?lite=1`, { headers });
  console.log(
    JSON.stringify(
      {
        ok: true,
        pushed: allNew.length,
        totalAdded,
        totalSkipped,
        afterSummary: after.text.slice(0, 400)
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
