/**
 * Filter Train brain UX — shell structure + admin gate / card helpers (TRAIN-01–04).
 * Static HTML/CSS contract + pure BridgeTrain helpers via vm; no browser automation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BRIDGE_HTML = path.join(ROOT, 'public', 'bridge.html');
const BRIDGE_CSS = path.join(ROOT, 'public', 'css', 'bridge.css');
const BRIDGE_JS = path.join(ROOT, 'public', 'js', 'bridge.js');
const BRIDGE_TRAIN_JS = path.join(ROOT, 'public', 'js', 'bridge-train.js');

const SAMPLE_GROUP = {
  groupId: 'g1',
  section: 'distressed',
  violationTypeLabel: 'Vacant Structure',
  violationTypeKey: 'vacant structure',
  count: 3,
  rowIds: ['r1', 'r2', 'r3'],
  sampleAddresses: ['1 Main St'],
  matchedIndicators: ['vacant', 'boarded'],
  descriptionSamples: ['Boarded vacant home <script>'],
  isSingleton: false
};

function readHtml() {
  return fs.readFileSync(BRIDGE_HTML, 'utf8');
}

function readCss() {
  return fs.readFileSync(BRIDGE_CSS, 'utf8');
}

function readBridgeJs() {
  return fs.readFileSync(BRIDGE_JS, 'utf8');
}

/** Extract the opening tag that declares an id (best-effort for static HTML). */
function openingTagForId(html, id) {
  const re = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[0] : null;
}

/**
 * Load pure train helpers for unit tests.
 * Prefers public/js/bridge-train.js; falls back to BridgeTrain marker block in bridge.js.
 */
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

  if (opts.useSettings) {
    windowObj.PhugleeSettings = {
      isAdmin() {
        return opts.settingsAdmin === true;
      }
    };
  }

  // Share host constructors so deepEqual works across the vm boundary
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
    Error
  };

  let src;
  if (fs.existsSync(BRIDGE_TRAIN_JS)) {
    src = fs.readFileSync(BRIDGE_TRAIN_JS, 'utf8');
  } else {
    const full = readBridgeJs();
    const startMarker = '// --- BridgeTrain pure helpers ---';
    const endMarker = '// --- end BridgeTrain pure helpers ---';
    const start = full.indexOf(startMarker);
    const end = full.indexOf(endMarker);
    assert.ok(start !== -1, 'bridge.js must contain BridgeTrain pure helpers marker (or ship bridge-train.js)');
    assert.ok(end !== -1, 'bridge.js must close BridgeTrain pure helpers marker');
    const escMatch = full.match(/function esc\(text\) \{[\s\S]*?\n  \}/);
    assert.ok(escMatch, 'bridge.js must define esc() for card HTML');
    src = `${escMatch[0]}\n${full.slice(start, end + endMarker.length)}`;
  }

  vm.runInNewContext(src, sandbox);
  assert.ok(sandbox.window.BridgeTrain, 'must export window.BridgeTrain');
  return sandbox.window.BridgeTrain;
}

// ─── Shell structure (plan 01) ───────────────────────────────────────────────

test('bridge train wrap exists and is hidden by default', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-train-wrap"'), 'must declare id="bridge-train-wrap"');
  const open = openingTagForId(html, 'bridge-train-wrap');
  assert.ok(open, 'must find opening tag for bridge-train-wrap');
  assert.ok(/\bhidden\b/.test(open), 'bridge-train-wrap must include hidden attribute (TRAIN-03 fail-closed)');
});

