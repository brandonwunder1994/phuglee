#!/usr/bin/env node
/**
 * Browser UI E2E through Distress OS shell (/analyzer) — mirrors Railway.
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
    prefix: window.__DISTRESS_OS_MODULE_PREFIX__ || '',
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

  console.log('PASS shell-ui-scan-buckets', last);
  try { fs.unlinkSync(tmp); } catch (_) {}
  await browser.close();
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
