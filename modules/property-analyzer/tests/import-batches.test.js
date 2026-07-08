const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createImportBatch,
  stampRecordsWithBatch,
  listUploadDatesForLocation,
  matchesImportDateFilter,
  deriveRecentImport
} = require('../lib/import-batches');

function normalizeStateAbbr(state) {
  const raw = String(state || '').trim();
  if (raw.length === 2) return raw.toUpperCase();
  const map = { wyoming: 'WY', ohio: 'OH' };
  return map[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

describe('import-batches', () => {
  it('stamps records with batch metadata', () => {
    const stamped = stampRecordsWithBatch([{ address: '1 Main' }], 'batch_1', 1000);
    assert.equal(stamped[0].importBatchId, 'batch_1');
    assert.equal(stamped[0].importedAt, 1000);
  });

  it('lists upload date chips for a location', () => {
    const batches = [
      createImportBatch({ city: 'Cheyenne', state: 'Wyoming', importedAt: 2000, leadCount: 2, id: 'b2' }),
      createImportBatch({ city: 'Cheyenne', state: 'Wyoming', importedAt: 3000, leadCount: 1, id: 'b1' })
    ];
    const records = [
      { city: 'Cheyenne', state: 'Wyoming', importBatchId: 'b2', importedAt: 2000 },
      { city: 'Cheyenne', state: 'Wyoming', importBatchId: 'b1', importedAt: 3000 }
    ];
    const chips = listUploadDatesForLocation(
      records,
      [],
      { state: 'WY', city: 'Cheyenne' },
      normalizeStateAbbr,
      batches
    );
    assert.equal(chips.length, 2);
    assert.equal(chips[0].batchId, 'b1');
    assert.equal(chips[0].isMostRecent, true);
    assert.ok(chips[0].label.includes(':'));
  });

  it('filters by selected batch ids', () => {
    const a = { importBatchId: 'b1', importedAt: 100 };
    const b = { importBatchId: 'b2', importedAt: 200 };
    assert.equal(matchesImportDateFilter(a, ['b1']), true);
    assert.equal(matchesImportDateFilter(b, ['b1']), false);
    assert.equal(matchesImportDateFilter(a, []), true);
  });

  it('deriveRecentImport prefers newest batch', () => {
    const batches = [
      createImportBatch({ city: 'A', state: 'OH', importedAt: 100, id: 'old' }),
      createImportBatch({ city: 'B', state: 'OH', importedAt: 500, id: 'new', leadCount: 9 })
    ];
    const recent = deriveRecentImport(batches, []);
    assert.equal(recent.id, 'new');
    assert.equal(recent.leadCount, 9);
  });
});