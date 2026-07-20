#!/usr/bin/env node
/**
 * Browser UI E2E through Phuglee shell (/analyzer) — mirrors Railway.
 * Logs in as admin, imports CSV, Start Scan, asserts live KPIs move.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..', '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch (_) {}

const BASE = String(process.env.SHELL_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const USER = process.env.PHUGLEE_USER || 'admin';
const PASS = process.env.PHUGLEE_PASS
  || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD
  || '';

async function main() {
  if (!PASS) throw new Error('Missing PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD');

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
  const apiFails = [];
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/') && res.status() >= 400) {
      apiFails.push({ status: res.status(), url: u.replace(BASE, '').slice(0, 120) });
    }
  });
  page.on('dialog', async (d) => {
    console.log('dialog', d.message().slice(0, 180));
    await d.accept();
  });

  console.log(`Shell UI E2E → ${BASE}/analyzer`);

  // Login via API to set cookie in browser context
  const loginRes = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS, plan: 'max' }
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  console.log('login', loginRes.status(), { ok: loginJson.ok, user: loginJson.username });
  if (!loginRes.ok() || !loginJson.ok) {
    throw new Error(`Login failed: ${loginRes.status()} ${JSON.stringify(loginJson)}`);
  }

  await page.goto(`${BASE}/analyzer/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3500);

  const boot = await page.evaluate(() => ({
    prefix: window.__PHUGLEE_MODULE_PREFIX__ || window.__DISTRESS_OS_MODULE_PREFIX__ || '',
    hasPda: !!(window.__PDA_AUTH_TOKEN__),
    hasMaps: !!(window.PDA?.env?.serverConfig?.hasMapsKey),
    hasGemini: !!(window.PDA?.env?.serverConfig?.hasGeminiKey),
    useProxy: !!(window.PDA?.env?.USE_PROXY),
    embedded: !!(window.PDA?.env?.IS_EMBEDDED),
    online: window.PDA?.env?.serverOnline,
    sessionUser: sessionStorage.getItem('phuglee_session') || ''
  }));
  console.log('boot', boot);
  if (!boot.hasMaps || !boot.hasGemini) {
    throw new Error('Analyzer UI missing Maps/Gemini keys through shell');
  }

  // Probe APIs the same way the page does
  const statusProbe = await page.evaluate(async () => {
    const apiFetch = window.PDA?.env?.apiFetch || window.apiFetch || fetch;
    const res = await apiFetch('/api/status', { cache: 'no-store' });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 200) };
  });
  console.log('statusProbe', statusProbe);
  if (statusProbe.status !== 200) {
    throw new Error(` /api/status via page failed: ${statusProbe.status} ${statusProbe.text}`);
  }

  const csv = [
    'street,city,state,postal',
    '100 Congress Ave,Austin,TX,78701',
    '700 Congress Ave,Austin,TX,78701'
  ].join('\n');
  const tmp = path.join(os.tmpdir(), `e2e-shell-scan-${Date.now()}.csv`);
  fs.writeFileSync(tmp, csv, 'utf8');

  // Prefer scan desk input — never hit loadBackupInput (first file input on page).
  const fileInput = await page.$('#scanFileInput, #fileInput');
  if (fileInput) {
    await fileInput.setInputFiles(tmp);
  } else {
    await page.evaluate(async (text) => {
      const file = new File([text], 'e2e-shell.csv', { type: 'text/csv' });
      const fn = window.PDA?.env?.handleFile || window.handleFile;
      if (!fn) throw new Error('handleFile missing');
      await fn(file);
    }, csv);
  }
  await page.waitForTimeout(3000);

  const afterImport = await page.evaluate(() => ({
    records: (window.PDA?.env?.state?.records || []).length,
    pending: Number(window.PDA?.env?.state?._pendingUnscanned) || 0,
    force: (window.PDA?.env?.state?.records || []).filter((r) => r?.forceRescan).length,
    startDisabled: !!document.getElementById('scanReadyStartBtn')?.disabled,
    block: typeof window.PDA?.env?.getStartBlockReason === 'function'
      ? window.PDA.env.getStartBlockReason()
      : null
  }));
  console.log('afterImport', afterImport);
  if (afterImport.records < 2) throw new Error(`import failed records=${afterImport.records}`);
  if (afterImport.startDisabled) throw new Error(`Start disabled: ${afterImport.block}`);

  // Queue save probe
  const queueProbe = apiFails.filter((f) => f.url.includes('session-scan-queue'));
  console.log('queueFails', queueProbe);

  await page.click('#scanReadyStartBtn');
  await page.waitForTimeout(2500);

  let last = await page.evaluate(() => ({
    running: !!(window.PDA?.env?.state?.running),
    batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
    batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
    liveHidden: !!document.getElementById('liveScanSection')?.hidden,
    summaryHidden: !!document.getElementById('summarySection')?.hidden,
    liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
    workers: document.getElementById('liveScanKpiWorkers')?.textContent || '',
    progress: document.getElementById('liveScanProgress')?.textContent || '',
    aborted: !!(window.PDA?.env?.state?.aborted)
  }));
  console.log('started', last);
  if (!last.running && last.batchTotal === 0) {
    throw new Error('Scan never started through shell');
  }
  if (last.liveHidden) {
    throw new Error('Live KPI section hidden after Start through shell — numbers cannot move');
  }

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => ({
      running: !!(window.PDA?.env?.state?.running),
      batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
      batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
      succeeded: Number(window.PDA?.env?.state?.succeeded) || 0,
      liveHidden: !!document.getElementById('liveScanSection')?.hidden,
      liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
      liveWm: document.getElementById('liveScanKpiWellMaintained')?.textContent || '',
      liveD: document.getElementById('liveScanKpiDistressed')?.textContent || '',
      progress: document.getElementById('liveScanProgress')?.textContent || '',
      aborted: !!(window.PDA?.env?.state?.aborted),
      quota: !!(window.PDA?.env?.state?.quotaHaltShown)
    }));
    console.log('tick', last);
    if (last.batchDone >= 1 || Number(last.liveScanned) >= 1) break;
    if (last.aborted || last.quota || (!last.running && last.batchDone === 0)) break;
  }

  console.log('apiFails sample', apiFails.slice(0, 30));
  console.log('consoleErrors sample', consoleErrors.slice(0, 15));

  if (!(last.batchDone >= 1 || Number(last.liveScanned) >= 1)) {
    throw new Error(
      `Shell scan stuck — batchDone=${last.batchDone} live=${last.liveScanned} ` +
      `running=${last.running} aborted=${last.aborted} apiFails=${apiFails.length}`
    );
  }

  // Wait for run to finish (or at least 2 done for our 2-row fixture)
  const endDeadline = Date.now() + 180000;
  while (Date.now() < endDeadline && last.running && last.batchDone < Math.min(2, last.batchTotal || 2)) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => ({
      running: !!(window.PDA?.env?.state?.running),
      batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
      batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
      liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
      liveD: document.getElementById('liveScanKpiDistressed')?.textContent || '',
      liveWm: document.getElementById('liveScanKpiWellMaintained')?.textContent || '',
      liveLand: document.getElementById('liveScanKpiLand')?.textContent || '',
      liveReview: document.getElementById('liveScanKpiReview')?.textContent || '',
      aborted: !!(window.PDA?.env?.state?.aborted),
      quota: !!(window.PDA?.env?.state?.quotaHaltShown)
    }));
    console.log('progress', last);
  }

  const authFails = apiFails.filter((f) => f.status === 401 || f.status === 403);
  const geminiFails = apiFails.filter((f) => f.url.includes('gemini-vision') && f.status >= 400);
  if (authFails.length) {
    throw new Error(`Auth still blocking scan APIs: ${JSON.stringify(authFails.slice(0, 5))}`);
  }
  if (last.batchDone < 1) {
    throw new Error(`Finished with zero completions; geminiFails=${JSON.stringify(geminiFails.slice(0, 5))}`);
  }

  // After scan, session awaiting-review strip should be visible and non-zero for this run
  await page.waitForTimeout(1500);
  const post = await page.evaluate(() => {
    const batchKeys = window.PDA?.env?.state?._scanBatchResultKeys;
    const keys = batchKeys && typeof batchKeys.values === 'function' ? [...batchKeys] : [];
    const results = window.PDA?.env?.state?.results || [];
    const batch = results.filter((r) => {
      const k = typeof window.PDA?.env?.recordKey === 'function' ? window.PDA.env.recordKey(r) : '';
      return k && keys.includes(k);
    });
    const tallies = { distressed: 0, well_maintained: 0, vacant: 0, review: 0, other: 0 };
    for (const r of batch) {
      const cat = String(r.category || '').toLowerCase();
      let t = String(r.leadTier || '').toLowerCase().replace(/-/g, '_');
      if (cat === 'vacant_lot' || t === 'vacant') tallies.vacant++;
      else if (t === 'distressed' || t === 'hot_lead') tallies.distressed++;
      else if (t === 'well_maintained') tallies.well_maintained++;
      else if (typeof window.PDA?.env?.computeNeedsReview === 'function' && window.PDA.env.computeNeedsReview(r)) tallies.review++;
      else tallies.other++;
    }
    return {
      summaryHidden: !!document.getElementById('summarySection')?.hidden,
      liveHidden: !!document.getElementById('liveScanSection')?.hidden,
      batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
      batchLen: batch.length,
      tallies,
      sumD: document.getElementById('sumDistressedKpi')?.textContent || '',
      sumWm: document.getElementById('sumWellMaintained')?.textContent || '',
      sumVacant: document.getElementById('sumVacant')?.textContent || ''
    };
  });
  console.log('postScan', post);
  const tierFilled = (post.tallies.distressed + post.tallies.well_maintained + post.tallies.vacant + post.tallies.review);
  if (post.batchLen < 1 || tierFilled < 1) {
    throw new Error(`Results did not land in review buckets: ${JSON.stringify(post)}`);
  }

  console.log('PASS shell-ui-scan-buckets', { last, post });
  try { fs.unlinkSync(tmp); } catch (_) {}
  await browser.close();
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
