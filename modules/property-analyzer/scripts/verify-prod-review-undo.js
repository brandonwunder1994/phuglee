#!/usr/bin/env node
'use strict';
/**
 * Browser proof: Keep then Undo must return to the previous lead (same queue key).
 * Exit 0 only when Undo restores the prior lead address/key.
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
  await page.waitForTimeout(5000);

  const report = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    if (typeof R.openReviewMode === 'function') {
      await R.openReviewMode('distressed', { forceRebuild: true, restart: true });
    }
    const queue = R.state?.reviewQueue || [];
    if (!R.state?.reviewMode || queue.length < 2) {
      return { ok: false, reason: 'queue_too_small', queueLen: queue.length };
    }

    const keyBefore = queue[R.state.reviewIndex];
    const recBefore = typeof R.findResultByKey === 'function' ? R.findResultByKey(keyBefore) : null;
    const addrBefore = recBefore?.address || null;
    const streetBefore = typeof R.propertyStreetLine === 'function' && recBefore
      ? R.propertyStreetLine(recBefore)
      : (recBefore?.street || addrBefore);

    if (typeof R.reviewKeep === 'function') R.reviewKeep();
    const keyAfterKeep = (R.state?.reviewQueue || [])[R.state.reviewIndex];
    const advanced = keyAfterKeep !== keyBefore;

    if (typeof R.reviewUndo === 'function') R.reviewUndo();
    const keyAfterUndo = (R.state?.reviewQueue || [])[R.state.reviewIndex];
    const recAfter = typeof R.findResultByKey === 'function' ? R.findResultByKey(keyAfterUndo) : null;
    const addrAfter = recAfter?.address || null;
    const streetAfter = typeof R.propertyStreetLine === 'function' && recAfter
      ? R.propertyStreetLine(recAfter)
      : (recAfter?.street || addrAfter);

    const stampsCleared = !!(recAfter && !recAfter.reviewResolved && !recAfter.manuallyReviewed);
    const sameLead = keyAfterUndo === keyBefore;
    const hasForceKeyHelper = typeof R.reviewUndo === 'function'
      && String(R.reviewUndo).includes('_reviewUndoForceKey');

    return {
      ok: sameLead && advanced && !!recAfter && stampsCleared,
      sameLead,
      advanced,
      stampsCleared,
      hasForceKeyHelper,
      keyBefore,
      keyAfterKeep,
      keyAfterUndo,
      streetBefore,
      streetAfter,
      queueLen: queue.length,
      index: R.state.reviewIndex,
      undoStackLen: (R.state.reviewUndoStack || []).length,
      jsHasForce: /_reviewUndoForceKey/.test(String(R.renderReviewLead || ''))
    };
  });

  await browser.close();

  const pass = !!report.ok && report.jsHasForce;
  console.log(JSON.stringify({ base: BASE, pass, report }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