test('bridge train mode tabs present', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-mode-kept"'), 'must have bridge-mode-kept');
  assert.ok(html.includes('id="bridge-mode-train"'), 'must have bridge-mode-train');
  assert.ok(/role=["']tablist["']/.test(html), 'must have role="tablist"');
  assert.ok(html.includes('Train brain'), 'must show Train brain label');
  assert.ok(html.includes('Kept list'), 'must show Kept list label');
  assert.ok(/role=["']tab["']/.test(html), 'mode buttons must use role="tab"');
});

test('bridge train has distressed and not-distressed sections', () => {
  const html = readHtml();
  assert.ok(html.includes('id="train-distressed-h"'), 'must have train-distressed-h heading');
  assert.ok(html.includes('id="bridge-train-distressed"'), 'must have bridge-train-distressed container');
  assert.ok(html.includes('id="train-fn-h"'), 'must have train-fn-h heading');
  assert.ok(html.includes('id="bridge-train-not-distressed"'), 'must have bridge-train-not-distressed container');
  assert.ok(html.includes('Marked distressed'), 'distressed section label');
  assert.ok(html.includes('Not marked distressed'), 'not-distressed section label');
});

test('bridge train status line present', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-train-status"'), 'must have bridge-train-status');
  assert.ok(html.includes('id="bridge-train-panel"'), 'must have bridge-train-panel');
  const statusOpen = openingTagForId(html, 'bridge-train-status');
  assert.ok(statusOpen, 'must find opening tag for bridge-train-status');
  assert.ok(/role=["']status["']/.test(statusOpen), 'bridge-train-status must have role="status"');
  const panelOpen = openingTagForId(html, 'bridge-train-panel');
  assert.ok(panelOpen, 'must find opening tag for bridge-train-panel');
  assert.ok(/\bhidden\b/.test(panelOpen), 'bridge-train-panel must be hidden by default');
});

test('bridge train wrap nests inside results panel before toolbar', () => {
  const html = readHtml();
  const resultsIdx = html.indexOf('id="bridge-results-panel"');
  const trainIdx = html.indexOf('id="bridge-train-wrap"');
  const toolbarIdx = html.indexOf('id="bridge-results-toolbar"');
  assert.ok(resultsIdx !== -1, 'results panel present');
  assert.ok(trainIdx !== -1, 'train wrap present');
  assert.ok(toolbarIdx !== -1, 'results toolbar present');
  assert.ok(trainIdx > resultsIdx, 'train wrap is after results panel open');
  assert.ok(trainIdx < toolbarIdx, 'train wrap is before results toolbar');
});

test('bridge train CSS defines group card vocabulary', () => {
  const css = readCss();
  const required = [
    '.bridge-train-group',
    '.bridge-results-mode',
    '.bridge-mode-tab',
    '.bridge-train-signals',
    '.bridge-train-descriptions',
    '.bridge-train-actions',
    '.bridge-train-deny',
  ];
  for (const sel of required) {
    assert.ok(css.includes(sel), `CSS must define ${sel}`);
  }
  assert.ok(
    css.includes('.bridge-train-approve') || css.includes('.bridge-train-actions'),
    'CSS must define .bridge-train-approve or .bridge-train-actions'
  );
});

test('bridge train CSS reuses existing design tokens (no new palette)', () => {
  const css = readCss();
  const trainSliceStart = css.indexOf('.bridge-results-mode');
  assert.ok(trainSliceStart !== -1, 'train mode styles present');
  const trainSlice = css.slice(trainSliceStart);
  const usesTokens =
    trainSlice.includes('var(--radius-')
    || trainSlice.includes('var(--phuglee-')
    || trainSlice.includes('rgba(0, 0, 0')
    || trainSlice.includes('rgba(174, 163, 143');
  assert.ok(usesTokens, 'train CSS should reuse --radius-*/--phuglee-* or existing rgba glass patterns');
});

test('bridge.html cache-busts bridge.css', () => {
  const html = readHtml();
  assert.ok(
    /bridge\.css\?v=\d+/.test(html),
    'bridge.html must link bridge.css with ?v= cache bust'
  );
  const m = html.match(/bridge\.css\?v=(\d+)/);
  assert.ok(m, 'extract cache-bust version');
  const ver = Number(m[1]);
  assert.ok(ver >= 6, `bridge.css cache bust should be >= 6 after train shell (got ${ver})`);
});

// ─── Pure helpers (plan 02) ──────────────────────────────────────────────────

test('isBridgeAdmin true only for exact session user admin', () => {
  assert.equal(loadBridgeTrain({ sessionUser: 'admin' }).isBridgeAdmin(), true);
  assert.equal(loadBridgeTrain({ sessionUser: 'user1' }).isBridgeAdmin(), false);
  assert.equal(loadBridgeTrain({ sessionUser: '' }).isBridgeAdmin(), false);
  assert.equal(loadBridgeTrain({ sessionUser: 'Admin' }).isBridgeAdmin(), false);
  assert.equal(loadBridgeTrain({ sessionUser: 'admin@phuglee.com' }).isBridgeAdmin(), false);
});

test('getReviewGroups returns empty arrays when data or reviewGroups missing', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  function assertEmpty(g, label) {
    assert.ok(g && typeof g === 'object', `${label}: object`);
    assert.ok(Array.isArray(g.distressed), `${label}: distressed array`);
    assert.ok(Array.isArray(g.notDistressed), `${label}: notDistressed array`);
    assert.equal(g.distressed.length, 0, `${label}: distressed empty`);
    assert.equal(g.notDistressed.length, 0, `${label}: notDistressed empty`);
  }
  assertEmpty(api.getReviewGroups(undefined), 'undefined');
  assertEmpty(api.getReviewGroups(null), 'null');
  assertEmpty(api.getReviewGroups({}), '{}');
  assertEmpty(api.getReviewGroups({ reviewGroups: null }), 'reviewGroups null');
  assertEmpty(api.getReviewGroups({ reviewGroups: {} }), 'reviewGroups {}');
});

test('getReviewGroups maps distressed and notDistressed arrays when present', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  const groups = api.getReviewGroups({
    reviewGroups: {
      distressed: [{ groupId: 'a' }],
      notDistressed: [{ groupId: 'b' }, { groupId: 'c' }]
    }
  });
  assert.equal(groups.distressed.length, 1);
  assert.equal(groups.notDistressed.length, 2);
  assert.equal(groups.distressed[0].groupId, 'a');
});

// ─── Fade-queue decision keys (regression: first Approve/Deny must not wipe list) ─

test('trainDecisionKey prefers groupId over shared violationTypeKey', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  assert.ok(typeof api.trainDecisionKey === 'function', 'must export trainDecisionKey');

  // Shared __unknown__ type key with distinct groupIds (description clusters)
  const a = {
    groupId: 'g_unknown_fence',
    section: 'not_distressed',
    violationTypeKey: '__unknown__',
    descriptionKey: 'fence permit only'
  };
  const b = {
    groupId: 'g_unknown_pool',
    section: 'not_distressed',
    violationTypeKey: '__unknown__',
    descriptionKey: 'pool permit expired'
  };
  assert.equal(api.trainDecisionKey(a), 'g_unknown_fence');
  assert.equal(api.trainDecisionKey(b), 'g_unknown_pool');
  assert.notEqual(api.trainDecisionKey(a), api.trainDecisionKey(b));

  // Known type still keys by groupId (section is encoded in groupId server-side)
  assert.equal(
    api.trainDecisionKey({
      groupId: 'g_weeds_d',
      section: 'distressed',
      violationTypeKey: 'weeds'
    }),
    'g_weeds_d'
  );
});

test('filterUndecidedTrainGroups removes only the decided groupId, not all __unknown__', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  assert.ok(typeof api.filterUndecidedTrainGroups === 'function');

  const list = [
    {
      groupId: 'g1',
      section: 'not_distressed',
      violationTypeKey: '__unknown__',
      descriptionKey: 'fence'
    },
    {
      groupId: 'g2',
      section: 'not_distressed',
      violationTypeKey: '__unknown__',
      descriptionKey: 'pool'
    },
    {
      groupId: 'g3',
      section: 'not_distressed',
      violationTypeKey: '__unknown__',
      descriptionKey: 'driveway'
    },
    {
      groupId: 'g4',
      section: 'distressed',
      violationTypeKey: 'vacant structure'
    }
  ];

  const decided = new Set([api.trainDecisionKey(list[0])]);
  const remaining = api.filterUndecidedTrainGroups(list, decided);

  assert.equal(remaining.length, 3, 'only one card should leave the queue');
  assert.deepEqual(
    remaining.map((g) => g.groupId),
    ['g2', 'g3', 'g4']
  );

  // Old bug: keying by violationTypeKey would wipe all three __unknown__ cards
  const badKeyBug = list.filter((g) => {
    const typeKey = g.violationTypeKey != null ? String(g.violationTypeKey).trim() : '';
    return typeKey !== '__unknown__';
  });
  assert.equal(badKeyBug.length, 1, 'sanity: type-key filtering would leave only 1');
  assert.ok(remaining.length > badKeyBug.length, 'groupId key keeps sibling __unknown__ cards');
});

