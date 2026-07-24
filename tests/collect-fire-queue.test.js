'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fq = require('../public/js/collect-fire-queue.js');

describe('normalizeFireItems', () => {
  it('maps pending email-only rows and blocked list', () => {
    const out = fq.normalizeFireItems(
      {
        current_month_label: 'July 2026',
        total_sent_this_month: 9,
        items: [
          { id: 'tx-austin', city: 'Austin', state: 'Texas', contact_email: 'clerk@austin.gov' },
          { id: 'tx-none', city: 'Nowhere', state: 'Texas', contact_email: '' }
        ],
        blocked: [{ id: 'tx-hold', city: 'Hold', state: 'Texas', blocked_reason: 'Cooldown' }]
      },
      'email_only'
    );
    assert.equal(out.items.length, 2);
    assert.equal(out.items[0].checked, true);
    assert.equal(out.items[0].channel, 'email_only');
    assert.equal(out.items[1].checked, false);
    assert.equal(out.items[1].disabled, true);
    assert.equal(out.blocked.length, 1);
    assert.equal(out.monthLabel, 'July 2026');
    assert.equal(out.sentThisMonth, 9);
  });

  it('flags pdf apology cities', () => {
    const out = fq.normalizeFireItems(
      {
        items: [
          {
            id: 'az-x',
            city: 'X',
            state: 'Arizona',
            contact_email: 'a@b.com',
            apology_email: { show_button: true }
          }
        ],
        blocked: []
      },
      'email_pdf'
    );
    assert.equal(out.items[0].needsApology, true);
    assert.equal(out.items[0].channel, 'email_pdf');
    assert.equal(out.items[0].checked, true);
  });
});

describe('selectedIds + dripPlan', () => {
  it('selectedIds returns only checked enabled', () => {
    const ids = fq.selectedIds([
      { id: 'a', checked: true, disabled: false },
      { id: 'b', checked: false, disabled: false },
      { id: 'c', checked: true, disabled: true }
    ]);
    assert.deepEqual(ids, ['a']);
  });

  it('dripPlan spaces steps after the first', () => {
    const plan = fq.dripPlan(['a', 'b', 'c'], { delayMs: 5000 });
    assert.equal(plan.steps.length, 3);
    assert.equal(plan.steps[0].delayMs, 0);
    assert.equal(plan.steps[1].delayMs, 5000);
    assert.equal(plan.steps[2].delayMs, 5000);
    assert.equal(plan.steps[1].id, 'b');
  });
});

describe('sendPathForItem + buildSendBody', () => {
  it('email_only path', () => {
    const item = {
      id: 'tx-a',
      channel: 'email_only',
      contactEmail: 'c@x.com',
      needsApology: false
    };
    assert.ok(fq.sendPathForItem(item).endsWith('/city/tx-a/send-email-only'));
    const body = fq.buildSendBody(item);
    assert.equal(body.request_type, 'code_violation');
    assert.equal(body.email, 'c@x.com');
  });

  it('pdf apology path', () => {
    const item = {
      id: 'az-a',
      channel: 'email_pdf',
      contactEmail: 'c@x.com',
      needsApology: true
    };
    assert.ok(fq.sendPathForItem(item).includes('send-apology-email'));
  });

  it('pdf regular path', () => {
    const item = {
      id: 'az-b',
      channel: 'email_pdf',
      contactEmail: 'c@x.com',
      needsApology: false
    };
    assert.ok(fq.sendPathForItem(item).endsWith('/city/az-b/send-email'));
  });
});
