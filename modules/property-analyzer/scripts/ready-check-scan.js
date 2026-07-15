#!/usr/bin/env node
/**
 * Hard readiness gate: login → queue → SV → Gemini → scan-result → recover.
 * Exit 0 only if the full durable path works on BASE (prod or local shell).
 *
 *   SHELL_BASE=https://phuglee-production.up.railway.app node .../ready-check-scan.js
 *   SHELL_BASE=http://127.0.0.1:3000 node .../ready-check-scan.js
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch (_) {}

const BASE = String(process.env.SHELL_BASE || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const USER = process.env.PHUGLEE_USER || 'admin';
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';

const ADDRESSES = [
  '100 Congress Ave, Austin, TX 78701',
  '700 Congress Ave, Austin, TX 78701'
];

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
  if (!(score >= 1 && score <= 10)) throw new Error(`bad score ${parsed.score}`);
  let leadTier = String(parsed.leadTier || 'well_maintained').toLowerCase().replace(/-/g, '_');
  if (leadTier === 'hot_lead') leadTier = 'distressed';
  return {
    score,
    category: String(parsed.category || 'property').toLowerCase(),
    leadTier,
    structureOnLot: parsed.structureOnLot !== false,
    indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
    confidence: parsed.confidence != null ? Number(parsed.confidence) : 80,
    reason: String(parsed.reason || 'ready check').slice(0, 400)
  };
}

function bucketOf(r) {
  const cat = String(r.category || '').toLowerCase();
  if (cat === 'vacant_lot' || cat === 'vacant' || r.leadTier === 'vacant') return 'vacant';
  if (cat === 'unavailable' || cat === 'blurred') return 'review';
  if (r.leadTier === 'distressed') return 'distressed';
  if (r.leadTier === 'well_maintained') return 'well_maintained';
  return 'review';
}

async function main() {
  if (!PASS) throw new Error('Missing PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD');
  console.log(`READY-CHECK ${BASE}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS, plan: 'max' })
  });
  const loginJson = await login.json().catch(() => ({}));
  const cookie = (login.headers.getSetCookie?.().find((c) => c.startsWith('phuglee_session=')) || '')
    .split(';')[0];
  if (!login.ok || !loginJson.ok || !cookie) {
    throw new Error(`login failed ${login.status} ${JSON.stringify(loginJson)}`);
  }
  console.log('✓ login');

  const hdr = { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' };

  const status = await fetch(`${BASE}/analyzer/api/status`, { headers: { Cookie: cookie } });
  const st = await status.json();
  if (status.status !== 200 || !st.ok) throw new Error(`status ${status.status}`);
  if (st.hardQuotaActive) {
    await fetch(`${BASE}/analyzer/api/usage/clear-quota`, { method: 'POST', headers: hdr, body: '{}' });
  }
  console.log('✓ status');

  const cfg = await fetch(`${BASE}/analyzer/api/config`, { headers: { Cookie: cookie } });
  const cj = await cfg.json();
  if (!cj.hasMapsKey || !cj.hasGeminiKey) throw new Error('missing Maps/Gemini keys on server');
  console.log('✓ keys');

  const records = ADDRESSES.map((address) => ({
    address,
    forceRescan: true,
    street: address.split(',')[0],
    city: 'Austin',
    state: 'TX',
    postal: '78701'
  }));
  const q = await fetch(`${BASE}/analyzer/api/session-scan-queue?reason=ready-check`, {
    method: 'POST',
    headers: hdr,
    body: JSON.stringify({
      replaceQueue: true,
      records,
      fileName: 'ready-check.csv',
      savedAt: Date.now()
    })
  });
  const qj = await q.json().catch(() => ({}));
  if (q.status !== 200 || qj.ok === false) {
    throw new Error(`scan-queue ${q.status} ${JSON.stringify(qj).slice(0, 240)}`);
  }
  if (Number(qj.records) !== ADDRESSES.length) {
    throw new Error(`queue kept ${qj.records}, expected ${ADDRESSES.length}`);
  }
  console.log(`✓ queue (${qj.records})`);

  const buckets = { distressed: 0, well_maintained: 0, vacant: 0, review: 0 };

  for (const address of ADDRESSES) {
    const sv = await fetch(
      `${BASE}/analyzer/api/sv-base64?address=${encodeURIComponent(address)}`,
      { headers: { Cookie: cookie } }
    );
    const svj = await sv.json();
    if (sv.status !== 200 || !svj.ok || !svj.base64) {
      throw new Error(`Street View failed ${address}: ${JSON.stringify(svj).slice(0, 200)}`);
    }
    console.log(`✓ SV ${address.split(',')[0]} (${svj.base64.length} b64)`);

    const prompt = [
      'You are a property distress classifier. Reply with ONLY compact JSON:',
      '{"score":1-10,"category":"property"|"vacant_lot"|"blurred"|"unavailable",',
      '"leadTier":"distressed"|"well_maintained"|"vacant"|"unavailable",',
      '"structureOnLot":true|false,"indicators":[],"confidence":0-100,"reason":"one sentence"}',
      `Address: ${address}`
    ].join('\n');

    const gem = await fetch(`${BASE}/analyzer/api/gemini-vision`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        prompt,
        base64: svj.base64,
        mimeType: svj.mimeType || 'image/jpeg',
        address,
        scanType: 'street',
        maxOutputTokens: 512
      })
    });
    const gj = await gem.json();
    if (gem.status !== 200 || !gj.ok || !gj.text) {
      const raw = String(gj.rawGoogleError || gj.error || '');
      if (/spending.?cap|monthly spending|ai\.studio\/spend|project spend/i.test(raw) || gj.hardQuota) {
        throw new Error(
          `GEMINI_SPEND_CAP: Google blocked Analyze on this project. ` +
          `Raise the monthly spend cap at https://ai.studio/spend then re-run. Detail: ${raw.slice(0, 220)}`
        );
      }
      throw new Error(`Gemini failed ${address}: ${JSON.stringify(gj).slice(0, 240)}`);
    }
    const analysis = parseAnalysis(gj.text);
    console.log(`✓ Gemini ${address.split(',')[0]} → ${analysis.leadTier}/${analysis.category} score=${analysis.score}`);

    const result = {
      address,
      ...analysis,
      viewMeta: svj.view || null,
      analyzedAt: Date.now(),
      qualityFlags: [],
      aiScore: analysis.category === 'property' ? analysis.score : null,
      aiTierAtScan: analysis.leadTier
    };
    const key = recordKey(address);
    const save = await fetch(`${BASE}/analyzer/api/scan-result`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ key, result, processed: 1, savedAt: Date.now() })
    });
    const sj = await save.json().catch(() => ({}));
    if (save.status !== 200 || sj.ok === false) {
      throw new Error(`scan-result failed ${address}: ${JSON.stringify(sj).slice(0, 200)}`);
    }
    buckets[bucketOf(result)] += 1;
    console.log(`✓ saved → ${bucketOf(result)}`);
  }

  const rec = await fetch(`${BASE}/analyzer/api/recover-incremental`, {
    method: 'POST',
    headers: hdr,
    body: '{}'
  });
  if (rec.status !== 200) throw new Error(`recover-incremental ${rec.status}`);
  console.log('✓ recover-incremental');

  const sum = await fetch(`${BASE}/analyzer/api/session-summary?lite=1`, {
    headers: { Cookie: cookie }
  });
  const summary = await sum.json();
  if (sum.status !== 200 || !summary.ok) throw new Error('summary failed');
  const tc = summary.tierCounts || {};
  if (!(Number(tc.all) > 0)) throw new Error('tierCounts.all is 0');
  console.log('✓ tierCounts', {
    all: tc.all,
    distressed: tc.distressed,
    well_maintained: tc.well_maintained,
    vacant: tc.vacant,
    review: tc.review
  });

  const filled = Object.values(buckets).reduce((a, b) => a + b, 0);
  if (filled !== ADDRESSES.length) throw new Error(`bucket fill ${JSON.stringify(buckets)}`);

  console.log('');
  console.log('READY PASS', BASE);
  console.log('  thisRun=', JSON.stringify(buckets));
}

main().catch((err) => {
  console.error('READY FAIL', err.message || err);
  process.exit(1);
});