test('renderTrainGroupCard includes label, count, signals, samples, and Approve/Deny', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  const html = api.renderTrainGroupCard(SAMPLE_GROUP);
  assert.ok(html.includes('Vacant Structure'), 'violationTypeLabel');
  assert.ok(html.includes('×3') || html.includes('×' + '3'), 'count badge');
  assert.ok(html.includes('vacant'), 'matchedIndicators chip');
  assert.ok(html.includes('boarded'), 'matchedIndicators chip');
  assert.ok(html.includes('Boarded vacant home'), 'descriptionSamples');
  assert.ok(html.includes('data-group-id="g1"') || html.includes("data-group-id=\"g1\""), 'data-group-id');
  assert.ok(html.includes('data-section="distressed"'), 'data-section');
  assert.ok(html.includes('data-action="approve"'), 'approve action');
  assert.ok(html.includes('data-action="deny"'), 'deny action');
  assert.ok(html.includes('✓ Approve'), 'Approve label');
  assert.ok(html.includes('✗ Deny'), 'Deny label');
});

test('renderTrainGroupCard escapes HTML in labels and samples (XSS)', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  const html = api.renderTrainGroupCard(SAMPLE_GROUP);
  assert.ok(!html.includes('<script>'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;') || html.includes('&lt;script'), 'script must be escaped');

  const xssGroup = {
    ...SAMPLE_GROUP,
    violationTypeLabel: 'Type <img src=x onerror=alert(1)>',
    descriptionSamples: ['Boarded vacant home <img src=x onerror=alert(1)>'],
    matchedIndicators: ['<b>bad</b>']
  };
  const xssHtml = api.renderTrainGroupCard(xssGroup);
  assert.ok(!xssHtml.includes('<img src=x'), 'raw img must not appear');
  assert.ok(xssHtml.includes('&lt;img') || xssHtml.includes('&lt;b&gt;'), 'HTML must be escaped via esc()');
});

// ─── Source contracts (plan 02) ──────────────────────────────────────────────

test('bridge.js source uses getSessionUser for train admin (not getUsername)', () => {
  const src = readBridgeJs();
  assert.ok(src.includes('isBridgeAdmin'), 'must define isBridgeAdmin');
  assert.ok(src.includes('getSessionUser'), 'must use getSessionUser');
  // Train admin path must not rely on nonexistent getUsername
  const trainSlice = src.includes('function isBridgeAdmin')
    ? src.slice(src.indexOf('function isBridgeAdmin'), src.indexOf('function isBridgeAdmin') + 800)
    : src;
  assert.ok(!/getUsername/.test(trainSlice), 'isBridgeAdmin must not call getUsername');
});

test('bridge.js source wires renderResults to train wrap and admin gate', () => {
  const src = readBridgeJs();
  assert.ok(src.includes('bridge-train-wrap'), 'renderResults path references bridge-train-wrap');
  assert.ok(src.includes('isBridgeAdmin'), 'admin gate present');
  assert.ok(src.includes('renderTrainGroups') || src.includes('renderTrainGroupCard'), 'train render path');
});

test('bridge.js source wires train decisions + undo stack (no fake success API)', () => {
  const src = readBridgeJs();
  assert.ok(
    src.includes('/api/bridge/brain/decisions'),
    'must POST real train decisions API'
  );
  assert.ok(
    src.includes('trainUndoStack') && src.includes('/api/bridge/brain/undo'),
    'must have trainUndoStack + server undo path'
  );
  assert.ok(
    src.includes('data-action') || src.includes("data-action"),
    'must wire data-action for approve/deny'
  );
  assert.ok(
    src.includes('onTrainDecision') || src.includes('submitTrainDecision'),
    'must have onTrainDecision / submitTrainDecision'
  );
});

test('bridge.js source clears train containers or hides wrap for non-admin', () => {
  const src = readBridgeJs();
  assert.ok(
    src.includes('bridge-train-distressed') && src.includes('bridge-train-not-distressed'),
    'must reference train containers'
  );
  // Non-admin path: hide wrap and/or clear innerHTML
  assert.ok(
    /innerHTML\s*=\s*['"]{2}/.test(src) || /setHidden\([^,]+,\s*true\)/.test(src),
    'non-admin path should clear containers or hide wrap'
  );
});

test('bridge.js render path includes matchedIndicators and descriptionSamples', () => {
  const bridgeSrc = readBridgeJs();
  const trainSrc = fs.existsSync(BRIDGE_TRAIN_JS)
    ? fs.readFileSync(BRIDGE_TRAIN_JS, 'utf8')
    : '';
  const combined = bridgeSrc + '\n' + trainSrc;
  assert.ok(combined.includes('matchedIndicators'), 'signals from matchedIndicators');
  assert.ok(combined.includes('descriptionSamples'), 'samples from descriptionSamples');
  assert.ok(
    combined.includes('data-action="approve"') || combined.includes("data-action=\"approve\""),
    'approve data-action in card HTML'
  );
  assert.ok(
    combined.includes('data-action="deny"') || combined.includes("data-action=\"deny\""),
    'deny data-action in card HTML'
  );
});

test('bridge.html cache-busts bridge.js at v>=10 after train logic', () => {
  const html = readHtml();
  assert.ok(/bridge\.js\?v=\d+/.test(html), 'bridge.js must have ?v= cache bust');
  const m = html.match(/bridge\.js\?v=(\d+)/);
  assert.ok(m, 'extract bridge.js version');
  const ver = Number(m[1]);
  assert.ok(ver >= 10, `bridge.js cache bust should be >= 10 after train UX (got ${ver})`);
});

test('bridge.js trainDecisionKey path prefers groupId (not type-key-first)', () => {
  const src = readBridgeJs();
  // Regression guard: old bug returned violationTypeKey before groupId, which
  // wiped every __unknown__ card when the first one was approved/denied.
  assert.ok(src.includes('trainDecisionKey'), 'must define trainDecisionKey');
  assert.ok(
    src.includes('BridgeTrain.trainDecisionKey') || src.includes('prefer groupId'),
    'must route through BridgeTrain.trainDecisionKey or document groupId preference'
  );
  // Must not reintroduce type-key-first ordering in the local fallback
  const fallbackStart = src.indexOf('// Fallback if bridge-train.js failed to load');
  assert.ok(fallbackStart !== -1, 'local fallback present');
  const fallbackSlice = src.slice(fallbackStart, fallbackStart + 500);
  const gidIdx = fallbackSlice.indexOf('group.groupId');
  const typeIdx = fallbackSlice.indexOf('group.violationTypeKey');
  assert.ok(gidIdx !== -1, 'fallback references groupId');
  assert.ok(typeIdx !== -1, 'fallback may still use typeKey as last resort');
  assert.ok(gidIdx < typeIdx, 'fallback must check groupId before violationTypeKey');
});

// ─── Phase 53: display-only short labels + LBL-03 no DOM scrape (RED until Plan 04) ───

const LONG_FULL_LABEL =
  'High Grass and Weeds — Sec. 12-34 of the municipal code regarding vegetation height limits on residential parcels';
const SHORT_DISPLAY = 'High Grass and Weeds';

test('LBL-01: renderTrainGroupCard prefers shortLabel as title; full label in title= tooltip', () => {
  const api = loadBridgeTrain({ sessionUser: 'admin' });
  const group = {
    ...SAMPLE_GROUP,
    shortLabel: SHORT_DISPLAY,
    violationTypeLabel: LONG_FULL_LABEL
  };
  const html = api.renderTrainGroupCard(group);

  // Primary title text uses short display label
  assert.ok(
    html.includes(SHORT_DISPLAY),
    'LBL-01: card HTML must include shortLabel text in the title area'
  );

  // Full wall must not be the primary visible title text when short differs
  // (title= tooltip is allowed to hold the full string)
  const titleDivMatch = html.match(
    /<div class="bridge-train-group-title"[^>]*>([\s\S]*?)<\/div>/
  );
  assert.ok(titleDivMatch, 'LBL-01: must render .bridge-train-group-title');
  const titleInner = titleDivMatch[1];
  // Visible text content (ignore attributes) should start with short, not full wall
  assert.ok(
    titleInner.includes(SHORT_DISPLAY),
    'LBL-01: title div inner HTML includes shortLabel'
  );
  assert.ok(
    !titleInner.includes('Sec. 12-34') && !titleInner.includes('municipal code'),
    'LBL-01: primary title text must NOT dump the full ordinance wall when shortLabel differs'
  );

  // Full label available via title= attribute (tooltip) on the title element
  assert.ok(
    /class="bridge-train-group-title"[^>]*title="/.test(html) ||
      /title="[^"]*High Grass and Weeds[^"]*Sec\. 12-34/.test(html) ||
      html.includes(`title="${LONG_FULL_LABEL}"`) ||
      html.includes('title="' + LONG_FULL_LABEL.replace(/—/g, '&#8212;')) ||
      /bridge-train-group-title[^>]*title=/.test(html),
    'LBL-01: full violationTypeLabel must appear in title= tooltip on the title element'
  );
  // Escaped or raw full label somewhere in a title attribute
  const titleAttrMatch = html.match(
    /class="bridge-train-group-title"[^>]*\btitle="([^"]*)"/
  );
  assert.ok(
    titleAttrMatch,
    'LBL-01: .bridge-train-group-title must have title="..." for full-label tooltip'
  );
  const tip = titleAttrMatch[1];
  assert.ok(
    tip.includes('High Grass') && (tip.includes('Sec') || tip.includes('municipal') || tip.length > SHORT_DISPLAY.length),
    `LBL-01: tooltip title attr must carry full label (got: ${tip.slice(0, 80)})`
  );
});

