import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const wrap = document.querySelector('.landing-logo-wrap');
  const backdrop = document.querySelector('.logo-ember-backdrop');
  const canvas = document.querySelector('.logo-ember-canvas');
  const halo = document.querySelector('.logo-ember-halo-layer--core');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const backdropRect = rect(backdrop);
  const canvasRect = rect(canvas);
  return {
    backdrop: backdropRect,
    canvas: {
      rect: canvasRect,
      w: canvas?.width ?? 0,
      h: canvas?.height ?? 0,
      display: cs(canvas)?.display ?? null,
    },
    halo: {
      opacity: cs(halo)?.opacity ?? null,
      filter: cs(halo)?.filter ?? null,
      display: cs(halo)?.display ?? null,
    },
    wrapOverflow: cs(wrap)?.overflow ?? null,
    floatOverflow: cs(document.querySelector('.logo-ember-float'))?.overflow ?? null,
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    ok:
      backdropRect.width > 100 &&
      backdropRect.height > 100 &&
      Number(cs(halo)?.opacity ?? 0) > 0.3 &&
      (matchMedia('(prefers-reduced-motion: reduce)').matches || (canvas.width > 0 && canvas.height > 0)),
  };
});

await page.screenshot({ path: 'scripts/_hero-check.png', fullPage: false });
await browser.close();

console.log(JSON.stringify(info, null, 2));
process.exit(info.ok ? 0 : 1);