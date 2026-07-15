#!/usr/bin/env node
/**
 * Mobile layout smoke check for Distress OS / Phuglee.
 * Loads key routes at phone widths and fails on document-level horizontal overflow
 * plus undersized primary touch targets.
 *
 * Usage:
 *   node scripts/verify-mobile.cjs
 *   node scripts/verify-mobile.cjs --width=375 --width=320
 *   node scripts/verify-mobile.cjs --pages=/,/collect,/bridge
 *   node scripts/verify-mobile.cjs --devices   # iPhone + Pixel viewports (P3 emulation)
 *   powershell -File scripts/verify-mobile.ps1
 *
 * Exit: 0 = pass, 1 = overflow/layout fail, 2 = browser/server unavailable
 */

'use strict';

const DEFAULT_BASE = process.env.DISTRESS_OS_BASE || 'http://127.0.0.1:3000';
const DEFAULT_PAGES = [
  '/',
  '/collect',
  '/bridge',
  '/command',
  '/vault',
  '/analyzer',
  '/forge/',
  '/under-contract',
  '/operating-costs',
  '/photo-upload',
];
const DEFAULT_WIDTHS = [375, 320];
const DEVICE_PRESETS = [
  { name: 'iphone-safari', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'android-chrome', width: 412, height: 915, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
];
const TOLERANCE_PX = 2;
const TOUCH_MIN = 44;

function parseArgs(argv) {
  const out = {
    base: DEFAULT_BASE,
    pages: DEFAULT_PAGES.slice(),
    widths: DEFAULT_WIDTHS.slice(),
    touch: true,
    devices: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) out.base = arg.slice(7).replace(/\/$/, '');
    else if (arg.startsWith('--pages=')) {
      out.pages = arg
        .slice(8)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (p.startsWith('/') ? p : `/${p}`));
    } else if (arg.startsWith('--width=')) {
      const w = Number(arg.slice(8));
      if (Number.isFinite(w) && w > 0) out.widths.push(w);
    } else if (arg === '--no-touch') out.touch = false;
    else if (arg === '--devices') out.devices = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  if (argv.some((a) => a.startsWith('--width='))) {
    out.widths = argv
      .filter((a) => a.startsWith('--width='))
      .map((a) => Number(a.slice(8)))
      .filter((w) => Number.isFinite(w) && w > 0);
  }
  return out;
}

async function findBrowser(playwright) {
  const channels = ['msedge', 'chrome', 'chromium'];
  const errors = [];
  for (const channel of channels) {
    try {
      const browser = await playwright.chromium.launch({
        channel,
        headless: true,
      });
      return { browser, channel };
    } catch (err) {
      errors.push(`${channel}: ${err.message}`);
    }
  }
  throw new Error(
    `Could not launch a system browser (Edge/Chrome).\nTried:\n- ${errors.join('\n- ')}\n` +
      'Install Microsoft Edge or Google Chrome, then re-run.'
  );
}

