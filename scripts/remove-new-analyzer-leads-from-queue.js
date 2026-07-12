/**
 * Remove New Analyzer Leads from the Analyzer scan queue (records only).
 * Does NOT touch already-scanned results.
 *
 * Usage: node scripts/remove-new-analyzer-leads-from-queue.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const LOCAL_SESSION = path.join(
  ROOT,
  'modules',
  'property-analyzer',
  'users',
  'admin',
  'distressAnalyzerSession_LATEST.json'
);
const PROD = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';
const IMPORT_SOURCE = 'new_analyzer_leads_2026-07-11';
const SOURCE_FILE = 'New Analyzer Leads.csv';

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

function stripNewLeads(session) {
  const beforeRecords = (session.records || []).length;
  const beforeResults = (session.results || []).length;
  const beforeBatches = (session.importBatches || []).length;

  const keptRecords = (session.records || []).filter((r) => {
    if (r?.importSource === IMPORT_SOURCE) return false;
    const src = String(r?.sourceFile || '').toLowerCase();
    if (src.includes('new analyzer leads')) return false;
    return true;
  });

  const keptBatches = (session.importBatches || []).filter((b) => {
    const src = String(b?.sourceFile || '').toLowerCase();
    const id = String(b?.id || '').toLowerCase();
    if (src.includes('new analyzer leads')) return false;
    if (id.includes('new_analyzer_leads')) return false;
    return true;
  });

  const next = {
    ...session,
    records: keptRecords,
    results: Array.isArray(session.results) ? session.results : [],
    importBatches: keptBatches,
    savedAt: Date.now()
  };

  // Clear fileName if it only referred to the removed import
  if (String(next.fileName || '').toLowerCase().includes('new analyzer leads')) {
    next.fileName = keptRecords.length ? next.fileName : '';
    // Prefer empty so Ready-to-scan looks clean for a fresh manual upload
    next.fileName = '';
  }

  return {
    session: next,
    removedRecords: beforeRecords - keptRecords.length,
    keptRecords: keptRecords.length,
    results: beforeResults,
    removedBatches: beforeBatches - keptBatches.length
  };
}

async function main() {
  const token = await extractToken();
  const headers = {
    'X-PDA-Token': token,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json'
  };

  console.log('[remove] fetching production admin session…');
  const getRes = await fetchUrl(`${PROD}/analyzer/api/session-backup`, { headers, timeoutMs: 300000 });
  if (getRes.status !== 200) {
    throw new Error(`GET session-backup failed: ${getRes.status} ${getRes.text.slice(0, 200)}`);
  }
  const payload = JSON.parse(getRes.text);
  const session = payload.session || payload;
  if (!session || typeof session !== 'object') throw new Error('No session object from prod');

  const before = {
    records: (session.records || []).length,
    results: (session.results || []).length,
    newLeads: (session.records || []).filter((r) => r.importSource === IMPORT_SOURCE).length
  };
  console.log('[remove] before', before);

  const { session: cleaned, removedRecords, keptRecords, results, removedBatches } =
    stripNewLeads(session);

  if (!removedRecords) {
    console.log('[remove] nothing to remove on production (no matching records)');
  } else {
    console.log(
      `[remove] stripping ${removedRecords} records; keeping ${keptRecords} records + ${results} results; -${removedBatches} batches`
    );
    const body = Buffer.from(JSON.stringify(cleaned));
    const postRes = await fetchUrl(
      `${PROD}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual-remove-new-analyzer-leads-queue`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body,
        timeoutMs: 300000
      }
    );
    console.log('[remove] POST prod', postRes.status, postRes.text.slice(0, 240));
    if (postRes.status < 200 || postRes.status >= 300) {
      throw new Error(`POST session-backup failed: ${postRes.status}`);
    }
  }

  // Verify
  const verify = await fetchUrl(`${PROD}/analyzer/api/session-backup`, { headers, timeoutMs: 300000 });
  if (verify.status === 200) {
    const p = JSON.parse(verify.text);
    const s = p.session || p;
    const left = (s.records || []).filter((r) => r.importSource === IMPORT_SOURCE).length;
    console.log(
      JSON.stringify(
        {
          prod: {
            records: (s.records || []).length,
            results: (s.results || []).length,
            newLeadsLeft: left,
            fileName: s.fileName || ''
          }
        },
        null,
        2
      )
    );
  }

  // Local admin session (same treatment)
  if (fs.existsSync(LOCAL_SESSION)) {
    const bak = `${LOCAL_SESSION}.bak-remove-new-leads-${Date.now()}`;
    fs.copyFileSync(LOCAL_SESSION, bak);
    const local = JSON.parse(fs.readFileSync(LOCAL_SESSION, 'utf8'));
    const out = stripNewLeads(local);
    fs.writeFileSync(LOCAL_SESSION, JSON.stringify(out.session));
    console.log('[remove] local admin updated', {
      removed: out.removedRecords,
      keptRecords: out.keptRecords,
      results: out.results,
      backup: bak
    });
  }

  console.log('[remove] done — scan queue cleared of New Analyzer Leads; results preserved.');
  console.log('[remove] You can now upload the file yourself in Ready to scan.');
}

main().catch((err) => {
  console.error('[remove] FATAL', err);
  process.exit(1);
});
