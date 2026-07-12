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
  clearAllLists,
  buildDownload,
  buildDownloadAll,
  buildDownloadAllBatched,
  chunkRowsForExport,
  EXPORT_BATCH_SIZE,
  markDownloaded,
  setListStatus,
  resetCitiesStatusToReady
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

test('LIST-02: multi-city lists accumulate until deleted', () => {
  const user = 'list02-multi';
  const a = saveList({
    name: 'City A Code',
    rows: [{ streetAddress: '1 A St', city: 'Marana', state: 'Arizona' }],
    city: 'Marana',
    state: 'Arizona',
    uploadType: 'code_violation',
    username: user
  });
  const b = saveList({
    name: 'City B Water',
    rows: [{ streetAddress: '2 B Rd', city: 'Reno', state: 'Nevada' }],
    city: 'Reno',
    state: 'Nevada',
    uploadType: 'water_shut_off',
    username: user
  });
  const { lists } = listSummaries({ username: user });
  const names = lists.map((row) => row.name);
  assert.ok(names.includes('City A Code'), 'City A list must remain');
  assert.ok(names.includes('City B Water'), 'City B list must remain');
  assert.ok(lists.length >= 2, 'multi-city accumulate');
  assert.ok(lists.some((row) => row.id === a.meta.id));
  assert.ok(lists.some((row) => row.id === b.meta.id));
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

test('setListStatus ready clears downloadedAt', () => {
  const user = 'status-ready-user';
  const { meta } = saveList({
    name: 'Cheyenne test list',
    rows: [{ streetAddress: '1 Main', city: 'Cheyenne', state: 'WY' }],
    city: 'Cheyenne',
    state: 'WY',
    username: user
  });
  markDownloaded(meta.id, { username: user });
  const reset = setListStatus(meta.id, 'ready', { username: user });
  assert.equal(reset.meta.status, 'ready');
  assert.equal(reset.meta.downloadedAt, null);
});

test('resetCitiesStatusToReady matches Cheyenne and Midlothian once', () => {
  const user = 'ops-city-reset';
  const chey = saveList({
    name: 'Cheyenne Code · test',
    rows: [
      { streetAddress: '1 A', city: 'Cheyenne', state: 'WY' },
      { streetAddress: '2 B', city: 'Cheyenne', state: 'WY' }
    ],
    city: 'Cheyenne',
    state: 'WY',
    username: user
  });
  const mid = saveList({
    name: 'Midlothian Code · test',
    rows: [{ streetAddress: '3 C', city: 'Midlothian', state: 'TX' }],
    city: 'Midlothian',
    state: 'TX',
    username: user
  });
  markDownloaded(chey.meta.id, { username: user });
  markDownloaded(mid.meta.id, { username: user });

  const first = resetCitiesStatusToReady(['Cheyenne', 'Midlothian'], {
    onceKey: 'test-ready-chey-mid-v1'
  });
  assert.equal(first.skipped, false);
  assert.ok(first.updated >= 2, `expected >=2 updates, got ${first.updated}`);
  assert.equal(getList(chey.meta.id, { username: user }).meta.status, 'ready');
  assert.equal(getList(mid.meta.id, { username: user }).meta.status, 'ready');

  // Re-download then re-run with same onceKey → no-op (marker)
  markDownloaded(chey.meta.id, { username: user });
  const second = resetCitiesStatusToReady(['Cheyenne', 'Midlothian'], {
    onceKey: 'test-ready-chey-mid-v1'
  });
  assert.equal(second.skipped, true);
  assert.equal(getList(chey.meta.id, { username: user }).meta.status, 'downloaded');
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

test('buildDownloadAll combines rows with list name columns', () => {
  saveList({
    name: 'City A List',
    rows: [{ streetAddress: '1 A St', city: 'Alpha', state: 'AZ', zip: '85001' }],
    city: 'Alpha',
    state: 'AZ',
    username: 'bulkuser'
  });
  saveList({
    name: 'City B List',
    rows: [
      { streetAddress: '2 B St', city: 'Beta', state: 'TX', zip: '75001' },
      { streetAddress: '3 B St', city: 'Beta', state: 'TX', zip: '75001' }
    ],
    city: 'Beta',
    state: 'TX',
    username: 'bulkuser'
  });
  const dl = buildDownloadAll('csv', { username: 'bulkuser' });
  assert.equal(dl.listCount, 2);
  assert.equal(dl.recordCount, 3);
  const text = dl.buffer.toString('utf8');
  assert.match(text, /List Name/);
  assert.match(text, /City A List/);
  assert.match(text, /City B List/);
  assert.match(text, /1 A St/);
  assert.match(text, /2 B St/);
});

test('chunkRowsForExport splits 26000 into six 5k batches (last 1000)', () => {
  assert.equal(EXPORT_BATCH_SIZE, 5000);
  const rows = Array.from({ length: 26000 }, (_, i) => ({ i }));
  const chunks = chunkRowsForExport(rows, 5000);
  assert.equal(chunks.length, 6);
  assert.deepEqual(
    chunks.map((c) => c.rows.length),
    [5000, 5000, 5000, 5000, 5000, 1000]
  );
});

test('buildDownloadAllBatched xlsx uses one sheet per 5k batch', async () => {
  const user = 'batch-xlsx-user';
  const rows = Array.from({ length: 12005 }, (_, i) => ({
    streetAddress: `${i} Main St`,
    city: 'Commerce',
    state: 'TX',
    zip: '75428'
  }));
  saveList({
    name: 'Commerce bulk',
    rows,
    city: 'Commerce',
    state: 'TX',
    uploadType: 'code_violation',
    username: user
  });
  const dl = await buildDownloadAllBatched('xlsx', { username: user });
  assert.equal(dl.recordCount, 12005);
  assert.equal(dl.batchCount, 3);
  assert.equal(dl.batchSize, 5000);
  assert.match(dl.filename, /\.xlsx$/i);
  assert.ok(Buffer.isBuffer(dl.buffer));
  assert.ok(dl.buffer.length > 1000);
});

test('buildDownloadAllBatched csv returns a zip of batch files', async () => {
  const user = 'batch-csv-user';
  saveList({
    name: 'Small batch list',
    rows: Array.from({ length: 3 }, (_, i) => ({
      streetAddress: `${i} Oak`,
      city: 'Reno',
      state: 'NV'
    })),
    username: user
  });
  const dl = await buildDownloadAllBatched('csv', { username: user }, { batchSize: 2 });
  assert.equal(dl.recordCount, 3);
  assert.equal(dl.batchCount, 2);
  assert.match(dl.contentType, /zip/i);
  assert.match(dl.filename, /\.zip$/i);
});

test('clearAllLists removes every list for the user', () => {
  saveList({
    name: 'Temp 1',
    rows: [{ streetAddress: '9 Z', city: 'Z', state: 'ZZ' }],
    username: 'clearuser'
  });
  saveList({
    name: 'Temp 2',
    rows: [{ streetAddress: '8 Y', city: 'Y', state: 'YY' }],
    username: 'clearuser'
  });
  assert.equal(listSummaries({ username: 'clearuser' }).lists.length, 2);
  const cleared = clearAllLists({ username: 'clearuser' });
  assert.equal(cleared.deleted, 2);
  assert.equal(listSummaries({ username: 'clearuser' }).lists.length, 0);
});
