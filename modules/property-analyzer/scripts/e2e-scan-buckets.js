#!/usr/bin/env node
/**
 * Live E2E: queue → Street View → Gemini → scan-result → session buckets.
 * Proves drop/scan/bucket path against a running analyzer on :3456.
 *
 * Usage: node modules/property-analyzer/scripts/e2e-scan-buckets.js
 * Env: PDA_BASE (default http://127.0.0.1:3456), PDA_AUTH_TOKEN
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = String(process.env.PDA_BASE || 'http://127.0.0.1:3456').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');

function loadPdaToken() {
  if (process.env.PDA_AUTH_TOKEN) return String(process.env.PDA_AUTH_TOKEN).trim();
  try {
    const envPath = path.join(ROOT, '.env');
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^\s*PDA_AUTH_TOKEN\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  try {
    return fs.readFileSync(path.join(ROOT, 'logs', 'pda-auth.token'), 'utf8').trim();
  } catch (_) {}
  return '';
}

const TOKEN = loadPdaToken();
if (!TOKEN) {
  console.error('FAIL: no PDA_AUTH_TOKEN');
  process.exit(2);
}

const ADDRESSES = [
  '100 Congress Ave, Austin, TX 78701',
  '700 Congress Ave, Austin, TX 78701'
];

function request(method, urlPath, { body, headers } = {}) {
  const u = new URL(urlPath.startsWith('http') ? urlPath : `${BASE}${urlPath}`);
  const lib = u.protocol === 'https:' ? https : http;
  const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const hdrs = {
    Accept: 'application/json',
    'X-PDA-Token': TOKEN,
    Authorization: `Bearer ${TOKEN}`,
    ...(headers || {})
  };
  if (payload) {
    hdrs['Content-Type'] = 'application/json';
    hdrs['Content-Length'] = String(payload.length);
  }
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: hdrs,
        timeout: 120000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode || 0, raw, json });
        });
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

function recordKey(address) {
  return String(address || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function parseAnalysis(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in Gemini text');
  const parsed = JSON.parse(m[0]);
  const score = Math.round(Number(parsed.score));
  if (!(score >= 1 && score <= 10)) throw new Error(`bad score: ${parsed.score}`);
  const category = String(parsed.category || 'property').toLowerCase();
  let leadTier = String(parsed.leadTier || '').toLowerCase().replace(/-/g, '_');
  if (!leadTier) {
    if (category === 'vacant_lot' || category === 'vacant') leadTier = 'vacant';
    else if (score >= 5) leadTier = 'distressed';
    else leadTier = 'well_maintained';
  }
  if (leadTier === 'hot_lead') leadTier = 'distressed';
  return {
    score,
    category,
    leadTier,
    structureOnLot: parsed.structureOnLot !== false,
    indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
    confidence: parsed.confidence != null ? Number(parsed.confidence) : 70,
    reason: String(parsed.reason || 'e2e scan').slice(0, 400)
  };
}

function bucketOf(result) {
  const cat = String(result.category || '').toLowerCase();
  if (cat === 'vacant_lot' || cat === 'vacant' || result.leadTier === 'vacant') return 'vacant';
  if (cat === 'unavailable' || cat === 'blurred') return 'review';
  const t = String(result.leadTier || '').toLowerCase();
  if (t === 'distressed' || t === 'hot_lead') return 'distressed';
  if (t === 'well_maintained') return 'well_maintained';
  return 'review';
}

async function main() {
  const started = Date.now();
  console.log(`E2E scan→buckets against ${BASE}`);

  const status = await request('GET', '/api/status');
  if (status.status !== 200 || !status.json?.ok) {
    throw new Error(`status not ok: ${status.status} ${status.raw.slice(0, 200)}`);
  }
  console.log('✓ /api/status');

  const cfg = await request('GET', '/api/config');
  if (!cfg.json?.hasMapsKey || !cfg.json?.hasGeminiKey) {
    throw new Error('Maps/Gemini keys missing on server');
  }
  console.log('✓ keys configured');

  // 1) Import queue (forceRescan) — PDA-only auth must succeed after rejectAnonymousWrite fix
  const queueBody = {
    replaceQueue: true,
    records: ADDRESSES.map((address) => ({
      address,
      forceRescan: true,
      street: address.split(',')[0],
      city: 'Austin',
      state: 'TX',
      postal: '78701'
    })),
    fileName: 'e2e-scan-buckets.csv',
    savedAt: Date.now()
  };
  const q = await request('POST', '/api/session-scan-queue?reason=e2e-scan-buckets', { body: queueBody });
  if (q.status !== 200 || q.json?.ok === false) {
    throw new Error(`scan-queue failed: ${q.status} ${q.raw.slice(0, 300)}`);
  }
  if (Number(q.json.records) !== ADDRESSES.length) {
    throw new Error(`queue kept ${q.json.records}, expected ${ADDRESSES.length}`);
  }
  console.log(`✓ queue saved (${q.json.records} forceRescan)`);

  const buckets = { distressed: 0, well_maintained: 0, vacant: 0, review: 0 };
  const savedKeys = [];

  for (const address of ADDRESSES) {
    const t0 = Date.now();
    const sv = await request('GET', `/api/sv-base64?address=${encodeURIComponent(address)}`);
    if (sv.status !== 200 || !sv.json?.ok || !sv.json?.base64) {
      throw new Error(`Street View failed for ${address}: ${sv.raw.slice(0, 240)}`);
    }
    console.log(`✓ SV ${address} (${Date.now() - t0}ms, ${sv.json.base64.length} b64)`);

    const prompt = [
      'You are a property distress classifier. Reply with ONLY compact JSON:',
      '{"score":1-10,"category":"property"|"vacant_lot"|"blurred"|"unavailable",',
      '"leadTier":"distressed"|"well_maintained"|"vacant"|"unavailable",',
      '"structureOnLot":true|false,"indicators":[],"confidence":0-100,"reason":"one sentence"}',
      `Address: ${address}`
    ].join('\n');

    const g0 = Date.now();
    const gem = await request('POST', '/api/gemini-vision', {
      body: {
        prompt,
        base64: sv.json.base64,
        mimeType: sv.json.mimeType || 'image/jpeg',
        address,
        scanType: 'street',
        maxOutputTokens: 512
      }
    });
    if (gem.status !== 200 || !gem.json?.ok || !gem.json?.text) {
      throw new Error(`Gemini failed for ${address}: ${gem.raw.slice(0, 300)}`);
    }
    const analysis = parseAnalysis(gem.json.text);
    console.log(`✓ Gemini ${address} → ${analysis.leadTier}/${analysis.category} score=${analysis.score} (${Date.now() - g0}ms)`);

    const result = {
      address,
      ...analysis,
      forceRescan: undefined,
      viewMeta: sv.json.view || null,
      analyzedAt: Date.now(),
      qualityFlags: [],
      aiScore: analysis.category === 'property' ? analysis.score : null,
      aiTierAtScan: analysis.leadTier
    };
    delete result.forceRescan;
    const key = recordKey(address);
    const save = await request('POST', '/api/scan-result', {
      body: { key, result, processed: savedKeys.length + 1, savedAt: Date.now() }
    });
    if (save.status !== 200 || save.json?.ok === false) {
      throw new Error(`scan-result failed for ${address}: ${save.raw.slice(0, 300)}`);
    }
    buckets[bucketOf(result)] += 1;
    savedKeys.push(key);
    console.log(`✓ saved ${key} → bucket ${bucketOf(result)}`);
  }

  const recover = await request('POST', '/api/recover-incremental', { body: {} });
  if (recover.status !== 200) {
    console.warn('warn: recover-incremental', recover.status, recover.raw.slice(0, 160));
  } else {
    console.log('✓ recover-incremental', JSON.stringify(recover.json));
  }

  const summary = await request('GET', '/api/session-summary?lite=1');
  if (summary.status !== 200 || !summary.json?.ok) {
    throw new Error(`summary failed: ${summary.status}`);
  }
  const tc = summary.json.tierCounts || {};
  console.log('✓ session tierCounts', {
    all: tc.all,
    distressed: tc.distressed,
    well_maintained: tc.well_maintained,
    vacant: tc.vacant,
    review: tc.review
  });

  const filled = Object.values(buckets).reduce((a, b) => a + b, 0);
  if (filled !== ADDRESSES.length) {
    throw new Error(`bucket fill mismatch: ${JSON.stringify(buckets)}`);
  }
  if (!(Number(tc.all) > 0)) {
    throw new Error('session tierCounts.all is 0 after scan');
  }

  console.log('');
  console.log('PASS e2e-scan-buckets');
  console.log(`  scanned=${ADDRESSES.length} thisRun=${JSON.stringify(buckets)}`);
  console.log(`  elapsedMs=${Date.now() - started}`);
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
