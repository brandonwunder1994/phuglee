/**
 * Phase 67 Multi-City Shift & Staging locks (SHIFT-03 first; Plans 02–03 append SHIFT-02 / SHIFT-01)
 * Static source scans — no browser automation, zero new packages.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');

const GREEN_RGBA = 'rgba(120, 180, 140';
const GREEN_HEX = '#9fd4a8';
const HEAT_MARKERS = /#eeb746|#e58435|phuglee-gold|phuglee-orange|--ember|--heat-core|var\(--ember\)|var\(--heat-core\)|var\(--phuglee-gold\)|var\(--phuglee-orange\)/;

/**
 * Extract a CSS rule body for a simple selector block (first `{` … matching `}`).
 * Uses depth counting so nested rules (rare here) do not truncate early.
 */
function cssRuleBody(source, selector) {
  const needle = selector + ' {';
  let start = source.indexOf(needle);
  if (start < 0) {
    // allow no space before brace
    const alt = selector + '{';
    start = source.indexOf(alt);
    if (start < 0) return null;
    start = start + alt.length;
  } else {
    start = start + needle.length;
  }
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

function resetImportAreaSlice() {
  const start = js.indexOf('function resetImportAreaAfterSave');
  assert.ok(start >= 0, 'function resetImportAreaAfterSave must exist');
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  (?:async )?function \w+/);
  return next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 4500);
}

// ---------------------------------------------------------------------------
// SHIFT-03: post-save success is brand heat, not green SaaS
// ---------------------------------------------------------------------------

test('SHIFT-03: .bridge-lists-flash has no green SaaS palette', () => {
  const body = cssRuleBody(css, '.bridge-lists-flash');
  assert.ok(body != null, '.bridge-lists-flash rule must exist in bridge.css');
  assert.equal(
    body.includes(GREEN_RGBA),
    false,
    '.bridge-lists-flash must not use rgba(120, 180, 140…)'
  );
  assert.equal(
    body.toLowerCase().includes(GREEN_HEX),
    false,
    '.bridge-lists-flash must not use #9fd4a8'
  );
});

test('SHIFT-03: .bridge-lists-flash uses ember/gold heat tokens', () => {
  const body = cssRuleBody(css, '.bridge-lists-flash');
  assert.ok(body != null, '.bridge-lists-flash rule must exist');
  assert.match(
    body,
    HEAT_MARKERS,
    '.bridge-lists-flash must include gold/orange heat (#eeb746/#e58435 or phuglee-gold/orange/ember/heat-core)'
  );
});

test('SHIFT-03: .bridge-flash-download is not green SaaS', () => {
  const body = cssRuleBody(css, '.bridge-flash-download');
  assert.ok(body != null, '.bridge-flash-download rule must exist in bridge.css');
  assert.equal(
    body.includes(GREEN_RGBA),
    false,
    '.bridge-flash-download must not use rgba(120, 180, 140…)'
  );
  // Hover rule is adjacent — also purge green there
  const hover = cssRuleBody(css, '.bridge-flash-download:hover');
  if (hover != null) {
    assert.equal(
      hover.includes(GREEN_RGBA),
      false,
      '.bridge-flash-download:hover must not use green SaaS rgba'
    );
  }
});

test('SHIFT-03: .bridge-list-status--downloaded is not green SaaS', () => {
  const body = cssRuleBody(css, '.bridge-list-status--downloaded');
  assert.ok(body != null, '.bridge-list-status--downloaded rule must exist');
  assert.equal(
    body.includes(GREEN_RGBA),
    false,
    '.bridge-list-status--downloaded must not use rgba(120, 180, 140…)'
  );
  assert.equal(
    body.toLowerCase().includes(GREEN_HEX),
    false,
    '.bridge-list-status--downloaded must not use #9fd4a8'
  );
});

test('SHIFT-03 / EFF carry: Download this list flash CTA still present', () => {
  assert.match(js, /Download this list/);
  const hasFlashId = /bridge-flash-download/.test(js);
  const hasFlashAction = /data-action="flash-download"|dataset\.action\s*=\s*['"]flash-download['"]/.test(js);
  assert.ok(
    hasFlashId || hasFlashAction,
    'bridge.js must expose bridge-flash-download id or flash-download action'
  );
});

test('SHIFT-03: flash teaching keeps pick-next-city + Saved lists enrichment anchors', () => {
  assert.match(js, /pick the next city|Filter reset/i);
  assert.match(js, /download from Saved lists for enrichment/);
});

test('SHIFT-03 carry: resetImportAreaAfterSave clears working set and never auto-downloads', () => {
  const slice = resetImportAreaSlice();
  assert.match(slice, /selectedCity\s*=\s*null/);
  assert.match(slice, /lastResult\s*=\s*null/);
  const withoutStrings = slice
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(
    /downloadSavedList\s*\(/.test(withoutStrings),
    false,
    'resetImportAreaAfterSave must not auto-call downloadSavedList('
  );
});
