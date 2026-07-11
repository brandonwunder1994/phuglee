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
