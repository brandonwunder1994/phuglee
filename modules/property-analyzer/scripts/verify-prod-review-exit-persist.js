#!/usr/bin/env node
'use strict';
/**
 * Browser proof: Keep → Exit Review → reopen must NOT show that lead again.
 * Exit must persist manuallyReviewed stamps to the server (works mid-hydrate).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const BASE = String(process.env.SHELL_BASE || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';
const USER = process.env.PHUGLEE_USER || 'admin';

async function main() {
  if (!PASS) throw new Error('Missing password');
  const playwright = require('playwright-core');
  let browser;
  for (const c of ['msedge', 'chrome', 'chromium']) {
    try {
      browser = await playwright.chromium.launch({
        channel: c === 'chromium' ? undefined : c,
        headless: true
      });
      break;
    } catch (_) {}
  }
  if (!browser) throw new Error('No browser');

  const page = await browser.newPage();
  page.on('dialog', async (d) => { await d.accept(); });

  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS, plan: 'max' }
  });
  if (!loginRes.ok()) throw new Error(`login ${loginRes.status()}`);
  const cookie = (loginRes.headers()['set-cookie'] || '').split(';')[0]
    || (loginRes.headersArray?.().find((h) => h.name.toLowerCase() === 'set-cookie')?.value || '').split(';')[0];

  await page.goto(`${BASE}/analyzer/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const k of keys) {
        if (/review|session|pda|distress|analyzer/i.test(k || '')) localStorage.removeItem(k);
      }
    } catch (_) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);

  const report = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    await R.openReviewMode('distressed', { forceRebuild: true, restart: true });
    const queue = R.state?.reviewQueue || [];
    if (!R.state?.reviewMode || queue.length < 3) {
      return { ok: false, reason: 'queue_too_small', queueLen: queue.length };
    }

    const keptKey = queue[R.state.reviewIndex];
    const beforePending = queue.length;
    R.reviewKeep();
    const saveResult = await R.closeReviewMode();

    // Re-open from server queue (simulates coming back later)
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    await R.openReviewMode('distressed', { forceRebuild: true, restart: true, localOnly: false });
    const afterQueue = R.state?.reviewQueue || [];
    const stillInQueue = afterQueue.includes(keptKey);
    const currentKey = afterQueue[R.state.reviewIndex];

    return {
      ok: !stillInQueue && currentKey !== keptKey && saveResult?.ok !== false,
      keptKey,
      currentKey,
      stillInQueue,
      beforePending,
      afterPending: afterQueue.length,
      saveOk: saveResult?.ok !== false,
      jsPushesMidHydrate: !/isSessionReadyForServerSave\(\)/.test(String(R.pushReviewMetadataToServer || ''))
        || String(R.pushReviewMetadataToServer || '').includes('Partial review sync is always safe')
    };
  });

  // Server-side confirmation: kept key should be stamped on disk session
  let serverStamp = null;
  if (report.keptKey && cookie) {
    try {
      const rq = await (await fetch(
        `${BASE}/analyzer/api/session-review-queue?filter=distressed&limit=50`,
        { headers: { Cookie: cookie, Accept: 'application/json' }, cache: 'no-store' }
      )).json();
      serverStamp = {
        pendingIncludesKept: (rq.pendingKeys || []).includes(report.keptKey),
        pending: rq.pending
      };
      report.ok = report.ok && !serverStamp.pendingIncludesKept;
    } catch (e) {
      serverStamp = { error: String(e.message || e) };
    }
  }

  await browser.close();

  const pass = !!report.ok;
  console.log(JSON.stringify({ base: BASE, pass, report, serverStamp }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
