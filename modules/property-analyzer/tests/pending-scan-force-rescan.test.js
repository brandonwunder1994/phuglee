const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  filterUnscannedRecords,
  countPendingUnscanned,
  healStaleForceRescanFlags
} = require('../lib/pending-scan');

describe('forceRescan pending queue', () => {
  const importedAt = 1_000_000;
  const analyzedAt = 1_500_000;

  const record = {
    email: 'a@test.com',
    phone: '',
    street: '4640 E 105Th Dr',
    city: 'Thornton',
    state: 'CO',
    postal: '80233',
    address: '4640 E 105Th Dr, Thornton, CO 80233',
    importedAt,
    forceRescan: true,
    analyzedAt,
    leadTier: 'distressed'
  };

  const result = {
    email: 'a@test.com',
    phone: '',
    street: '4640 E 105Th Dr',
    address: '4640 E 105Th Dr, Thornton, CO 80233',
    analyzedAt,
    leadTier: 'distressed'
  };

  it('does not keep completed forceRescan rows in the unscanned queue', () => {
    const pending = filterUnscannedRecords([record], [result]);
    assert.equal(pending.length, 0);
    assert.equal(countPendingUnscanned({ records: [record], results: [result] }), 0);
  });

  it('keeps forceRescan rows when the result is older than the import', () => {
    const staleResult = { ...result, analyzedAt: importedAt - 50 };
    const pending = filterUnscannedRecords(
      [{ ...record, analyzedAt: undefined }],
      [staleResult]
    );
    assert.equal(pending.length, 1);
  });

  it('queues forceRescan when there is no matching result yet', () => {
    const pending = filterUnscannedRecords([{ ...record, analyzedAt: undefined }], []);
    assert.equal(pending.length, 1);
  });

  it('heals stale forceRescan flags in place', () => {
    const session = {
      records: [{ ...record }],
      results: [{ ...result }]
    };
    const { cleared } = healStaleForceRescanFlags(session);
    assert.equal(cleared, 1);
    assert.equal(session.records[0].forceRescan, undefined);
    assert.equal(countPendingUnscanned(session), 0);
  });

  it('heals forceRescan left on completed result rows', () => {
    const session = {
      records: [{ ...record, forceRescan: undefined }],
      results: [{ ...result, importedAt, forceRescan: true }]
    };
    const { cleared } = healStaleForceRescanFlags(session);
    assert.equal(cleared, 1);
    assert.equal(session.results[0].forceRescan, undefined);
    assert.equal(countPendingUnscanned(session), 0);
  });
});
