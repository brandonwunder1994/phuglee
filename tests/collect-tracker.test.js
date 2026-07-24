'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tr = require('../public/js/collect-tracker.js');

const DAY = 86400000;

describe('classifyTrackerRow', () => {
  const now = Date.parse('2026-07-22T12:00:00Z');

  it('marks received when response_at present', () => {
    const row = tr.classifyTrackerRow(
      {
        id: 'a',
        city: 'Austin',
        state: 'Texas',
        last_channel: 'email_pdf',
        tracking: {
          city_replied: true,
          response_at: '2026-07-10T00:00:00Z',
          turnaround_days: 4,
          email: { last_sent_at: '2026-07-06T00:00:00Z' }
        },
        requests: { code_violation: { response_status: 'yes' } }
      },
      { now, overdueDays: 21 }
    );
    assert.equal(row.status, 'received');
    assert.equal(row.turnaroundDays, 4);
    assert.equal(row.channelLabel, 'PDF email');
  });

  it('marks overdue when sent > overdueDays with no response', () => {
    const sent = new Date(now - 30 * DAY).toISOString();
    const row = tr.classifyTrackerRow(
      {
        id: 'b',
        city: 'Benson',
        state: 'Arizona',
        tracking: {
          city_replied: false,
          response_at: '',
          email: { last_sent_at: sent, state: 'sent_waiting' }
        },
        requests: { code_violation: { response_status: 'pending' } }
      },
      { now, overdueDays: 21 }
    );
    assert.equal(row.status, 'overdue');
  });

  it('marks pending when recently sent', () => {
    const sent = new Date(now - 5 * DAY).toISOString();
    const row = tr.classifyTrackerRow(
      {
        id: 'c',
        city: 'Carefree',
        state: 'Arizona',
        tracking: {
          response_at: '',
          email: { last_sent_at: sent }
        },
        requests: { code_violation: {} }
      },
      { now, overdueDays: 21 }
    );
    assert.equal(row.status, 'pending');
  });

  it('marks none when never sent', () => {
    const row = tr.classifyTrackerRow(
      {
        id: 'd',
        city: 'X',
        state: 'Y',
        tracking: { email: {}, online: {} },
        requests: {}
      },
      { now }
    );
    assert.equal(row.status, 'none');
  });
});

describe('filterRows + summarizeRows', () => {
  const rows = [
    { status: 'pending', city: 'A', state: 'AZ', id: 'a' },
    { status: 'overdue', city: 'B', state: 'TX', id: 'b' },
    { status: 'received', city: 'Austin', state: 'Texas', id: 'c' }
  ];

  it('summarizes counts', () => {
    const s = tr.summarizeRows(rows);
    assert.equal(s.total, 3);
    assert.equal(s.pending, 1);
    assert.equal(s.overdue, 1);
    assert.equal(s.received, 1);
  });

  it('filters by status and search', () => {
    assert.equal(tr.filterRows(rows, 'overdue', '').length, 1);
    assert.equal(tr.filterRows(rows, 'all', 'aus').length, 1);
  });
});
