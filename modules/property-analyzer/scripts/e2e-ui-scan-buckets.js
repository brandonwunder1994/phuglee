#!/usr/bin/env node
/**
 * Browser UI E2E: open Analyze → import CSV → Start Scan → assert live KPIs move.
 * Targets standalone analyzer (default http://127.0.0.1:3456).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = String(process.env.PDA_BASE || 'http://127.0.0.1:3456').replace(/\/$/, '');

async function main() {
  let playwright;
  try {
    playwright = require('playwright-core');
  } catch {
    throw new Error('playwright-core missing');
  }

  const channels = ['msedge', 'chrome', 'chromium'];
  let browser;
  let channel = 'chromium';
  for (const c of channels) {
    try {
      browser = await playwright.chromium.launch({
        channel: c === 'chromium' ? undefined : c,
        headless: true
      });
      channel = c;
      break;
    } catch (_) {}
  }
  if (!browser) throw new Error('No browser for Playwright');

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const failedRequests = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    if (res.status() >= 400) {
      failedRequests.push({ status: res.status(), url: url.replace(BASE, ''), ok: false });
    }
  });

  console.log(`UI E2E via ${channel} → ${BASE}`);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const boot = await page.evaluate(() => ({
    hasPda: typeof window.__PDA_AUTH_TOKEN__ === 'string' && !!window.__PDA_AUTH_TOKEN__,
    pdaLen: String(window.__PDA_AUTH_TOKEN__ || '').length,
    hasMaps: !!(window.PDA?.env?.serverConfig?.hasMapsKey),
    hasGemini: !!(window.PDA?.env?.serverConfig?.hasGeminiKey),
    useProxy: !!(window.PDA?.env?.USE_PROXY),
    records: (window.PDA?.env?.state?.records || []).length,
    running: !!(window.PDA?.env?.state?.running)
  }));
  console.log('boot', boot);
  if (!boot.hasPda) throw new Error('Page missing __PDA_AUTH_TOKEN__ — browser cannot POST scan APIs');
  if (!boot.hasMaps || !boot.hasGemini) throw new Error('Keys not loaded in UI config');

  const csv = [
    'street,city,state,postal',
    '100 Congress Ave,Austin,TX,78701',
    '700 Congress Ave,Austin,TX,78701'
  ].join('\n');
  const tmp = path.join(os.tmpdir(), `e2e-ui-scan-${Date.now()}.csv`);
  fs.writeFileSync(tmp, csv, 'utf8');

  // Prefer real file input if present; else call handleFile
  const fileInput = await page.$('#fileInput, input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(tmp);
    await page.waitForTimeout(2000);
  } else {
    await page.evaluate(async (text) => {
      const blob = new Blob([text], { type: 'text/csv' });
      const file = new File([blob], 'e2e-ui-scan.csv', { type: 'text/csv' });
      if (typeof window.handleFile === 'function') await window.handleFile(file);
      else if (typeof window.PDA?.env?.handleFile === 'function') await window.PDA.env.handleFile(file);
      else throw new Error('handleFile missing');
    }, csv);
    await page.waitForTimeout(2000);
  }

  const afterImport = await page.evaluate(() => ({
    records: (window.PDA?.env?.state?.records || []).length,
    pending: Number(window.PDA?.env?.state?._pendingUnscanned) || 0,
    force: (window.PDA?.env?.state?.records || []).filter((r) => r.forceRescan).length,
    startDisabled: !!document.getElementById('scanReadyStartBtn')?.disabled,
    blockReason: typeof window.PDA?.env?.getStartBlockReason === 'function'
      ? window.PDA.env.getStartBlockReason()
      : null
  }));
  console.log('afterImport', afterImport);
  if (afterImport.records < 2) throw new Error(`Import failed — records=${afterImport.records}`);
  if (afterImport.startDisabled) {
    throw new Error(`Start disabled: ${afterImport.blockReason || 'unknown'}`);
  }

  // Dismiss any leftover alert handlers
  page.on('dialog', async (d) => {
    console.log('dialog', d.type(), d.message().slice(0, 160));
    await d.accept();
  });

  await page.click('#scanReadyStartBtn');
  await page.waitForTimeout(1500);

  const started = await page.evaluate(() => ({
    running: !!(window.PDA?.env?.state?.running),
    batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
    batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
    liveHidden: !!document.getElementById('liveScanSection')?.hidden,
    summaryHidden: !!document.getElementById('summarySection')?.hidden,
    liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
    workers: document.getElementById('liveScanKpiWorkers')?.textContent || '',
    progress: document.getElementById('liveScanProgress')?.textContent || ''
  }));
  console.log('started', started);
  if (!started.running && started.batchTotal === 0) {
    throw new Error('Scan did not start (running=false, batchTotal=0)');
  }
  if (started.liveHidden) {
    throw new Error('Live scan section still hidden after Start — user sees no moving numbers');
  }

  // Wait up to 3 minutes for at least 1 completed scan (live KPI or batchDone)
  const deadline = Date.now() + 180000;
  let last = started;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => ({
      running: !!(window.PDA?.env?.state?.running),
      batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
      batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
      succeeded: Number(window.PDA?.env?.state?.succeeded) || 0,
      results: (window.PDA?.env?.state?.results || []).length,
      liveHidden: !!document.getElementById('liveScanSection')?.hidden,
      liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
      liveD: document.getElementById('liveScanKpiDistressed')?.textContent || '',
      liveWm: document.getElementById('liveScanKpiWellMaintained')?.textContent || '',
      liveLand: document.getElementById('liveScanKpiLand')?.textContent || '',
      progress: document.getElementById('liveScanProgress')?.textContent || '',
      aborted: !!(window.PDA?.env?.state?.aborted),
      quota: !!(window.PDA?.env?.state?.quotaHaltShown)
    }));
    console.log('tick', last);
    if (last.batchDone >= 1 || last.succeeded >= 1 || Number(last.liveScanned) >= 1) break;
    if (last.aborted || last.quota) break;
    if (!last.running && last.batchDone === 0) break;
  }

  console.log('failedRequests', failedRequests.slice(0, 20));
  console.log('consoleErrors', consoleErrors.slice(0, 20));

  if (last.aborted) throw new Error('Scan aborted before any bucket fill');
  if (last.quota) throw new Error('Scan halted for quota before any bucket fill');
  if (!(last.batchDone >= 1 || last.succeeded >= 1 || Number(last.liveScanned) >= 1)) {
    throw new Error(
      `No properties completed — batchDone=${last.batchDone} liveScanned=${last.liveScanned} ` +
      `running=${last.running} failedApi=${failedRequests.length}`
    );
  }

  // Wait for second or completion
  const endDeadline = Date.now() + 120000;
  while (Date.now() < endDeadline && last.running && last.batchDone < last.batchTotal) {
    await page.waitForTimeout(2000);
    last = await page.evaluate(() => ({
      running: !!(window.PDA?.env?.state?.running),
      batchTotal: Number(window.PDA?.env?.state?.scanBatchTotal) || 0,
      batchDone: Number(window.PDA?.env?.state?.scanBatchDone) || 0,
      liveD: document.getElementById('liveScanKpiDistressed')?.textContent || '',
      liveWm: document.getElementById('liveScanKpiWellMaintained')?.textContent || '',
      liveLand: document.getElementById('liveScanKpiLand')?.textContent || '',
      liveScanned: document.getElementById('liveScanKpiScanned')?.textContent || '',
      sumD: document.getElementById('sumDistressedKpi')?.textContent || '',
      sumWm: document.getElementById('sumWellMaintained')?.textContent || ''
    }));
    console.log('progress', last);
  }

  const tierSum =
    (Number(last.liveD) || 0) + (Number(last.liveWm) || 0) + (Number(last.liveLand) || 0);
  console.log('PASS ui-scan-buckets', {
    batchDone: last.batchDone,
    batchTotal: last.batchTotal,
    liveScanned: last.liveScanned,
    tierSum,
    liveD: last.liveD,
    liveWm: last.liveWm,
    liveLand: last.liveLand
  });

  try { fs.unlinkSync(tmp); } catch (_) {}
  await browser.close();
}

main().catch(async (err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
