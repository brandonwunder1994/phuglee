const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { appendRecordsToSession } = require('../lib/bridge-import-records');

describe('bridge-import-records', () => {
  it('appends only new analyzer records', () => {
    const session = {
      records: [{
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        address: '123 Main St, Marana, Arizona 85704',
        leadType: 'code_violation'
      }],
      results: [],
      processed: 0
    };
    const incoming = [
      {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        address: '123 Main St, Marana, Arizona 85704',
        leadType: 'code_violation'
      },
      {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        address: '456 Oak Ave, Marana, Arizona 85705',
        leadType: 'code_violation'
      }
    ];
    const merged = appendRecordsToSession(session, incoming, {
      city: 'Marana',
      state: 'Arizona',
      sourceFile: 'test.xlsx'
    });
    assert.equal(merged.added, 1);
    assert.equal(merged.skipped, 1);
    assert.equal(merged.totalRecords, 2);
    assert.equal(merged.session.importBatches.length, 1);
    assert.equal(merged.session.records[1].importBatchId, merged.batch.id);
  });
});