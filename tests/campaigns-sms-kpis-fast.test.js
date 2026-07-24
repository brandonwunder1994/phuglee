'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(os.tmpdir(), `csms-kpi-fast-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
process.env.CAMPAIGNS_SMS_DATA_ROOT = root;

// Load after env so dataRoot points at temp
const { writeJsonAtomic } = require('../lib/write-json-atomic');
const kpis = require('../lib/campaigns/sms-kpis');

describe('campaigns SMS KPI fast path', () => {
  after(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  it('cold overview returns placeholder without blocking on GHL', async () => {
    kpis.clearKpiCache();
    const t0 = Date.now();
    const r = await kpis.fetchOverviewKpis();
    const ms = Date.now() - t0;
    assert.ok(ms < 500, `expected sub-500ms cold path, got ${ms}ms`);
    assert.equal(r.kpisLoading, true);
    assert.equal(r.cached, true);
    assert.ok(r.outcomes);
    assert.ok(r.funnel);
  });

  it('snapshot overview is instant and serves last counts', async () => {
    kpis.clearKpiCache();
    writeJsonAtomic(path.join(root, 'kpi-snapshot.json'), {
      scope: 'phuglee',
      note: 'test snapshot',
      outcomes: {
        interested: 7,
        notInterested: 2,
        personOptOut: 1,
        systemSmsBlock: 3,
        dncDnd: 4,
        dnc: 1,
        dnd: 3,
        wrongNumber: 0,
        followUp: 1
      },
      funnel: {
        phugleeContacts: 100,
        neverTexted: 40,
        inSequence: 50,
        atMax: 10,
        eligibleNow: 25,
        codeViolationContacts: 100,
        sampled: 100,
        totalReported: 100,
        approximate: false,
        sentThisWeek: 0,
        sentAllTime: 0
      },
      computedAt: new Date().toISOString()
    });
    const t0 = Date.now();
    const r = await kpis.fetchOverviewKpis();
    const ms = Date.now() - t0;
    assert.ok(ms < 200, `expected sub-200ms snapshot path, got ${ms}ms`);
    assert.equal(r.outcomes.interested, 7);
    assert.equal(r.funnel.eligibleNow, 25);
    assert.equal(r.cached, true);
    assert.equal(r.kpisLoading, false);
  });
});
