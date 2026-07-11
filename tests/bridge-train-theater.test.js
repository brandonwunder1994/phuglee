/**
 * Superpower Train Theater — THTR-01 contracts.
 * Static HTML/JS scan + pure BridgeTrain.countOpenTrainGroups via vm.
 * Presentation only — no decision API / processUpload engine rewrites.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BRIDGE_HTML = path.join(ROOT, 'public', 'bridge.html');
const BRIDGE_JS = path.join(ROOT, 'public', 'js', 'bridge.js');
const BRIDGE_TRAIN_JS = path.join(ROOT, 'public', 'js', 'bridge-train.js');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

function readHtml() {
  return fs.readFileSync(BRIDGE_HTML, 'utf8');
}

function readBridgeJs() {
  return fs.readFileSync(BRIDGE_JS, 'utf8');
}

function readTrainJs() {
  return fs.readFileSync(BRIDGE_TRAIN_JS, 'utf8');
}

/** Load pure train helpers for unit tests (same pattern as bridge-train-ux). */
function loadBridgeTrain(opts = {}) {
  const store = new Map();
  if (opts.sessionUser !== undefined && opts.sessionUser !== null) {
    store.set('phuglee_session', String(opts.sessionUser));
  }

  const sessionStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  const windowObj = {
    PhugleeSession: {
      getSessionUser() {
        return store.get('phuglee_session') || '';
      }
    }
  };

  const sandbox = {
    window: windowObj,
    sessionStorage,
    console,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Error,
    Set
  };

  const src = readTrainJs();
  vm.runInNewContext(src, sandbox);
  assert.ok(sandbox.window.BridgeTrain, 'must export window.BridgeTrain');
  return sandbox.window.BridgeTrain;
}

// ─── THTR-01: helper source lock ─────────────────────────────────────────────

test('THTR-01: bridge-train.js defines and exports countOpenTrainGroups', () => {
  const src = readTrainJs();
  assert.ok(
    /function\s+countOpenTrainGroups\s*\(/.test(src) || /countOpenTrainGroups\s*[:=]/.test(src),
    'bridge-train.js must define countOpenTrainGroups'
  );
  assert.ok(
    /countOpenTrainGroups\s*:/.test(src) || /BridgeTrain\.countOpenTrainGroups\s*=/.test(src),
    'countOpenTrainGroups must be exported on BridgeTrain'
  );
});

// ─── THTR-01: pure unit ──────────────────────────────────────────────────────

test('THTR-01: countOpenTrainGroups pure — undecided only, ignores search', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  assert.ok(typeof api.countOpenTrainGroups === 'function', 'must export countOpenTrainGroups');

  const data = {
    reviewGroups: {
      distressed: [
        { groupId: 'a', section: 'distressed' },
        { groupId: 'b', section: 'distressed' }
      ],
      notDistressed: [
        { groupId: 'c', section: 'not_distressed' }
      ]
    }
  };

  // 1 decided of 3 → 2 open
  assert.equal(api.countOpenTrainGroups(data, new Set(['a'])), 2);

  // empty / missing data → 0
  assert.equal(api.countOpenTrainGroups(null, new Set()), 0);
  assert.equal(api.countOpenTrainGroups({}, new Set()), 0);
  assert.equal(api.countOpenTrainGroups(undefined, null), 0);

  // all decided → 0
  assert.equal(api.countOpenTrainGroups(data, new Set(['a', 'b', 'c'])), 0);

  // none decided → 3
  assert.equal(api.countOpenTrainGroups(data, new Set()), 3);
});

// ─── THTR-01: process → train pivot (static) ─────────────────────────────────

