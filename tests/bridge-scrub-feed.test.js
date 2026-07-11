/**
 * Wave 0 unit contracts for BridgeScrubFeed (FEED-01 mapping/cap/honesty + FEED-02 play options).
 * Loads public/js/bridge-scrub-feed.js via vm — no DOM, HTTP, or bridge.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HELPER_JS = path.join(ROOT, 'public', 'js', 'bridge-scrub-feed.js');

const FIXTURE = {
  rows: [{ streetAddress: '100 Kept St', violationIssueType: 'VACANT' }],
  notDistressedRows: [{ streetAddress: '200 Quiet Ave', violationIssueType: 'TALL GRASS' }],
  discarded: [
    { reason: 'Near-duplicate within upload', rawPreview: '300 Dup Rd' },
    { reason: 'Already imported in Analyze', rawPreview: '400 Old Ln' }
  ],
  stats: { kept: 1, noDistress: 1, discarded: 2, alreadyImported: 1, totalParsed: 4 }
};

/**
 * Load pure BridgeScrubFeed helpers (mirror bridge-train vm pattern).
 * Prefers public/js/bridge-scrub-feed.js; dual-exported on window / globalThis.
 */
function loadBridgeScrubFeed() {
  assert.ok(fs.existsSync(HELPER_JS), 'public/js/bridge-scrub-feed.js must exist');
  const src = fs.readFileSync(HELPER_JS, 'utf8');
  const windowObj = {};
  const sandbox = {
    window: windowObj,
    console,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Math,
    Error,
    Set,
    Map,
    RegExp
  };
  vm.runInNewContext(src, sandbox);
  const api = sandbox.window.BridgeScrubFeed || sandbox.BridgeScrubFeed;
  assert.ok(api, 'must export BridgeScrubFeed on window/globalThis');
  assert.equal(typeof api.buildScrubFeedEvents, 'function', 'BridgeScrubFeed.buildScrubFeedEvents');
  assert.equal(typeof api.formatScrubFeedSummary, 'function', 'BridgeScrubFeed.formatScrubFeedSummary');
  assert.equal(typeof api.getScrubFeedPlayOptions, 'function', 'BridgeScrubFeed.getScrubFeedPlayOptions');
  assert.ok(Number.isFinite(api.SCRUB_FEED_CAP), 'BridgeScrubFeed.SCRUB_FEED_CAP');
  return api;
}

function collectInputAddresses(data) {
  const addrs = new Set();
  for (const r of data.rows || []) {
    const a = String(r.streetAddress || '').trim();
    if (a) addrs.add(a);
  }
  for (const r of data.notDistressedRows || []) {
    const a = String(r.streetAddress || '').trim();
    if (a) addrs.add(a);
  }
  for (const d of data.discarded || []) {
    const a = String(d.rawPreview || '').trim();
    if (a) addrs.add(a);
    const reason = String(d.reason || '').trim();
    if (reason) addrs.add(reason);
  }
  return addrs;
}

test('BridgeScrubFeed exports buildScrubFeedEvents and SCRUB_FEED_CAP', () => {
  const api = loadBridgeScrubFeed();
  assert.equal(api.SCRUB_FEED_CAP, 32);
  assert.ok(api.STATUS_LABELS);
});

