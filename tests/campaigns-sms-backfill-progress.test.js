'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(os.tmpdir(), `csms-bf-prog-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
process.env.CAMPAIGNS_SMS_DATA_ROOT = root;

// Load after env
const {
  getBackfillProgress,
  persistProgressHighWater,
  highWaterPath,
  progressPath
} = require('../lib/campaigns/sms-backfill-progress');

describe('campaigns SMS backfill progress durability', () => {
  after(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  it('recovers processed count from GHL when checkpoint is missing', () => {
    const r = getBackfillProgress({ ghlPhugleeTotal: 11842 });
    assert.ok(r.processed >= 11842, `expected >= 11842, got ${r.processed}`);
    assert.equal(r.ghlPhugleeTagged, 11842);
    assert.ok(String(r.source).includes('ghl') || r.source === 'merged' || r.source === 'highwater');
  });

  it('never decreases high-water when GHL reports lower', () => {
    persistProgressHighWater({ processed: 10000, tagged: 9000, total: 16000 });
    const r = getBackfillProgress({ ghlPhugleeTotal: 2000 });
    assert.ok(r.processed >= 10000, `high-water should stick, got ${r.processed}`);
    const hw = JSON.parse(fs.readFileSync(highWaterPath(), 'utf8'));
    assert.ok(hw.processed >= 10000);
    const slim = JSON.parse(fs.readFileSync(progressPath(), 'utf8'));
    assert.ok(slim.processed >= 10000);
  });

  it('raises high-water when GHL reports higher', () => {
    const r = getBackfillProgress({ ghlPhugleeTotal: 12500 });
    assert.ok(r.processed >= 12500);
  });
});
