const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const config = require('../lib/config');
const originalRoot = config.FILTER_LISTS_ROOT;
let tempRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-lists-'));
  config.FILTER_LISTS_ROOT = tempRoot;
});

after(() => {
  config.FILTER_LISTS_ROOT = originalRoot;
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {}
});

const {
  saveList,
  listSummaries,
  getList,
  renameList,
  deleteList,
  buildDownload,
  markDownloaded
} = require('../lib/bridge-list-store');

test('saveList creates a list and appears in summaries', () => {
  const { meta } = saveList({
    name: 'Marana Test',
    rows: [
      { streetAddress: '123 Main', city: 'Marana', state: 'Arizona', zip: '85704' },
      { streetAddress: '456 Oak', city: 'Marana', state: 'Arizona', zip: '85704' }
    ],
    stats: { kept: 2 },
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    sourceFile: 'test.csv',
    username: 'tester'
  });

  assert.equal(meta.name, 'Marana Test');
  assert.equal(meta.recordCount, 2);
  assert.equal(meta.status, 'ready');

  const { lists } = listSummaries({ username: 'tester' });
  assert.ok(lists.some((row) => row.id === meta.id));
});

test('renameList updates name', () => {
  const { meta } = saveList({
    name: 'Old Name',
    rows: [{ streetAddress: '1 A St', city: 'Reno', state: 'Nevada' }],
    city: 'Reno',
    username: 'tester'
  });
  const renamed = renameList(meta.id, 'New Name', { username: 'tester' });
  assert.equal(renamed.meta.name, 'New Name');
  const got = getList(meta.id, { username: 'tester' });
  assert.equal(got.meta.name, 'New Name');
});

test('buildDownload returns csv and markDownloaded updates status', () => {
  const { meta } = saveList({
    name: 'Download Me',
    rows: [{ streetAddress: '9 Pine', city: 'Reno', state: 'Nevada', zip: '89501' }],
    username: 'tester'
  });
  const dl = buildDownload(meta.id, 'csv', { username: 'tester' });
  assert.equal(dl.contentType.includes('csv'), true);
  assert.ok(Buffer.isBuffer(dl.buffer) || typeof dl.buffer === 'string' || dl.buffer);
  markDownloaded(meta.id, { username: 'tester' });
  const got = getList(meta.id, { username: 'tester' });
  assert.equal(got.meta.status, 'downloaded');
  assert.ok(got.meta.downloadedAt);
});

test('deleteList removes list', () => {
  const { meta } = saveList({
    name: 'Temp',
    rows: [{ streetAddress: '2 B Rd', city: 'Reno', state: 'Nevada' }],
    username: 'tester'
  });
  deleteList(meta.id, { username: 'tester' });
  assert.throws(() => getList(meta.id, { username: 'tester' }), /not found/i);
});

test('lists are scoped per user', () => {
  const a = saveList({
    name: 'User A',
    rows: [{ streetAddress: '10 A', city: 'X', state: 'Y' }],
    username: 'alice'
  });
  const b = saveList({
    name: 'User B',
    rows: [{ streetAddress: '11 B', city: 'X', state: 'Y' }],
    username: 'bob'
  });
  const aliceLists = listSummaries({ username: 'alice' }).lists.map((l) => l.id);
  const bobLists = listSummaries({ username: 'bob' }).lists.map((l) => l.id);
  assert.ok(aliceLists.includes(a.meta.id));
  assert.ok(!aliceLists.includes(b.meta.id));
  assert.ok(bobLists.includes(b.meta.id));
  assert.ok(!bobLists.includes(a.meta.id));
});
