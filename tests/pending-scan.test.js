'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countPendingUnscanned,
  filterUnscannedRecords
} = require('../modules/property-analyzer/lib/pending-scan');

test('pending count uses address match and honors forceRescan', () => {
  const session = {
    results: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postal: '78701',
        address: '100 Main St, Austin, TX 78701'
      }
    ],
    records: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main Street',
        city: 'Austin',
        state: 'TX',
        postal: '78701'
      },
      {
        email: 'b@x.com',
        phone: '2',
        street: '200 Oak',
        city: 'Austin',
        state: 'TX'
      },
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postal: '78701',
        forceRescan: true
      }
    ]
  };

  assert.equal(countPendingUnscanned(session), 2);
  const pending = filterUnscannedRecords(session.records, session.results);
  assert.equal(pending.length, 2);
  assert.ok(pending.some((r) => r.street === '200 Oak'));
  assert.ok(pending.some((r) => r.forceRescan));
});

test('empty records => 0 pending', () => {
  assert.equal(countPendingUnscanned({ results: [{ street: '1' }], records: [] }), 0);
});
