const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalRoot = config.BRIDGE_BRAIN_ROOT;
let tempRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-brain-'));
  config.BRIDGE_BRAIN_ROOT = tempRoot;
});

after(() => {
  config.BRIDGE_BRAIN_ROOT = originalRoot;
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});

const {
  emptyBrain,
  loadBrain,
  saveBrain,
  brainPath,
  violationTypeKey
} = require('../lib/bridge-brain-store');

test('loadBrain with no file returns emptyBrain shape without throw', () => {
  const brain = loadBrain();
  assert.equal(brain.version, 1);
  assert.deepEqual(brain.typeRules, []);
  assert.deepEqual(brain.phraseRules, []);
  assert.deepEqual(brain.events, []);
  assert.equal(brain.updatedAt, null);
  assert.equal(brain.metrics.totalDecisions, 0);
  assert.equal(brain.metrics.typeRulesActive, 0);
  assert.equal(brain.metrics.phraseRulesActive, 0);
  assert.equal(brain.metrics.phraseRulesProposed, 0);
});

test('loadBrain with corrupt JSON returns emptyBrain without throw', () => {
  const file = brainPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not-valid-json!!!', 'utf8');
  const brain = loadBrain();
  assert.equal(brain.version, 1);
  assert.deepEqual(brain.typeRules, []);
  assert.deepEqual(brain.phraseRules, []);
  assert.deepEqual(brain.events, []);
});

test('saveBrain then loadBrain round-trips typeRules and phraseRules', () => {
  const doc = emptyBrain();
  doc.typeRules = [
    { id: 'tr1', violationTypeKey: 'high grass and weeds', action: 'suppress_type', status: 'active' }
  ];
  doc.phraseRules = [
    { id: 'pr1', phrase: 'trash cans', action: 'suppress_phrase', status: 'active' }
  ];
  saveBrain(doc);
  const loaded = loadBrain();
  assert.equal(loaded.typeRules.length, 1);
  assert.equal(loaded.typeRules[0].id, 'tr1');
  assert.equal(loaded.typeRules[0].violationTypeKey, 'high grass and weeds');
  assert.equal(loaded.phraseRules.length, 1);
  assert.equal(loaded.phraseRules[0].phrase, 'trash cans');
  assert.ok(loaded.updatedAt);
  assert.match(String(loaded.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
});

test('brainPath ends with global-brain.json under BRIDGE_BRAIN_ROOT', () => {
  const p = brainPath();
  assert.equal(path.basename(p), 'global-brain.json');
  assert.equal(path.dirname(p), config.BRIDGE_BRAIN_ROOT);
  assert.ok(p.startsWith(tempRoot) || path.resolve(p).startsWith(path.resolve(tempRoot)));
});

test('violationTypeKey normalizes labels', () => {
  assert.equal(violationTypeKey('High Grass and Weeds'), 'high grass and weeds');
  assert.equal(violationTypeKey('  Multiple   Spaces  '), 'multiple spaces');
  assert.equal(violationTypeKey(''), '__unknown__');
  assert.equal(violationTypeKey(null), '__unknown__');
  assert.equal(violationTypeKey(undefined), '__unknown__');
  assert.equal(violationTypeKey('   '), '__unknown__');
});

test('saveBrain creates parent directory when missing', () => {
  const nested = path.join(tempRoot, 'nested', 'deep');
  config.BRIDGE_BRAIN_ROOT = nested;
  try {
    assert.equal(fs.existsSync(nested), false);
    const doc = emptyBrain();
    doc.typeRules = [{ id: 'n1', action: 'promote_type', status: 'active' }];
    saveBrain(doc);
    assert.equal(fs.existsSync(path.join(nested, 'global-brain.json')), true);
    const loaded = loadBrain();
    assert.equal(loaded.typeRules[0].id, 'n1');
  } finally {
    config.BRIDGE_BRAIN_ROOT = tempRoot;
  }
});

test('emptyBrain returns schema defaults', () => {
  const b = emptyBrain();
  assert.equal(b.version, 1);
  assert.equal(b.updatedAt, null);
  assert.ok(Array.isArray(b.typeRules));
  assert.ok(Array.isArray(b.phraseRules));
  assert.ok(Array.isArray(b.events));
  assert.deepEqual(b.metrics, {
    totalDecisions: 0,
    typeRulesActive: 0,
    phraseRulesActive: 0,
    phraseRulesProposed: 0,
    suppressCount: 0,
    promoteCount: 0
  });
});