test('LBL-03: resolveTrainGroupFromCard must NOT scrape .bridge-train-group-title for violationTypeLabel', () => {
  const src = readBridgeJs();
  assert.ok(
    src.includes('function resolveTrainGroupFromCard'),
    'LBL-03: resolveTrainGroupFromCard must exist'
  );

  const fnStart = src.indexOf('function resolveTrainGroupFromCard');
  // Slice until next top-level function or end-marker
  const after = src.slice(fnStart);
  const endMarker = after.indexOf('// --- end BridgeTrain');
  const nextFn = after.indexOf('\n  function ', 10);
  const end =
    endMarker !== -1
      ? endMarker
      : nextFn !== -1
        ? nextFn
        : Math.min(after.length, 800);
  const fnBody = after.slice(0, end);

  // Forbidden: DOM scrape of short title into violationTypeLabel
  assert.ok(
    !fnBody.includes('.bridge-train-group-title'),
    'LBL-03: resolveTrainGroupFromCard must NOT query .bridge-train-group-title (short title would poison decisions)'
  );
  assert.ok(
    !/querySelector\s*\(\s*['"]\.bridge-train-group-title/.test(fnBody),
    'LBL-03: no querySelector(.bridge-train-group-title) in resolveTrainGroupFromCard'
  );
});

test('LBL-03: resolveTrainGroupFromCard fail-closed — miss returns null (no invented DOM label)', () => {
  const src = readBridgeJs();
  const fnStart = src.indexOf('function resolveTrainGroupFromCard');
  assert.ok(fnStart !== -1, 'LBL-03: resolveTrainGroupFromCard present');
  const after = src.slice(fnStart);
  const endMarker = after.indexOf('// --- end BridgeTrain');
  const nextFn = after.indexOf('\n  function ', 10);
  const end =
    endMarker !== -1
      ? endMarker
      : nextFn !== -1
        ? nextFn
        : Math.min(after.length, 800);
  const fnBody = after.slice(0, end);

  // Prefer fail-closed: return null when groupId not found
  assert.ok(
    /return\s+null/.test(fnBody),
    'LBL-03: miss path should return null (fail closed), not invent label from DOM'
  );
  // Must not build a synthetic group with scraped violationTypeLabel on miss
  assert.ok(
    !/violationTypeLabel\s*:\s*card\.querySelector/.test(fnBody),
    'LBL-03: must not assign violationTypeLabel from card.querySelector on miss'
  );
  assert.ok(
    !/textContent/.test(fnBody),
    'LBL-03: resolveTrainGroupFromCard must not read textContent from the card title'
  );
});

test('LBL-03: submitTrainDecision body uses group.violationTypeLabel (full), not shortLabel', () => {
  const src = readBridgeJs();
  assert.ok(
    src.includes('function submitTrainDecision') || src.includes('submitTrainDecision'),
    'LBL-03: submitTrainDecision must exist'
  );

  // Decision payload must post full label from group metadata
  assert.ok(
    /violationTypeLabel\s*:\s*group\.violationTypeLabel/.test(src),
    'LBL-03: body must include violationTypeLabel: group.violationTypeLabel (FULL)'
  );
  // Must not post shortLabel as the decision type label
  assert.ok(
    !/violationTypeLabel\s*:\s*group\.shortLabel/.test(src),
    'LBL-03: must NOT send group.shortLabel as violationTypeLabel'
  );
});
