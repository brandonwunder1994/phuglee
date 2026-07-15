#!/usr/bin/env node
'use strict';
/**
 * Browser proof: open Distressed review on prod and assert queue size.
 * Exit 0 only if reviewQueue length is large (not 0–2).
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
  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });

  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS, plan: 'max' }
  });
  if (!loginRes.ok()) throw new Error(`login ${loginRes.status()}`);

  // Clear analyzer local storage so poison stashes cannot survive.
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
  await page.waitForTimeout(8000);

  const before = await page.evaluate(() => {
    const R = window.PDA?.env || {};
    return {
      results: (R.state?.results || []).length,
      loadComplete: !!R.sessionLoadState?.complete,
      loadTotal: R.sessionLoadState?.total || 0,
      progress: Object.fromEntries(
        Object.entries(R.state?.reviewProgressByFilter || {}).map(([k, v]) => [k, (v?.queue || []).length])
      ),
      jsHasDiscard: typeof R.discardStaleReviewProgress === 'function',
      jsHasStale: typeof R.isReviewQueueStaleVsPending === 'function'
    };
  });

  // Ensure full hydrate then open Distressed
  const opened = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    if (typeof R.ensureSessionResultsLoaded === 'function') {
      await R.ensureSessionResultsLoaded();
    }
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    if (typeof R.openReviewMode === 'function') {
      await R.openReviewMode('distressed', { forceRebuild: true, restart: true });
    }
    return {
      reviewMode: !!R.state?.reviewMode,
      filter: R.state?.reviewFilter,
      queueLen: (R.state?.reviewQueue || []).length,
      index: R.state?.reviewIndex,
      results: (R.state?.results || []).length,
      loadComplete: !!R.sessionLoadState?.complete,
      loadTotal: R.sessionLoadState?.total || 0,
      overlayOpen: !!(
        document.body.classList.contains('review-mode-active')
        || document.querySelector('.review-mode-overlay.open, #reviewModeOverlay.open, .review-overlay.open')
      )
    };
  });

  await browser.close();

  const pass = opened.queueLen >= 100
    && opened.results >= 10000
    && before.jsHasDiscard
    && before.jsHasStale
    && !/No .* leads to review|All .* have been checked/i.test(dialogs.join('\n'));

  const report = { base: BASE, pass, before, opened, dialogs };
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