test('FEED-01: maps kept / no-distress / discarded / already-in-Analyze from process-shaped payload', () => {
  const api = loadBridgeScrubFeed();
  const built = api.buildScrubFeedEvents(FIXTURE);
  assert.ok(Array.isArray(built.events), 'events array');
  const statuses = new Set(built.events.map((e) => e.status));
  assert.ok(statuses.has('kept'), 'has kept');
  assert.ok(statuses.has('no-distress'), 'has no-distress');
  assert.ok(statuses.has('discarded'), 'has discarded');
  assert.ok(statuses.has('already-in-Analyze'), 'has already-in-Analyze');

  const kept = built.events.find((e) => e.status === 'kept');
  assert.equal(kept.address, '100 Kept St');
  const fn = built.events.find((e) => e.status === 'no-distress');
  assert.equal(fn.address, '200 Quiet Ave');
  const disc = built.events.find((e) => e.status === 'discarded');
  assert.equal(disc.address, '300 Dup Rd');
  const already = built.events.find((e) => e.status === 'already-in-Analyze');
  assert.equal(already.address, '400 Old Ln');

  assert.equal(built.summary.kept, 1);
  assert.equal(built.summary.noDistress, 1);
  assert.equal(built.summary.discarded, 2);
  assert.equal(built.summary.alreadyImported, 1);
  assert.equal(built.summary.totalParsed, 4);

  for (const e of built.events) {
    assert.ok(e.label, 'each event has operator label');
    assert.ok(typeof e.type === 'string', 'each event has type string');
  }
});

test('FEED-01: caps events at SCRUB_FEED_CAP and reports remainder from stats', () => {
  const api = loadBridgeScrubFeed();
  const rows = [];
  const notDistressedRows = [];
  const discarded = [];
  for (let i = 0; i < 100; i++) {
    rows.push({ streetAddress: `Kept ${i} St`, violationIssueType: 'VACANT' });
    notDistressedRows.push({ streetAddress: `Quiet ${i} Ave`, violationIssueType: 'TALL GRASS' });
  }
  for (let i = 0; i < 50; i++) {
    discarded.push({ reason: 'Near-duplicate within upload', rawPreview: `Dup ${i} Rd` });
  }
  for (let i = 0; i < 20; i++) {
    discarded.push({ reason: 'Already imported in Analyze', rawPreview: `Old ${i} Ln` });
  }
  const data = {
    rows,
    notDistressedRows,
    discarded,
    stats: {
      kept: 100,
      noDistress: 100,
      discarded: 70,
      alreadyImported: 20,
      totalParsed: 270
    }
  };
  const built = api.buildScrubFeedEvents(data);
  assert.ok(built.events.length <= api.SCRUB_FEED_CAP, `events ${built.events.length} ≤ cap ${api.SCRUB_FEED_CAP}`);
  assert.ok(built.events.length > 0, 'samples some events');

  const shown = { kept: 0, 'no-distress': 0, discarded: 0, 'already-in-Analyze': 0 };
  for (const e of built.events) {
    shown[e.status] = (shown[e.status] || 0) + 1;
  }
  assert.ok(built.remainderByStatus.kept > 0, 'remainder kept > 0 when stats exceed shown');
  assert.ok(built.remainderByStatus['no-distress'] > 0, 'remainder no-distress > 0');
  assert.equal(built.remainderByStatus.kept, Math.max(0, 100 - shown.kept));
  assert.equal(built.remainderByStatus['no-distress'], Math.max(0, 100 - shown['no-distress']));
  assert.equal(built.remainderByStatus['already-in-Analyze'], Math.max(0, 20 - shown['already-in-Analyze']));
});

test('FEED-01: never invents addresses when pools are empty', () => {
  const api = loadBridgeScrubFeed();
  const empty = api.buildScrubFeedEvents(null);
  assert.deepEqual(empty.events, []);
  assert.equal(empty.summary.kept, 0);
  assert.equal(empty.summary.noDistress, 0);
  assert.equal(empty.summary.discarded, 0);
  assert.equal(empty.summary.alreadyImported, 0);
  assert.equal(empty.remainderByStatus.kept, 0);

  const blank = api.buildScrubFeedEvents({
    rows: [{ streetAddress: '', violationIssueType: 'X' }],
    notDistressedRows: [],
    discarded: [],
    stats: { kept: 0, noDistress: 0, discarded: 0, alreadyImported: 0 }
  });
  assert.equal(blank.events.length, 0, 'empty streetAddress skipped — no synthetic streets');

  const inputAddrs = collectInputAddresses(FIXTURE);
  const built = api.buildScrubFeedEvents(FIXTURE);
  for (const e of built.events) {
    const addr = String(e.address || '').trim();
    if (!addr) continue;
    assert.ok(
      inputAddrs.has(addr),
      `event address "${addr}" must come from input rows/discards (no synthetic streets)`
    );
  }
});

