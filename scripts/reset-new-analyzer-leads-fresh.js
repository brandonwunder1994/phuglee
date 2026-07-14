#!/usr/bin/env node
'use strict';
/**
 * Hard-reset New Analyzer Leads on Railway (or --local):
 *  1) Remove every matching scanned result + queue row
 *  2) Scrub scan_results JSONL so they cannot revive
 *  3) Optionally re-queue Desktop CSV (--reimport)
 *
 * Usage (purge only — you upload the sheet yourself):
 *   node scripts/reset-new-analyzer-leads-fresh.js --purge-only
 *   node scripts/reset-new-analyzer-leads-fresh.js --purge-only --local   (same as default)
 *   node scripts/reset-new-analyzer-leads-fresh.js --purge-only --prod    (Railway — explicit)
 *
 * Full reset + requeue:
 *   node scripts/reset-new-analyzer-leads-fresh.js --reimport --local
 *   node scripts/reset-new-analyzer-leads-fresh.js --reimport --prod
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { normalizeGeoKey } = require('../modules/property-analyzer/lib/reset-new-analyzer-leads');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(process.env.USERPROFILE || '', 'Desktop', 'New Analyzer Leads.csv');
const { resolveScriptTarget } = require('./script-target');
const { base: BASE, isProd, label: TARGET_LABEL } = resolveScriptTarget(process.argv);
const LOCAL = !isProd;
const REIMPORT = process.argv.includes('--reimport');
const PURGE_ONLY = process.argv.includes('--purge-only') || !REIMPORT;

if (isProd) {
  console.warn(`[reset-nal] Targeting PRODUCTION (${BASE}). Pass --local to use 127.0.0.1.`);
} else {
  console.log(`[reset-nal] Targeting ${TARGET_LABEL} (${BASE}). Pass --prod for Railway.`);
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
        res.on('end', () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === ',' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function nonempty(v) {
  const s = String(v ?? '').trim();
  if (!s || s.toUpperCase() === 'N/A') return '';
  return s;
}

function loadCsvFresh(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);
  const ai = idx('PropertyAddress');
  const ci = idx('PropertyCity');
  const si = idx('PropertyState');
  const zi = idx('PropertyPostalCode');
  const fi = idx('FirstName');
  const li = idx('LastName');
  const p1 = idx('Contact1Phone_1');
  const p2 = idx('Contact1Phone_2');
  const e1 = idx('Contact1Email_1');
  const e2 = idx('Contact1Email_2');

  const importedAt = Date.now();
  const geoKeys = [];
  const freshRecords = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const street = nonempty(cols[ai]);
    const city = nonempty(cols[ci]);
    const state = nonempty(cols[si]);
    const postal = nonempty(cols[zi]);
    if (!street) continue;
    const gk = normalizeGeoKey(street, city, state);
    if (!gk || seen.has(gk)) continue;
    seen.add(gk);
    geoKeys.push(gk);

    const phone = nonempty(cols[p1]) || nonempty(cols[p2]);
    const email = nonempty(cols[e1]) || nonempty(cols[e2]);
    const address = [street, city, state, postal].filter(Boolean).join(', ');
    freshRecords.push({
      firstName: nonempty(cols[fi]),
      lastName: nonempty(cols[li]),
      phone,
      email,
      street,
      city,
      state,
      postal,
      address,
      importSource: 'new_analyzer_leads_2026-07-11',
      sourceFile: 'New Analyzer Leads.csv',
      importBatchId: `batch_new_analyzer_leads_${importedAt}`,
      importedAt,
      leadType: 'code_violation'
    });
  }

  return {
    geoKeys,
    freshRecords,
    importBatches: [
      {
        id: `batch_new_analyzer_leads_${importedAt}`,
        sourceFile: 'New Analyzer Leads.csv',
        importedAt,
        leadCount: freshRecords.length,
        city: '',
        state: ''
      }
    ],
    importedAt
  };
}

(async () => {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found: ${CSV_PATH}`);
  const packed = loadCsvFresh(CSV_PATH);
  console.log(`[reset] target ${BASE}`);
  console.log(`[reset] CSV unique addresses: ${packed.freshRecords.length}`);

  const html = await fetchUrl(`${BASE}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No PDA auth token');
  const headers = {
    'X-PDA-Token': m[1],
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const before = JSON.parse((await fetchUrl(`${BASE}/analyzer/api/session-summary?lite=1`, { headers })).text);
  console.log('[reset] before', {
    results: before.results,
    records: before.records,
    pendingUnscanned: before.pendingUnscanned
  });

  // Chunk body if needed — Railway may reject huge payloads. ~5.6k lean rows is usually fine.
  const body = {
    confirmReset: true,
    geoKeys: packed.geoKeys,
    fileName: ''
  };
  if (!PURGE_ONLY) {
    body.freshRecords = packed.freshRecords;
    body.importBatches = packed.importBatches;
    body.fileName = 'New Analyzer Leads.csv';
  }
  console.log(`[reset] mode=${PURGE_ONLY ? 'purge-only (you reimport)' : 'purge+reimport'}`);
  const payload = JSON.stringify(body);
  console.log(`[reset] POST body ${(payload.length / 1024 / 1024).toFixed(2)} MB`);

  const res = await fetchUrl(`${BASE}/analyzer/api/reset-new-analyzer-leads`, {
    method: 'POST',
    headers,
    body: payload,
    timeoutMs: 600000
  });
  console.log('[reset] status', res.status);
  console.log(res.text.slice(0, 2500));
  if (res.status < 200 || res.status >= 300) process.exit(1);

  const after = JSON.parse((await fetchUrl(`${BASE}/analyzer/api/session-summary?lite=1`, { headers })).text);
  console.log('[reset] after', {
    results: after.results,
    records: after.records,
    pendingUnscanned: after.pendingUnscanned,
    fileName: after.fileName,
    tierCounts: after.tierCounts
  });

  const parsed = JSON.parse(res.text);
  console.log('[reset] removedResults', parsed.removedResults, 'keptResults', parsed.resultsAfter);
  if (PURGE_ONLY) {
    console.log('[reset] DONE — hard refresh Analyze, then upload New Analyzer Leads.csv and Start Scan.');
  } else {
    console.log('[reset] DONE — hard refresh Analyze, then Start Scan.');
  }
})().catch((err) => {
  console.error('[reset] FATAL', err.message || err);
  process.exit(1);
});
