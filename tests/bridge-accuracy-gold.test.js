/**
 * Phase 57 Accuracy Structure — gold processUpload contracts (ACC-01, ACC-02, ACC-03)
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalBrainRoot = config.BRIDGE_BRAIN_ROOT;
const originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
let tempBrainRoot;
let tempFormatsRoot;

before(() => {
  tempBrainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-gold-'));
  config.BRIDGE_BRAIN_ROOT = tempBrainRoot;
  tempFormatsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-city-formats-gold-'));
  config.BRIDGE_CITY_FORMATS_ROOT = tempFormatsRoot;
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalBrainRoot;
  if (originalFormatsRoot === undefined) {
    delete config.BRIDGE_CITY_FORMATS_ROOT;
  } else {
    config.BRIDGE_CITY_FORMATS_ROOT = originalFormatsRoot;
  }
  try {
    fs.rmSync(tempBrainRoot, { recursive: true, force: true });
  } catch (_) {}
  try {
    if (tempFormatsRoot) fs.rmSync(tempFormatsRoot, { recursive: true, force: true });
  } catch (_) {}
});

const indexModule = require('../lib/analyzer-import-index');
const emptyImportIndex = async () => ({
  loadedAt: Date.now(),
  addresses: new Set(),
  count: 0,
  sources: null
});
indexModule.loadImportAddressIndex = emptyImportIndex;

const { processUpload } = require('../lib/bridge-engine');
const {
  emptyBrain,
  saveBrain,
  violationTypeKey
} = require('../lib/bridge-brain-store');
const { STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { UPLOAD_TYPES } = require('../lib/bridge-intake-schema');

const GOLD = path.join(__dirname, 'fixtures', 'bridge', 'gold');
const CITY = { id: 'gold-city', city: 'Goldville', state: 'AZ' };

const BANNED_REASON = /no_type(_column)?|unresolved_map|missing_type|low_confidence|cleaner|silent/i;
const THIN_ALLOWED = new Set([
  'no_address',
  'blank_row',
  'non_property',
  'duplicate',
  'no_distress_signal',
  'already_imported'
]);

function addressIn(rows, fragment) {
  return (rows || []).find((r) => String(r.streetAddress || '').includes(fragment));
}

function discardBlob(result) {
  return [
    ...(result.discarded || []).map((d) => String(d.reason || d.discardReason || '')),
    ...(result.stats?.discardReasons ? Object.keys(result.stats.discardReasons) : [])
  ].join(' ');
}

function assertNoBannedReasons(result, label) {
  const blob = discardBlob(result);
  assert.equal(BANNED_REASON.test(blob), false, `${label}: banned silent-drop reasons in ${blob}`);
  for (const d of result.discarded || []) {
    const reason = String(d.reason || d.discardReason || '');
    if (!reason) continue;
    // thin inventory reasons only (no_distress_signal may appear on stats for FN tally)
    if (reason === 'no_distress_signal') continue;
    assert.ok(
      THIN_ALLOWED.has(reason) || !BANNED_REASON.test(reason),
      `${label}: unexpected hard-drop reason ${reason}`
    );
  }
}

test('ACC-01: gold keep-distress-mixed keeps Strong weeds/trash/blight/vehicle/maintenance', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'keep-distress-mixed.csv'));
  const result = await processUpload({
    buffer,
    filename: 'keep-distress-mixed.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  assert.equal(result.ok, true);
  const frags = ['100 Gold Keep', '200 Gold Keep', '300 Gold Keep', '400 Gold Keep', '500 Gold Keep'];
  for (const frag of frags) {
    const row = addressIn(result.rows, frag);
    assert.ok(row, `expected Strong kept for ${frag}`);
    assert.equal(
      row.distressedSignalTag === STRONG_DISTRESSED_TAG ||
        String(row.distressedSignalTag || '').includes('Strong Distressed'),
      true,
      `${frag} must be Strong Distressed, got ${row.distressedSignalTag}`
    );
  }
  assertNoBannedReasons(result, 'keep');
});

test('ACC-01: gold deny-junk-admin does not keep permits/parking/trash-cans as Strong', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'deny-junk-admin.csv'));
  const result = await processUpload({
    buffer,
    filename: 'deny-junk-admin.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  assert.equal(result.ok, true);
  const frags = ['100 Gold Deny', '200 Gold Deny', '300 Gold Deny', '400 Gold Deny', '500 Gold Deny'];
  for (const frag of frags) {
    const strong = addressIn(result.rows, frag);
    assert.equal(
      strong == null ||
        !(
          strong.distressedSignalTag === STRONG_DISTRESSED_TAG ||
          String(strong.distressedSignalTag || '').includes('Strong Distressed')
        ),
      true,
      `${frag} must not be Strong kept`
    );
    const fn = addressIn(result.notDistressedRows, frag);
    assert.ok(fn, `${frag} must remain reviewable in notDistressedRows (FN pool)`);
  }
  assertNoBannedReasons(result, 'deny');
});

test('ACC-01: gold water-hostile ignores active type suppress (water never type-suppressed)', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'water-hostile-types.txt'));
  const baseline = await processUpload({
    buffer,
    filename: 'water-hostile-types.txt',
    city: CITY,
    uploadType: 'water_shut_off'
  });
  assert.ok(baseline.stats.kept >= 2);

  const brain = emptyBrain();
  brain.typeRules = [
    {
      id: 'tr_suppress_water_gold',
      kind: 'suppress_type',
      violationTypeKey: violationTypeKey('Water shut off delinquency'),
      violationTypeLabel: 'Water shut off delinquency',
      status: 'active'
    },
    {
      id: 'tr_suppress_utility_gold',
      kind: 'suppress_type',
      violationTypeKey: violationTypeKey('Utility terminated'),
      violationTypeLabel: 'Utility terminated',
      status: 'active'
    }
  ];
  saveBrain(brain);

  try {
    const result = await processUpload({
      buffer,
      filename: 'water-hostile-types.txt',
      city: CITY,
      uploadType: 'water_shut_off'
    });
    assert.equal(result.stats.kept, baseline.stats.kept);
    assert.ok(addressIn(result.rows, 'Gold Water'));
    assert.ok(addressIn(result.rows, 'Gold River'));
    const ids = result.processingMeta?.brainAppliedRuleIds || [];
    assert.ok(!ids.includes('tr_suppress_water_gold'));
    assert.ok(!ids.includes('tr_suppress_utility_gold'));
    assert.ok(
      result.rows.every(
        (row) =>
          row.distressedSignalTag === UPLOAD_TYPES.water_shut_off.defaultTag ||
          String(row.distressedSignalTag || '').includes('Water Shut Off')
      )
    );
  } finally {
    saveBrain(emptyBrain());
  }
});

test('ACC-01: gold type-trap Status+Vio Cat maps category not Status', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'type-trap-status-vio.csv'));
  const result = await processUpload({
    buffer,
    filename: 'type-trap-status-vio.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
  });
  assert.equal(result.ok, true);
  assert.equal(result.processingMeta?.columnMap?.violationIssueType, 'Vio Cat');
  const grass = addressIn(result.rows, '100 Gold Trap') || addressIn(result.notDistressedRows, '100 Gold Trap');
  assert.ok(grass, 'High Grass row must stay inventory');
  const typeText = String(grass.violationIssueType || '');
  assert.match(typeText, /High Grass/i);
  assert.equal(/^\s*Open\s*$/i.test(typeText), false, 'Status must not be sole Type cell');
  const permit = addressIn(result.rows, '200 Gold Trap');
  if (permit) {
    assert.equal(
      permit.distressedSignalTag === STRONG_DISTRESSED_TAG,
      false,
      'Fence Permit must not be Strong kept'
    );
  } else {
    assert.ok(addressIn(result.notDistressedRows, '200 Gold Trap'), 'Fence Permit in FN');
  }
});

test('ACC-02: gold no-type-notes-only keeps weeds inventory (no no_type discard)', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'no-type-notes-only.csv'));
  const result = await processUpload({
    buffer,
    filename: 'no-type-notes-only.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: '__none__'
  });
  assert.equal(result.ok, true);
  const typeCol = result.processingMeta?.columnMap?.violationIssueType;
  assert.ok(!typeCol || typeCol === '__none__' || typeCol === '', 'Type column unresolved/none');
  const weeds = addressIn(result.rows, '100 No Type') || addressIn(result.notDistressedRows, '100 No Type');
  assert.ok(weeds, 'weeds notes row must not vanish');
  const debris = addressIn(result.rows, '200 No Type') || addressIn(result.notDistressedRows, '200 No Type');
  assert.ok(debris, 'debris notes row must not vanish');
  assert.equal(BANNED_REASON.test(discardBlob(result)), false);
});

test('ACC-02: gold processes never invent banned silent-drop reasons', async () => {
  const runs = [
    { file: 'keep-distress-mixed.csv', confirmedTypeHeader: 'Violation Type' },
    { file: 'deny-junk-admin.csv', confirmedTypeHeader: 'Violation Type' },
    { file: 'no-type-notes-only.csv', confirmedTypeHeader: '__none__' }
  ];
  for (const { file, confirmedTypeHeader } of runs) {
    const result = await processUpload({
      buffer: fs.readFileSync(path.join(GOLD, file)),
      filename: file,
      city: CITY,
      uploadType: 'code_violation',
      username: 'admin',
      confirmedTypeHeader
    });
    assertNoBannedReasons(result, file);
  }
});

test('ACC-02: gold all-junk file succeeds with empty Strong kept and reviewable FN pool', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'deny-junk-admin.csv'));
  const result = await processUpload({
    buffer,
    filename: 'deny-junk-admin.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Violation Type'
  });
  assert.equal(result.ok, true);
  assert.ok((result.notDistressedRows || []).length >= 5, 'all addressable junk in FN pool');
  assert.equal((result.rows || []).filter((r) =>
    r.distressedSignalTag === STRONG_DISTRESSED_TAG ||
    String(r.distressedSignalTag || '').includes('Strong Distressed')
  ).length, 0);
  const ndGroups = result.reviewGroups?.notDistressed || [];
  assert.ok(ndGroups.length >= 1, 'FN review groups present for Train inventory');
});

test('ACC-03: gold type-trap keep-green single Type winner (Vio Cat)', async () => {
  const buffer = fs.readFileSync(path.join(GOLD, 'type-trap-status-vio.csv'));
  const result = await processUpload({
    buffer,
    filename: 'type-trap-status-vio.csv',
    city: CITY,
    uploadType: 'code_violation',
    username: 'admin',
    confirmedTypeHeader: 'Vio Cat'
  });
  assert.ok(result.processingMeta?.columnMap && typeof result.processingMeta.columnMap === 'object');
  assert.equal(result.processingMeta?.columnMap?.violationIssueType, 'Vio Cat');
  const mapped = String(result.processingMeta?.columnMap?.violationIssueType || '');
  assert.equal(mapped.includes('+') || mapped.includes('|') || mapped.includes(','), false, 'no blended Type columns');
  const groups = [
    ...(result.reviewGroups?.distressed || []),
    ...(result.reviewGroups?.notDistressed || [])
  ];
  for (const g of groups) {
    if (g.shortLabel && g.violationTypeLabel) {
      assert.ok(
        String(g.violationTypeLabel).length >= String(g.shortLabel).length ||
          g.violationTypeLabel === g.shortLabel,
        'shortLabel is display-only; full type label retained on group'
      );
    }
  }
});