test('FEED-01: samples notDistressedRows for no-distress (not only discarded[])', () => {
  const api = loadBridgeScrubFeed();
  const data = {
    rows: [],
    notDistressedRows: [
      { streetAddress: '500 FN Blvd', violationIssueType: 'WEEDS' },
      { streetAddress: '501 FN Blvd', violationIssueType: 'WEEDS' }
    ],
    discarded: [],
    stats: { kept: 0, noDistress: 2, discarded: 0, alreadyImported: 0 }
  };
  const built = api.buildScrubFeedEvents(data);
  const fnEvents = built.events.filter((e) => e.status === 'no-distress');
  assert.ok(fnEvents.length >= 1, 'no-distress from notDistressedRows even when discarded empty');
  assert.ok(fnEvents.some((e) => e.address === '500 FN Blvd' || e.address === '501 FN Blvd'));
  assert.equal(built.summary.noDistress, 2);
});

test('FEED-01: already-in-Analyze only when discarded reason is already-imported', () => {
  const api = loadBridgeScrubFeed();
  const noImport = {
    rows: [{ streetAddress: '1 Main', violationIssueType: 'V' }],
    notDistressedRows: [],
    discarded: [{ reason: 'Near-duplicate within upload', rawPreview: '2 Side St' }],
    stats: { kept: 1, noDistress: 0, discarded: 1, alreadyImported: 0 }
  };
  const built = api.buildScrubFeedEvents(noImport);
  assert.equal(
    built.events.filter((e) => e.status === 'already-in-Analyze').length,
    0,
    'no already-in-Analyze when no already-imported discards'
  );
  assert.ok(built.events.some((e) => e.status === 'discarded'));

  const keyForm = {
    rows: [],
    notDistressedRows: [],
    discarded: [{ reason: 'already_imported', rawPreview: '9 Key Ln' }],
    stats: { kept: 0, noDistress: 0, discarded: 1, alreadyImported: 1 }
  };
  const keyBuilt = api.buildScrubFeedEvents(keyForm);
  assert.ok(
    keyBuilt.events.some((e) => e.status === 'already-in-Analyze' && e.address === '9 Key Ln'),
    'reason key already_imported maps to already-in-Analyze'
  );
});

test('FEED-02: reduced-motion play options have zero staged delay', () => {
  const api = loadBridgeScrubFeed();
  const opts = api.getScrubFeedPlayOptions({ reducedMotion: true });
  assert.equal(opts.maxMs, 0);
  assert.equal(opts.tickMs, 0);
  assert.equal(opts.stagger, false);
});

test('FEED-02: motion play options allow staggered play within hard cap', () => {
  const api = loadBridgeScrubFeed();
  const opts = api.getScrubFeedPlayOptions({ reducedMotion: false });
  assert.ok(opts.maxMs > 0, 'maxMs > 0 for motion path');
  assert.ok(opts.maxMs <= 2500, 'maxMs ≤ 2500 hard cap');
  assert.equal(opts.stagger, true);
  assert.ok(opts.tickMs > 0, 'tickMs > 0 for stagger');
});

test('formatScrubFeedSummary honesty when alreadyImported is 0', () => {
  const api = loadBridgeScrubFeed();
  const withZero = api.formatScrubFeedSummary({
    kept: 42,
    noDistress: 180,
    discarded: 12,
    alreadyImported: 0
  });
  assert.match(withZero, /Kept 42/);
  assert.match(withZero, /No distress 180/);
  assert.match(withZero, /Discarded 12/);
  assert.ok(!/Already in Analyze/i.test(withZero), 'omit Already in Analyze when count is 0');

  const withImport = api.formatScrubFeedSummary({
    kept: 1,
    noDistress: 1,
    discarded: 2,
    alreadyImported: 3
  });
  assert.match(withImport, /Already in Analyze 3/);
});
