#!/usr/bin/env node
'use strict';
/**
 * Browser proof: open each Review Leads bucket on prod and assert queue sizes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const BASE = String(process.env.SHELL_BASE || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';
const USER = process.env.PHUGLEE_USER || 'admin';

const FILTERS = ['distressed', 'well_maintained', 'vacant', 'blurred'];
const MIN_QUEUE = { distressed: 100, well_maintained: 100, vacant: 20, blurred: 20 };

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
  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });

  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS, plan: 'max' }
  });
  if (!loginRes.ok()) throw new Error(`login ${loginRes.status()}`);

  await page.goto(`${BASE}/analyzer/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const k of keys) {
        if (/reviewProgress|review_progress/i.test(k || '')) localStorage.removeItem(k);
      }
    } catch (_) {}
  });
  await page.waitForTimeout(8000);

  // Wait until session summary / results start appearing, then force full hydrate
  const hydrated = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const n = (R.state?.results || []).length;
      const target = Math.max(
        Number(R.sessionLoadState?.total) || 0,
        Number(R.sessionLoadState?.serverCanonical) || 0,
        Number(R.state?._tierCountsFromServer?.all) || 0,
        Number(R.state?.processed) || 0
      );
      if (typeof R.ensureSessionResultsLoaded === 'function') {
        await R.ensureSessionResultsLoaded();
      }
      if (target > 0 && (R.state?.results || []).length >= Math.floor(target * 0.95)) {
        return {
          ok: true,
          results: (R.state?.results || []).length,
          target,
          complete: !!R.sessionLoadState?.complete
        };
      }
      if (n > 0 && !target) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return {
      ok: false,
      results: (R.state?.results || []).length,
      target: Number(R.sessionLoadState?.total) || 0,
      complete: !!R.sessionLoadState?.complete
    };
  });

  if (!hydrated.ok) {
    await browser.close();
    console.log(JSON.stringify({ base: BASE, pass: false, hydrated, dialogs }, null, 2));
    process.exit(2);
  }

  if (typeof (await page.evaluate(() => typeof window.PDA?.env?.clearAllReviewProgressStashes)) === 'function'
      || true) {
    await page.evaluate(() => {
      const R = window.PDA?.env || {};
      if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    });
  }

  const buckets = {};
  for (const filter of FILTERS) {
    const beforeDialogs = dialogs.length;
    const result = await page.evaluate(async (f) => {
      const R = window.PDA?.env || {};
      if (R.state?.reviewMode && typeof R.closeReviewMode === 'function') {
        try { R.closeReviewMode(); } catch (_) {}
      }
      if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
      if (typeof R.invalidateReviewSnapshotCache === 'function') R.invalidateReviewSnapshotCache();
      await R.openReviewMode(f, { forceRebuild: true, restart: true });
      return {
        reviewMode: !!R.state?.reviewMode,
        filter: R.state?.reviewFilter,
        queueLen: (R.state?.reviewQueue || []).length,
        results: (R.state?.results || []).length
      };
    }, filter);
    const newDialogs = dialogs.slice(beforeDialogs);
    const min = MIN_QUEUE[filter] || 1;
    buckets[filter] = {
      ...result,
      dialogs: newDialogs,
      minRequired: min,
      ok: !!result.reviewMode
        && result.filter === filter
        && result.queueLen >= min
        && result.results >= 10000
        && newDialogs.length === 0
    };
  }

  await browser.close();
  const pass = FILTERS.every((f) => buckets[f]?.ok);
  console.log(JSON.stringify({ base: BASE, pass, hydrated, buckets }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
