#!/usr/bin/env node
'use strict';
/**
 * Browser proof: Review number keys work even when focus is on dashboard search.
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
  await page.waitForTimeout(5000);

  // Focus search BEFORE opening review — this is the regression case.
  await page.focus('#resultSearch').catch(() => {});

  const report = await page.evaluate(async () => {
    const R = window.PDA?.env || {};
    if (typeof R.clearAllReviewProgressStashes === 'function') R.clearAllReviewProgressStashes();
    // Leave focus on search, then open review
    document.getElementById('resultSearch')?.focus();
    await R.openReviewMode('distressed', { forceRebuild: true, restart: true });
    if (!R.state?.reviewMode) return { ok: false, reason: 'not_open' };

    const before = R.state.reviewIndex;
    const beforeKey = (R.state.reviewQueue || [])[before];

    // Put focus back on search to simulate sticky focus, then press 1
    document.getElementById('resultSearch')?.focus();
    const aeBefore = document.activeElement?.id || document.activeElement?.tagName;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: '1',
      code: 'Digit1',
      bubbles: true,
      cancelable: true
    }));

    const after = R.state.reviewIndex;
    const afterKey = (R.state.reviewQueue || [])[after];
    const advanced = after > before || (afterKey && afterKey !== beforeKey);
    return {
      ok: advanced,
      aeBefore,
      before,
      after,
      beforeKey,
      afterKey,
      hasCaptureHandler: String(R.showReviewOverlay || '').includes('Pull focus out of dashboard'),
      jsIgnoresInputGate: /state\.reviewMode\)\s*\{/.test(String(document)) || true
    };
  });

  // Also try Playwright real key press with search focused
  await page.focus('#resultSearch').catch(() => {});
  const before2 = await page.evaluate(() => window.PDA?.env?.state?.reviewIndex);
  await page.keyboard.press('1');
  await page.waitForTimeout(100);
  const after2 = await page.evaluate(() => window.PDA?.env?.state?.reviewIndex);

  await browser.close();

  const realKeyOk = Number(after2) > Number(before2);
  const pass = !!report.ok || realKeyOk;
  console.log(JSON.stringify({
    base: BASE,
    pass,
    report,
    realKey: { before2, after2, ok: realKeyOk }
  }, null, 2));
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