test('THTR-01: bridge.js forceTrainTheater pivot on process path', () => {
  const js = readBridgeJs();

  assert.ok(
    /forceTrainTheater/.test(js),
    'bridge.js must declare forceTrainTheater (or equivalent theater force flag)'
  );

  // processUpload success region: clearTrainDecidedKeys then force flag before renderResults
  const clearIdx = js.indexOf('clearTrainDecidedKeys()');
  assert.ok(clearIdx !== -1, 'process path still calls clearTrainDecidedKeys()');

  // Prefer the processUpload success block (near clearTrainDecidedKeys after trainUndoStack reset)
  const processRegion = js.slice(Math.max(0, clearIdx - 80), clearIdx + 600);
  assert.ok(
    /forceTrainTheater\s*=\s*true/.test(processRegion) || /forceTrainTheater\s*=\s*true/.test(js),
    'process success must set forceTrainTheater = true'
  );

  // renderResults admin branch pivots via open count + setResultsMode('train')
  assert.ok(
    /countOpenTrainGroups/.test(js),
    'bridge.js must use countOpenTrainGroups (or call BridgeTrain.countOpenTrainGroups)'
  );
  assert.ok(
    /setResultsMode\s*\(\s*[^)]*['"]train['"]/.test(js) ||
      /setResultsMode\s*\(\s*openCount\s*>\s*0\s*\?\s*['"]train['"]/.test(js),
    'bridge.js must setResultsMode to train when open groups force theater'
  );
  assert.ok(
    /updateTrainMissionHeader/.test(js),
    'bridge.js must update mission header (updateTrainMissionHeader)'
  );
});

// ─── THTR-01: mission DOM static ─────────────────────────────────────────────

test('THTR-01: bridge.html mission header inside train wrap before toolbar', () => {
  const html = readHtml();

  assert.ok(html.includes('id="bridge-train-mission"'), 'must have id="bridge-train-mission"');
  assert.ok(html.includes('id="bridge-train-open-count"'), 'must have id="bridge-train-open-count"');
  assert.ok(html.includes('id="bridge-train-kept-count"'), 'must have id="bridge-train-kept-count"');

  const wrapIdx = html.indexOf('id="bridge-train-wrap"');
  const missionIdx = html.indexOf('id="bridge-train-mission"');
  const toolbarIdx = html.indexOf('id="bridge-results-toolbar"');
  const modeTablistIdx = html.indexOf('bridge-results-mode');

  assert.ok(wrapIdx !== -1, 'train wrap present');
  assert.ok(missionIdx !== -1, 'mission present');
  assert.ok(toolbarIdx !== -1, 'toolbar present');

  // Mission after wrap open, before results toolbar
  assert.ok(missionIdx > wrapIdx, 'mission after bridge-train-wrap open');
  assert.ok(missionIdx < toolbarIdx, 'mission before bridge-results-toolbar');

  // Prefer mission before mode tablist (plan: before .bridge-results-mode)
  if (modeTablistIdx !== -1) {
    assert.ok(
      missionIdx < modeTablistIdx,
      'mission header should appear before results-mode tablist'
    );
  }
});

// ─── THTR-03 carry-forward: mission inside wrap only ─────────────────────────

test('THTR-03: mission markup lives inside #bridge-train-wrap region', () => {
  const html = readHtml();
  const wrapOpen = html.indexOf('id="bridge-train-wrap"');
  assert.ok(wrapOpen !== -1, 'wrap present');

  // Find the wrap's opening tag end, then the matching close for this block.
  // Heuristic: mission must sit after wrap open and before the next sibling toolbar
  // and before the wrap's closing </div> that precedes the toolbar.
  const missionIdx = html.indexOf('id="bridge-train-mission"');
  const toolbarIdx = html.indexOf('id="bridge-results-toolbar"');
  assert.ok(missionIdx > wrapOpen, 'mission after wrap open');
  assert.ok(missionIdx < toolbarIdx, 'mission before toolbar (wrap sibling)');

  // Slice from wrap open to toolbar — mission must be in that region (inside wrap)
  const wrapRegion = html.slice(wrapOpen, toolbarIdx);
  assert.ok(
    wrapRegion.includes('id="bridge-train-mission"'),
    'mission must be inside wrap→toolbar region (THTR-03 fail-closed)'
  );
  assert.ok(
    wrapRegion.includes('id="bridge-train-open-count"'),
    'open-count element inside wrap region'
  );
});

// ─── Hygiene: no banned Analyze CTAs in theater files ────────────────────────

test('THTR-01 hygiene: no banned Analyze push CTAs in theater files', () => {
  const html = readHtml();
  const js = readBridgeJs();
  const trainJs = readTrainJs();
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `bridge.js must not contain "${banned}"`);
    assert.equal(trainJs.includes(banned), false, `bridge-train.js must not contain "${banned}"`);
  }
});

// ─── 66-02 THTR-01: live mission HUD on decision path ────────────────────────

test('THTR-01 live HUD: commitTrainDecisionLocally wires mission + status + KPI', () => {
  const js = readBridgeJs();

  const commitIdx = js.indexOf('function commitTrainDecisionLocally');
  assert.ok(commitIdx !== -1, 'commitTrainDecisionLocally must exist');
  // Through end of function (persistTrainBrainDecision follows)
  const commitEnd = js.indexOf('async function persistTrainBrainDecision', commitIdx);
  const commitRegion = js.slice(commitIdx, commitEnd !== -1 ? commitEnd : commitIdx + 6000);

  assert.ok(
    /updateTrainMissionHeader\s*\(/.test(commitRegion),
    'commitTrainDecisionLocally must call updateTrainMissionHeader(remaining, keptNow)'
  );
  assert.ok(
    /Decision saved · \$\{keptNow\.toLocaleString\(\)\} kept/.test(commitRegion) ||
      /Decision saved · .* kept/.test(commitRegion),
    'status templates must preserve Decision saved · {kept} copy'
  );
  assert.ok(
    /refreshTrainUiAfterDecision\s*\(/.test(commitRegion),
    'decision path must call refreshTrainUiAfterDecision (KPI + light re-render)'
  );

  // refreshTrainUiAfterDecision still refreshes KPIs and mission (not wiped)
  const refreshIdx = js.indexOf('function refreshTrainUiAfterDecision');
  assert.ok(refreshIdx !== -1, 'refreshTrainUiAfterDecision must exist');
  const refreshRegion = js.slice(refreshIdx, refreshIdx + 900);
  assert.ok(
    /renderKpis\s*\(/.test(refreshRegion),
    'refreshTrainUiAfterDecision must call renderKpis'
  );
  assert.ok(
    /updateTrainMissionHeader\s*\(/.test(refreshRegion),
    'refreshTrainUiAfterDecision must re-sync mission open/kept (decision + undo light path)'
  );

  // Decision POST body still uses clientApplied — no invented kept-count API fields
  assert.ok(
    /clientApplied\s*:\s*true/.test(commitRegion),
    'persist meta body must still include clientApplied: true'
  );
  assert.ok(
    !/body\s*:\s*\{[^}]*keptCount\s*:/.test(commitRegion) &&
      !/body\s*:\s*\{[^}]*openCount\s*:/.test(commitRegion),
    'decision body must not invent keptCount/openCount API keys'
  );
});

test('THTR-01 live HUD: undo path refreshes mission counts after restore', () => {
  const js = readBridgeJs();
  const undoIdx = js.indexOf('async function onTrainUndo');
  assert.ok(undoIdx !== -1, 'onTrainUndo must exist');
  const undoRegion = js.slice(undoIdx, undoIdx + 2800);

  // After snapshot restore, mission must update — either direct call or via refresh helper
  const restoresThenRefreshes =
    /applyTrainSnapshot[\s\S]{0,400}refreshTrainUiAfterDecision\s*\(/.test(undoRegion) ||
    /applyTrainSnapshot[\s\S]{0,400}updateTrainMissionHeader\s*\(/.test(undoRegion);
  assert.ok(
    restoresThenRefreshes,
    'undo success must apply snapshot then refresh UI / mission counts'
  );
  // refreshTrainUiAfterDecision (called on undo) owns mission re-sync — locked above
  assert.ok(
    /refreshTrainUiAfterDecision\s*\(/.test(undoRegion),
    'onTrainUndo must call refreshTrainUiAfterDecision after restore'
  );
});

// ─── 66-02 theater chrome: CSS + is-theater class hierarchy ──────────────────

test('THTR-01 theater chrome: mission CSS + theater demotion selectors', () => {
  const cssPath = path.join(ROOT, 'public', 'css', 'bridge.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    /\.bridge-train-mission\b/.test(css),
    'bridge.css must style .bridge-train-mission'
  );
  assert.ok(
    /\.bridge-train-mission-kicker\b/.test(css),
    'bridge.css must style .bridge-train-mission-kicker'
  );
  assert.ok(
    /\.bridge-results-mode--theater\b/.test(css) || /\.is-theater\b/.test(css),
    'bridge.css must define theater chrome (.bridge-results-mode--theater or .is-theater)'
  );
  assert.ok(
    /bridge-results-mode--theater[\s\S]{0,400}data-mode=["']train["']/.test(css) ||
      /bridge-results-mode--theater[\s\S]{0,400}\[data-mode=["']train["']\]/.test(css),
    'theater CSS must emphasize Train tab'
  );
  assert.ok(
    /bridge-results-mode--theater[\s\S]{0,600}data-mode=["']kept["']/.test(css) ||
      /bridge-results-mode--theater[\s\S]{0,600}\[data-mode=["']kept["']\]/.test(css),
    'theater CSS must demote Kept tab (escape hatch remains)'
  );
});

test('THTR-01 theater chrome: bridge.js toggles is-theater / bridge-results-mode--theater', () => {
  const js = readBridgeJs();
  assert.ok(
    /updateTrainTheaterChrome\s*\(/.test(js) || /is-theater/.test(js),
    'bridge.js must toggle theater chrome (updateTrainTheaterChrome or is-theater)'
  );
  assert.ok(
    /classList\.toggle\(\s*['"]is-theater['"]/.test(js) ||
      /classList\.add\(\s*['"]is-theater['"]/.test(js),
    'must toggle is-theater on train wrap'
  );
  assert.ok(
    /bridge-results-mode--theater/.test(js),
    'must toggle bridge-results-mode--theater on mode rail'
  );
  // Decision path status still locked after chrome work
  assert.ok(
    /Decision saved · \$\{keptNow\.toLocaleString\(\)\} kept/.test(js) ||
      /Decision saved · .* kept/.test(js),
    'Decision saved · kept strings must remain after theater chrome'
  );
});

// ─── 66-03 THTR-02: brain demoted to Rules armory ────────────────────────────

test('THTR-02: brain control is Rules armory (not equal Filter brain peer)', () => {
  const html = readHtml();

  assert.ok(html.includes('id="bridge-mode-brain"'), 'must keep id="bridge-mode-brain"');
  assert.ok(
    /id="bridge-mode-brain"[^>]*>\s*Rules armory\s*</.test(html) ||
      /id="bridge-mode-brain"[\s\S]{0,120}>\s*Rules armory\s*</.test(html),
    'brain tab visible label must be Rules armory'
  );
  assert.ok(html.includes('id="bridge-brain-panel"'), 'must keep id="bridge-brain-panel"');
  assert.ok(
    /data-mode=["']brain["']/.test(html),
    'brain tab must keep data-mode="brain" for setResultsMode'
  );
  assert.ok(
    /aria-controls=["']bridge-brain-panel["']/.test(html),
    'brain tab must aria-controls bridge-brain-panel'
  );

  // Equal peer ban: tab label must not still say Filter brain
  const brainBtn = html.match(
    /<button[^>]*id="bridge-mode-brain"[^>]*>[\s\S]*?<\/button>/
  );
  assert.ok(brainBtn, 'brain mode button present');
  assert.ok(
    !/>\s*Filter brain\s*</.test(brainBtn[0]),
    'brain tab label must not be equal-peer "Filter brain"'
  );
  assert.ok(
    /Rules armory/.test(brainBtn[0]),
    'brain button text must include Rules armory'
  );
});

test('THTR-02: theater CSS demotes armory; loadBrainPanel path intact', () => {
  const cssPath = path.join(ROOT, 'public', 'css', 'bridge.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = readBridgeJs();

  const armoryDemotion =
    /bridge-results-mode--theater[\s\S]{0,800}bridge-mode-tab--armory/.test(css) ||
    /bridge-results-mode--theater[\s\S]{0,800}data-mode=["']brain["']/.test(css) ||
    /bridge-results-mode--theater[\s\S]{0,800}\[data-mode=["']brain["']\]/.test(css) ||
    /\.bridge-mode-tab--armory/.test(css);
  assert.ok(
    armoryDemotion,
    'CSS must demote armory/brain under theater (armory class or data-mode=brain)'
  );

  assert.ok(
    /function\s+loadBrainPanel\s*\(/.test(js),
    'bridge.js must still define loadBrainPanel'
  );
  assert.ok(
    /setResultsMode\s*\(\s*['"]brain['"]\s*\)/.test(js) ||
      /mode\s*===\s*['"]brain['"]/.test(js) ||
      /data-mode/.test(js),
    'setResultsMode brain path / data-mode wiring must remain'
  );
  // loadBrainPanel still invoked from brain mode
  assert.ok(
    /loadBrainPanel\s*\(/.test(js),
    'loadBrainPanel must still be called (admin armory still loadable)'
  );
});

// ─── 66-03 THTR-03: non-admin never sees train/brain chrome ──────────────────

test('THTR-03: train wrap hidden by default; mission only inside wrap', () => {
  const html = readHtml();

  // Opening tag for train wrap must include hidden attribute
  const wrapTag = html.match(/<div[^>]*id="bridge-train-wrap"[^>]*>/);
  assert.ok(wrapTag, 'bridge-train-wrap opening tag present');
  assert.ok(
    /\bhidden\b/.test(wrapTag[0]),
    'train wrap opening tag must have hidden (default fail-closed)'
  );

  const wrapOpen = html.indexOf('id="bridge-train-wrap"');
  const missionIdx = html.indexOf('id="bridge-train-mission"');
  const modeBrainIdx = html.indexOf('id="bridge-mode-brain"');
  const brainPanelIdx = html.indexOf('id="bridge-brain-panel"');
  const toolbarIdx = html.indexOf('id="bridge-results-toolbar"');

  assert.ok(missionIdx > wrapOpen, 'mission after wrap open');
  assert.ok(modeBrainIdx > wrapOpen, 'brain tab after wrap open');
  assert.ok(brainPanelIdx > wrapOpen, 'brain panel after wrap open');
  assert.ok(missionIdx < toolbarIdx, 'mission before results toolbar sibling');
  assert.ok(modeBrainIdx < toolbarIdx, 'brain chrome before toolbar (inside wrap region)');
  assert.ok(brainPanelIdx < toolbarIdx, 'brain panel before toolbar (inside wrap region)');
});

test('THTR-03: non-admin renderResults clears train; isBridgeAdmin gates clicks', () => {
  const js = readBridgeJs();

  // renderResults non-admin branch: hide wrap + clear containers
  const renderIdx = js.indexOf('function renderResults');
  assert.ok(renderIdx !== -1, 'renderResults must exist');
  // Approximate region: from renderResults through next top-level async function or large chunk
  const renderRegion = js.slice(renderIdx, renderIdx + 12000);

  assert.ok(
    /isBridgeAdmin\s*\(\s*\)/.test(renderRegion),
    'renderResults must gate on isBridgeAdmin'
  );
  assert.ok(
    /setHidden\s*\(\s*trainWrap\s*,\s*true\s*\)/.test(renderRegion) ||
      /setHidden\s*\(\s*trainWrap\s*,\s*!0\s*\)/.test(renderRegion),
    'non-admin must setHidden(trainWrap, true)'
  );
  assert.ok(
    /bridge-train-distressed/.test(renderRegion) &&
      /innerHTML\s*=\s*['"]['"]/.test(renderRegion),
    'non-admin path must clear train containers'
  );

  // Mission header never unhides wrap for non-admin
  const missionFn = js.indexOf('function updateTrainMissionHeader');
  assert.ok(missionFn !== -1, 'updateTrainMissionHeader must exist');
  const missionRegion = js.slice(missionFn, missionFn + 900);
  assert.ok(
    /isBridgeAdmin\s*\(\s*\)/.test(missionRegion),
    'updateTrainMissionHeader must check isBridgeAdmin'
  );
  // Non-admin early return must not setHidden(trainWrap, false)
  assert.ok(
    !/setHidden\s*\(\s*trainWrap\s*,\s*false\s*\)/.test(missionRegion),
    'mission header must not unhide trainWrap'
  );

  // Click / mode handlers gate isBridgeAdmin
  assert.ok(
    /isBridgeAdmin\s*\(\s*\)/.test(js),
    'bridge.js must use isBridgeAdmin on train/brain paths'
  );
  // Mode tab delegation near train wrap
  const modeClickRegion =
    js.includes("data-mode") && js.includes('isBridgeAdmin')
      ? js
      : '';
  assert.ok(modeClickRegion, 'mode + isBridgeAdmin wiring present');
  assert.ok(
    /if\s*\(\s*!tab\s*\|\|\s*!isBridgeAdmin\s*\(\s*\)\s*\)\s*return/.test(js) ||
      /!isBridgeAdmin\s*\(\s*\)\s*\)\s*return/.test(js),
    'tab/decision handlers must early-return when !isBridgeAdmin'
  );
});
