#!/usr/bin/env node
'use strict';
/**
 * Browser proof: Keep → next lead paint must stay under a tight budget.
 * Measures sync time from reviewKeep() until the next queue key is showing.
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
  await page.waitForTimeout(4000);

  const report = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    // Prefer WM — Distressed can be nearly empty after a long review session.
    let filter = 'well_maintained';
    await R.openReviewMode(filter, { forceRebuild: true, restart: true });
    let queue = R.state?.reviewQueue || [];
    if (!R.state?.reviewMode || queue.length < 8) {
      filter = 'distressed';
      await R.openReviewMode(filter, { forceRebuild: true, restart: true });
      queue = R.state?.reviewQueue || [];
    }
    if (!R.state?.reviewMode || queue.length < 5) {
      return { ok: false, reason: 'queue_too_small', queueLen: queue.length, filter };
    }

    // Warm first lead imagery path once, then time subsequent Keeps.
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const beforeIdx = R.state.reviewIndex;
      const beforeKey = (R.state.reviewQueue || [])[beforeIdx];
      if (!beforeKey || beforeIdx >= (R.state.reviewQueue || []).length) {
        samples.push({ ms: 0, advanced: false, reason: 'queue_exhausted' });
        break;
      }
      const t0 = performance.now();
      R.reviewKeep();
      const afterIdx = R.state.reviewIndex;
      const afterKey = (R.state.reviewQueue || [])[afterIdx];
      const ms = performance.now() - t0;
      samples.push({
        ms: Math.round(ms * 10) / 10,
        advanced: !!(afterKey && afterKey !== beforeKey) || afterIdx > beforeIdx,
        beforeIdx,
        afterIdx,
        filter
      });
    }

    const times = samples.map((s) => s.ms);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const advancedOk = samples.every((s) => s.advanced);
    // Hot path budget: sync Keep→next paint should be well under 100ms once warmed.
    const ok = advancedOk && avg < 80 && max < 150;
    return {
      ok,
      avg: Math.round(avg * 10) / 10,
      max,
      samples,
      deferHeavy: String(R.markReviewedKey || '').includes('deferHeavy'),
      leanVault: String(R.publishReviewedLeadToVault || '').includes('Lean payload')
    };
  });

  await browser.close();
  const pass = !!report.ok;
  console.log(JSON.stringify({ base: BASE, pass, report }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
