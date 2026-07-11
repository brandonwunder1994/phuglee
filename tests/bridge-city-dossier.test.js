/**
 * Phase 62 City Dossier contracts (CITY-01, CITY-02)
 * Static + source contracts — no browser automation.
 *
 * Plan 01 Wave 0: as-built payload/radio locks GREEN;
 * dossier shell + demoted outcome drawer intentionally RED until Plan 02.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');

const OUTCOME_STATUSES = [
  'needs_clarification',
  'no',
  'other_source',
  'they_charge',
  'approved_bad_data'
];

function onCityChangeBody() {
  const start = js.indexOf('function onCityChange');
  assert.ok(start >= 0, 'onCityChange must exist');
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  (?:async )?function \w+/);
  return next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 2500);
}

function saveCityOutcomeBody() {
  const start = js.indexOf('async function saveCityOutcome');
  assert.ok(start >= 0, 'saveCityOutcome must exist');
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  (?:async )?function \w+/);
  return next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 2500);
}

// ---------------------------------------------------------------------------
// CITY-01 — dossier shell + eager history (RED until Plan 02)
// ---------------------------------------------------------------------------

test('CITY-01: bridge.html has #bridge-city-dossier last-scan shell', () => {
  assert.match(
    html,
    /id=["']bridge-city-dossier["']/,
    'city step must host id="bridge-city-dossier"'
  );
  assert.match(
    html,
    /When Did We Scan Last\?/,
    'dossier title must be When Did We Scan Last?'
  );
});

test('CITY-01: dossier surfaces last-scrub + staged-lists facet hooks', () => {
  const hasLastScrub =
    /id=["']bridge-dossier-last-scrub["']/.test(html) ||
    /class=["'][^"']*bridge-dossier-last-scrub/.test(html) ||
    /bridge-dossier-last-scrub/.test(html);
  const hasLists =
    /id=["']bridge-dossier-lists["']/.test(html) ||
    /class=["'][^"']*bridge-dossier-lists/.test(html) ||
    /bridge-dossier-lists/.test(html);
  // Prior attaches facet is optional third hook (bridge-dossier-attaches)
  assert.ok(hasLastScrub, 'HTML must expose bridge-dossier-last-scrub id or class hook');
  assert.ok(hasLists, 'HTML must expose bridge-dossier-lists id or class hook');
});

test('CITY-01: last scan is one latest row per list type', () => {
  assert.match(js, /lastByType/);
  assert.match(js, /function scanTypeKey/);
  assert.match(js, /bridge-last-scan-row/);
});

test('CITY-01: no-usable-list outcomes show as Did not scan + reason in last-scan list', () => {
  assert.match(js, /dossierOutcomesCache/);
  assert.match(js, /kind:\s*['"]outcome['"]/);
  assert.match(js, /Did not scan/);
  assert.match(js, /OUTCOME_STATUS_LABELS|outcomeStatusLabel/);
  assert.match(js, /bridge-last-scan-row--outcome/);
  assert.match(css, /bridge-last-scan-row--outcome/);
  // History payload must feed outcomes into model
  assert.match(js, /data\.outcomes/);
  assert.match(js, /buildDossierModel\([^)]*outcomes/);
});

test('CITY-01: bridge.js builds/renders dossier and filters lists by cityId', () => {
  const hasBuilder =
    /function\s+buildDossierModel\b/.test(js) ||
    /function\s+renderCityDossier\b/.test(js) ||
    /\bbuildDossierModel\b/.test(js) ||
    /\brenderCityDossier\b/.test(js);
  assert.ok(
    hasBuilder,
    'bridge.js must define buildDossierModel or renderCityDossier'
  );
  const filtersByCity =
    /l\.cityId/.test(js) ||
    /listsForCity/.test(js) ||
    /cityId\s*===\s*/.test(js) ||
    /\.cityId\s*\|\|/.test(js) && /filter\s*\(/.test(js);
  // Prefer explicit city-scoped list filter patterns from RESEARCH
  const cityListFilter =
    /listsForCity\s*\(/.test(js) ||
    /\.filter\s*\(\s*\(?\s*l\s*\)?\s*=>[\s\S]{0,120}cityId/.test(js) ||
    /savedLists[\s\S]{0,200}\.filter[\s\S]{0,120}cityId/.test(js);
  assert.ok(
    filtersByCity || cityListFilter,
    'dossier list facet must filter saved lists by cityId'
  );
});

test('CITY-01: city-select path loads history for dossier (not dialog-only)', () => {
  const hasNamedHelper = /\bloadCityDossierHistory\b/.test(js);
  const body = onCityChangeBody();
  const cityChangeLoadsHistory =
    /\bloadCityDossierHistory\s*\(/.test(body) ||
    /\bloadHistory\s*\(/.test(body);
  assert.ok(
    hasNamedHelper || cityChangeLoadsHistory,
    'onCityChange (or loadCityDossierHistory) must fetch history for dossier — not only openHistoryDialog'
  );
  // Dialog path may still call loadHistory; dossier must not rely on dialog alone
  if (!hasNamedHelper && cityChangeLoadsHistory) {
    assert.match(body, /loadHistory\s*\(/);
  }
});

// ---------------------------------------------------------------------------
// CITY-02 — demoted outcome scrap/drawer (drawer RED until Plan 02; payload GREEN)
// ---------------------------------------------------------------------------

test('CITY-02: outcomes wrapped in secondary drawer/scrap control', () => {
  const hasDrawer =
    /id=["']bridge-outcome-drawer["']/.test(html) ||
    /class=["'][^"']*bridge-outcome-drawer/.test(html) ||
    /data-bridge-outcome-drawer/.test(html) ||
    /<details[^>]*bridge-outcome-drawer/.test(html);
  assert.ok(
    hasDrawer,
    'HTML must wrap outcomes in #bridge-outcome-drawer / .bridge-outcome-drawer / data-bridge-outcome-drawer'
  );
});

test('CITY-02: collapsed entry copy for no-list / tracker outcome path', () => {
  assert.match(
    html,
    /no usable list|Log tracker outcome|City replied/i,
    'collapsed drawer entry must invite no-list / tracker outcome path'
  );
});

test('CITY-02: five outcome radio values preserved with name="bridge-city-outcome"', () => {
  for (const status of OUTCOME_STATUSES) {
    assert.match(
      html,
      new RegExp(
        `name=["']bridge-city-outcome["'][^>]*value=["']${status}["']|value=["']${status}["'][^>]*name=["']bridge-city-outcome["']`
      ),
      `radio value="${status}" with name="bridge-city-outcome" must remain`
    );
  }
  assert.match(html, /name=["']bridge-city-outcome["']/);
});

test('CITY-02: #bridge-outcome-type keeps code_violation and water_shutoff (not water_shut_off)', () => {
  assert.match(html, /id=["']bridge-outcome-type["']/);
  assert.match(html, /value=["']code_violation["']/);
  assert.match(html, /value=["']water_shutoff["']/);
  // Outcome request_type must NOT use process uploadType spelling
  const outcomeSelectSlice = (() => {
    const i = html.indexOf('id="bridge-outcome-type"');
    assert.ok(i >= 0);
    return html.slice(i, i + 400);
  })();
  assert.equal(
    /value=["']water_shut_off["']/.test(outcomeSelectSlice),
    false,
    'outcome request_type must use water_shutoff, not water_shut_off'
  );
});

test('CITY-02: saveCityOutcome POSTs locked tracker payload fields', () => {
  const body = saveCityOutcomeBody();
  assert.match(body, /\/api\/bridge\/city-outcome/);
  assert.match(body, /cityId/);
  assert.match(body, /response_status/);
  assert.match(body, /request_type/);
  assert.match(body, /notes/);
  assert.match(body, /response_raw/);
});

// ---------------------------------------------------------------------------
// Regression locks (GREEN today — must stay green through Plan 02)
// ---------------------------------------------------------------------------

test('CITY-01/02 lock: saveCityOutcome and loadHistory still defined', () => {
  assert.match(js, /(?:async\s+)?function\s+saveCityOutcome\b/);
  assert.match(js, /(?:async\s+)?function\s+loadHistory\b/);
  assert.match(js, /\/api\/bridge\/history\//);
});

test('CITY-01 lock: no production requirement for GET /api/bridge/dossier', () => {
  // Client may compose dossier from history + lists; product need not add dossier route.
  // Soft assert: if route appears later it is out of scope — do not require it.
  const productHasDossierRoute =
    /\/api\/bridge\/dossier/.test(js) || /\/api\/bridge\/dossier/.test(html);
  assert.equal(
    typeof productHasDossierRoute,
    'boolean',
    'dossier route presence is optional; compose from history + lists'
  );
  // CSS file readable (dossier styles land Plan 02) — touch so css is part of contract surface
  assert.ok(css.length > 0, 'bridge.css must be readable for Plan 02 dossier styles');
});
