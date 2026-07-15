#!/usr/bin/env node
'use strict';
/**
 * Hard gate: prove prod Analyze review path is actually serving the fix.
 * Exit 0 only if ALL checks pass. Never treat deploy SUCCESS alone as proof.
 *
 * CRITICAL: shell serves analyzer assets under /analyzer/js/… not /js/…
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const BASE = String(process.env.SHELL_BASE || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';

async function main() {
  if (!PASS) throw new Error('Missing PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD');
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: String(detail || '') });

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASS, plan: 'max' })
  });
  const cookie = (login.headers.getSetCookie?.().find((c) => c.startsWith('phuglee_session=')) || '')
    .split(';')[0];
  ok('login', login.ok && cookie, `status=${login.status}`);
  const hdr = { Cookie: cookie, Accept: 'application/json' };

  const health = await fetch(`${BASE}/api/health`);
  ok('health', health.status === 200, `status=${health.status}`);

  const htmlRes = await fetch(`${BASE}/analyzer/`, { headers: { Cookie: cookie }, cache: 'no-store' });
  const html = await htmlRes.text();
  ok('analyzer_html', htmlRes.ok, `status=${htmlRes.status}`);

  const scriptMap = {};
  for (const m of html.matchAll(/src=["']([^"']*\/(?:imagery|session|state)\.js\?v=[^"']+)["']/g)) {
    const src = m[1];
    if (src.includes('imagery.js')) scriptMap.imagery = src;
    if (src.includes('session.js')) scriptMap.session = src;
    if (src.includes('state.js')) scriptMap.state = src;
  }
  ok('html_imagery_tag', !!scriptMap.imagery, scriptMap.imagery || 'missing');
  ok('html_session_tag', !!scriptMap.session, scriptMap.session || 'missing');
  ok('html_state_tag', !!scriptMap.state, scriptMap.state || 'missing');
  ok('html_cachebust_review_fast4', /review-fast4/.test(JSON.stringify(scriptMap)), JSON.stringify(scriptMap));

  async function assertServed(label, src, needles) {
    if (!src) {
      ok(`served_${label}`, false, 'no src');
      return;
    }
    const url = src.startsWith('http') ? src : `${BASE}${src}`;
    const res = await fetch(url, { headers: { Cookie: cookie }, cache: 'no-store' });
    const body = await res.text();
    const missing = needles.filter((n) => !body.includes(n));
    ok(`served_${label}`, res.ok && missing.length === 0, missing.length ? `missing ${missing.join(' | ')}` : `ok ${body.length}b @ ${src}`);
  }

  await assertServed('imagery.js', scriptMap.imagery, [
    'fetchSessionReviewQueue',
    'mergeReviewQueueResults',
    'deferHeavy: true',
    'flushReviewProgress'
  ]);
  await assertServed('session.js', scriptMap.session, [
    'isReviewQueueStaleVsPending',
    'clearAllReviewProgressStashes',
    'Number shortcuts must work even if focus'
  ]);
  await assertServed('state.js', scriptMap.state, [
    '_sessionResultsLoadPromise',
    'Partial review sync is always safe'
  ]);

  // Fast review-queue API must exist (Distressed may be small after a long review session).
  const rq = await (await fetch(`${BASE}/analyzer/api/session-review-queue?filter=distressed&limit=50`, { headers: hdr, cache: 'no-store' })).json();
  ok('review_queue_api', !!rq.ok && Number(rq.pending) >= 0 && Array.isArray(rq.results), `pending=${rq.pending} keys=${(rq.pendingKeys||[]).length} results=${(rq.results||[]).length}`);
  const rqWm = await (await fetch(`${BASE}/analyzer/api/session-review-queue?filter=well_maintained&limit=50&resultsOnly=1`, { headers: hdr, cache: 'no-store' })).json();
  ok('review_queue_results_only', !!rqWm.ok && Array.isArray(rqWm.results) && (rqWm.pendingKeys || []).length === 0 && Number(rqWm.pending) > 100,
    `pending=${rqWm.pending} keys=${(rqWm.pendingKeys||[]).length} results=${(rqWm.results||[]).length}`);

  const sum = await (await fetch(`${BASE}/analyzer/api/session-summary`, { headers: hdr, cache: 'no-store' })).json();
  ok('pending_unscanned_zero', Number(sum.pendingUnscanned) === 0, `pending=${sum.pendingUnscanned}`);
  ok('results_ge_10k', Number(sum.processed) >= 10000, `processed=${sum.processed}`);

  const meta = await (await fetch(`${BASE}/analyzer/api/session-review-meta`, { headers: hdr, cache: 'no-store' })).json();
  const prog = meta.reviewProgressByFilter || {};
  const badStash = Object.entries(prog).filter(([, v]) => {
    const q = (v?.queue || []).length;
    const i = Number(v?.index) || 0;
    return q <= 5 || q - i <= 5;
  });
  ok('no_tiny_review_stashes', badStash.length === 0, JSON.stringify(
    Object.fromEntries(Object.entries(prog).map(([k, v]) => [k, (v?.queue || []).length]))
  ));

  let offset = 0;
  const pending = { distressed: 0, well_maintained: 0, vacant: 0, blurred: 0 };
  while (true) {
    const j = await (await fetch(`${BASE}/analyzer/api/session-results?offset=${offset}&limit=1000`, { headers: hdr })).json();
    const rows = j.results || [];
    if (!rows.length) break;
    for (const r of rows) {
      const via = String(r.manuallyReviewedVia || '');
      const soft = via === 'review_session' || via === 'review_skip' || via === 'review_missing';
      if (r.reviewResolved || (r.manuallyReviewed && !soft)) continue;
      let t = String(r.leadTier || '').toLowerCase().replace(/-/g, '_');
      if (t === 'hot_lead') t = 'distressed';
      const cat = String(r.category || '').toLowerCase();
      if (cat === 'vacant_lot' || cat === 'vacant' || cat === 'land') t = 'vacant';
      else if (r.blurred || r.isBlurred || cat === 'blurred' || cat === 'unavailable') t = 'blurred';
      if (pending[t] != null) pending[t] += 1;
    }
    offset += rows.length;
    if (rows.length < 1000) break;
  }
  ok('distressed_pending_gt_100', pending.distressed > 100, `distressed=${pending.distressed}`);
  ok('wm_pending_gt_100', pending.well_maintained > 100, `wm=${pending.well_maintained}`);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, pass: failed.length === 0, pendingManual: pending, checks, failed: failed.map((f) => f.name) }, null, 2));
  if (failed.length) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
