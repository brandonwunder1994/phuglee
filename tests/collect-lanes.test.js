'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const lanes = require('../public/js/collect-lanes.js');

describe('summarizePendingQueue', () => {
  it('reads forge pending-pdf shape', () => {
    const s = lanes.summarizePendingQueue({
      current_month_label: 'July 2026',
      total_pending: 12,
      total_blocked: 3,
      total_sent_this_month: 40,
      items: new Array(12).fill({}),
      blocked: new Array(3).fill({})
    });
    assert.equal(s.ready, 12);
    assert.equal(s.blocked, 3);
    assert.equal(s.sentThisMonth, 40);
    assert.equal(s.monthLabel, 'July 2026');
  });

  it('handles empty/missing payload', () => {
    const s = lanes.summarizePendingQueue(null);
    assert.equal(s.ready, 0);
    assert.equal(s.blocked, 0);
    assert.equal(s.sentThisMonth, 0);
  });
});

describe('buildLaneModel', () => {
  it('builds four bulk lanes with forge hrefs and returnTo', () => {
    const model = lanes.buildLaneModel({
      emailOnly: {
        total_pending: 5,
        total_blocked: 1,
        total_sent_this_month: 2,
        current_month_label: 'July 2026'
      },
      pdf: {
        total_pending: 20,
        total_blocked: 4,
        total_sent_this_month: 50,
        current_month_label: 'July 2026'
      },
      online: {
        total_pending: 8,
        total_blocked: 2,
        total_sent_this_month: 10,
        current_month_label: 'July 2026'
      },
      kpi: null
    });
    assert.equal(model.lanes.length, 4);
    const ids = model.lanes.map((l) => l.id);
    // PDF filler first so operators clear the one-time FOIA backlog
    assert.deepEqual(ids, ['pdf_needs_fill', 'pdf_ready', 'email_only', 'portal']);
    assert.equal(model.lanes[0].ready, 0); // needsFillCount default
    assert.equal(model.lanes[1].ready, 20);
    assert.equal(model.lanes[2].ready, 5);
    assert.equal(model.lanes[3].ready, 8);
    assert.equal(model.lanes[0].href, '#/fill/pdf');
    assert.equal(model.lanes[1].href, '#/fire/pdf');
    assert.equal(model.lanes[2].href, '#/fire/email-only');
    assert.equal(model.lanes[3].href, '#/portal');
  });

  it('pdf_needs_fill (PDF filler) uses needsFillCount', () => {
    const model = lanes.buildLaneModel({
      emailOnly: { total_pending: 0, total_blocked: 0, total_sent_this_month: 0 },
      pdf: { total_pending: 1, total_blocked: 0, total_sent_this_month: 0 },
      online: { total_pending: 0, total_blocked: 0, total_sent_this_month: 0 },
      needsFillCount: 7
    });
    const fill = model.lanes.find((l) => l.id === 'pdf_needs_fill');
    assert.equal(fill.ready, 7);
    assert.equal(fill.href, '#/fill/pdf');
    assert.equal(fill.label, 'PDF filler');
    assert.equal(fill.highlight, true);
  });

  it('prefers forge KPI current_month fields for tracker strip', () => {
    const model = lanes.buildLaneModel({
      emailOnly: { total_pending: 0, total_blocked: 0, total_sent_this_month: 1 },
      pdf: { total_pending: 0, total_blocked: 0, total_sent_this_month: 2 },
      online: { total_pending: 0, total_blocked: 0, total_sent_this_month: 3 },
      kpi: {
        current_month_label: 'July 2026',
        current_month_email_sent: 15,
        current_month_email_only_sent: 5,
        current_month_online_submitted: 7,
        current_month_total_submitted: 22
      }
    });
    assert.equal(model.tracker.monthLabel, 'July 2026');
    assert.equal(model.tracker.emailOnly, 5);
    assert.equal(model.tracker.emailPdf, 10);
    assert.equal(model.tracker.onlinePortal, 7);
    assert.equal(model.tracker.total, 22);
  });
});