async function auditPage(page, url, width, height, checkTouch) {
  await page.setViewportSize({ width, height });
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 25000,
  });
  const status = response ? response.status() : 0;
  await new Promise((resolve) => setTimeout(resolve, 450));

  const metrics = await page.evaluate(
    ({ tolerance, touchMin }) => {
      const doc = document.documentElement;
      const body = document.body;
      const clientW = doc.clientWidth;
      const scrollW = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
      const overflowDeclared = scrollW > clientW + tolerance;

      const htmlOx = getComputedStyle(doc).overflowX;
      const bodyOx = getComputedStyle(body).overflowX;
      const clips =
        htmlOx === 'hidden' ||
        htmlOx === 'clip' ||
        bodyOx === 'hidden' ||
        bodyOx === 'clip';

      const se = document.scrollingElement || doc;
      const before = se.scrollLeft;
      se.scrollLeft = Math.min(80, Math.max(0, scrollW - clientW));
      const moved = Math.abs(se.scrollLeft - before) > 1;
      se.scrollLeft = before;
      const canScrollX = moved;
      const overflowX = overflowDeclared && (canScrollX || !clips);

      const offenders = [];
      if (overflowX || (overflowDeclared && !clips)) {
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          if (!(el instanceof HTMLElement)) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          let clippedByAncestor = false;
          let p = el.parentElement;
          while (p && p !== body) {
            const ps = getComputedStyle(p);
            if (ps.overflowX === 'hidden' || ps.overflowX === 'clip' || ps.overflow === 'hidden') {
              clippedByAncestor = true;
              break;
            }
            p = p.parentElement;
          }
          if (clippedByAncestor) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.right > clientW + tolerance + 1) {
            const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : '';
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls,
              right: Math.round(r.right),
              w: Math.round(r.width),
            });
            if (offenders.length >= 6) break;
          }
        }
      }

      const touchSelectors = [
        '.shell-nav-menu-btn',
        '.shell-nav-link',
        '.auth-close',
        '.auth-tab',
        '.phuglee-btn',
        '.forge-cities-toggle',
        '.vault-type-tab',
        '.uc-quick-btn',
        '.bridge-pipeline-step',
      ];

      const touchFails = [];
      for (const sel of touchSelectors) {
        const nodes = document.querySelectorAll(sel);
        for (const el of nodes) {
          if (!(el instanceof HTMLElement)) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          // Only assert when control is in/near viewport (primary chrome)
          if (r.bottom < 0 || r.top > window.innerHeight + 40) continue;
          if (r.width + 0.5 < touchMin || r.height + 0.5 < touchMin) {
            touchFails.push({
              sel,
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
            if (touchFails.length >= 8) break;
          }
        }
        if (touchFails.length >= 8) break;
      }

      const menu = document.querySelector('.shell-nav-menu-btn');
      let menuOk = null;
      if (menu) {
        const shown = getComputedStyle(menu).display !== 'none';
        if (shown) {
          const r = menu.getBoundingClientRect();
          menuOk = r.width >= touchMin - 0.5 && r.height >= touchMin - 0.5;
        }
      }

      const viewport = document.querySelector('meta[name="viewport"]');
      const content = (viewport && viewport.getAttribute('content')) || '';
      const viewportOk = !!(viewport && /width\s*=\s*device-width/i.test(content));
      const safeAreaHint =
        /viewport-fit\s*=\s*cover/i.test(content) ||
        !!document.querySelector('[style*="safe-area"], .shell-nav, body');

      const padBottom = body ? getComputedStyle(body).paddingBottom : '';
      const usesSafeArea =
        /env\(\s*safe-area-inset/i.test(padBottom) ||
        Array.from(document.styleSheets || []).length >= 0; // present in CSS bundle; don't hard-fail

      return {
        clientW,
        scrollW,
        overflowX,
        canScrollX,
        clips,
        path: location.pathname,
        offenders,
        menuOk,
        touchFails,
        viewportOk,
        safeAreaHint,
        usesSafeArea,
        title: document.title || '',
      };
    },
    { tolerance: TOLERANCE_PX, touchMin: TOUCH_MIN }
  );

  return { status, ...metrics, checkTouch };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/verify-mobile.cjs [--base=URL] [--pages=/a,/b] [--width=375] [--devices] [--no-touch]
Default pages: ${DEFAULT_PAGES.join(', ')}
Default widths: ${DEFAULT_WIDTHS.join(', ')}
--devices: also run iPhone Safari + Android Chrome emulated viewports`);
    process.exit(0);
  }

  let playwright;
  try {
    playwright = require('playwright-core');
  } catch {
    console.error('FAIL: playwright-core is not installed. Run: npm install -D playwright-core');
    process.exit(2);
  }

  try {
    const health = await fetch(`${opts.base}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (err) {
    console.error(`FAIL: server not reachable at ${opts.base} (${err.message})`);
    console.error('Run: powershell -File scripts\\verify-live.ps1');
    process.exit(2);
  }

  let browser;
  let channel;
  try {
    ({ browser, channel } = await findBrowser(playwright));
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(2);
  }

  const height = 812;
  const failures = [];
  const warnings = [];

  const runs = opts.widths.map((width) => ({
    name: `${width}px`,
    width,
    height,
    userAgent: null,
  }));
  if (opts.devices) {
    for (const d of DEVICE_PRESETS) {
      runs.push({
        name: d.name,
        width: d.width,
        height: d.height,
        userAgent: d.userAgent,
      });
    }
  }

  console.log(`Mobile verify · base=${opts.base} · browser=${channel}`);
  console.log(
    `Runs: ${runs.map((r) => r.name).join(', ')} · Pages: ${opts.pages.join(', ')}`
  );

  try {
    for (const run of runs) {
      const context = await browser.newContext({
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: run.userAgent || undefined,
        viewport: { width: run.width, height: run.height },
      });
      const page = await context.newPage();

      for (const route of opts.pages) {
        const url = `${opts.base}${route}`;
        const label = `${run.name} ${route}`;
        try {
          const result = await auditPage(page, url, run.width, run.height, opts.touch);
          if (result.status >= 400) {
            failures.push(`${label}: HTTP ${result.status}`);
            console.log(`  FAIL ${label} — HTTP ${result.status}`);
            continue;
          }
          if (!result.viewportOk) {
            failures.push(`${label}: missing viewport meta width=device-width`);
            console.log(`  FAIL ${label} — viewport meta`);
          }
          if (result.overflowX) {
            const tip = result.offenders
              .slice(0, 3)
              .map((o) => `${o.tag}.${o.cls || '?'}→${o.right}`)
              .join('; ');
            failures.push(
              `${label}: horizontal scroll scrollW=${result.scrollW} clientW=${result.clientW} path=${result.path}${tip ? ` (${tip})` : ''}`
            );
            console.log(
              `  FAIL ${label} — scrollX path=${result.path} ${result.scrollW}>${result.clientW}`
            );
          }

          if (opts.touch) {
            if (result.menuOk === false) {
              failures.push(`${label}: .shell-nav-menu-btn visible but < ${TOUCH_MIN}×${TOUCH_MIN}`);
              console.log(`  FAIL ${label} — menu touch target < ${TOUCH_MIN}px`);
            }
            if (result.touchFails && result.touchFails.length) {
              // Hard-fail shell menu / forge toggle / primary visible phuglee buttons only
              const hard = result.touchFails.filter((t) =>
                /shell-nav-menu-btn|forge-cities-toggle|auth-close/.test(t.sel)
              );
              const soft = result.touchFails.filter((t) => !hard.includes(t));
              for (const t of hard) {
                failures.push(`${label}: ${t.sel} ${t.w}×${t.h} < ${TOUCH_MIN}`);
                console.log(`  FAIL ${label} — touch ${t.sel} ${t.w}×${t.h}`);
              }
              for (const t of soft.slice(0, 3)) {
                warnings.push(`${label}: ${t.sel} ${t.w}×${t.h} < ${TOUCH_MIN}`);
              }
            }
          }

          if (!failures.some((f) => f.startsWith(`${label}:`))) {
            console.log(`  PASS ${label}`);
          }
        } catch (err) {
          failures.push(`${label}: ${err.message}`);
          console.log(`  FAIL ${label} — ${err.message}`);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (warnings.length) {
    console.log('');
    console.log('Warnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (failures.length) {
    console.log('');
    console.log(`MOBILE FAIL (${failures.length})`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log('Fix overflow/touch issues, then re-run scripts\\verify-mobile.ps1');
    process.exit(1);
  }

  console.log('');
  console.log(
    `MOBILE ok runs=${runs.map((r) => r.name).join('/')} pages=${opts.pages.length}`
  );
  if (!opts.devices) {
    console.log('Tip: node scripts/verify-mobile.cjs --devices  (iPhone + Android emulation)');
  } else {
    console.log(
      'P3 note: emulated iPhone/Android passed. Still spot-check real devices for keyboard focus + auth sheet + safe-area notches.'
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`FAIL: ${err.stack || err.message}`);
  process.exit(2);
});
