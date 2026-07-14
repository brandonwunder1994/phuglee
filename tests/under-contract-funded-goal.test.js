'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

let tmpRoot;
let contracts;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'funded-goal-'));
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/schema')];
  delete require.cache[require.resolve('../lib/leads-platform/contracts')];
  contracts = require('../lib/leads-platform/contracts');
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
});

test('fundedAt stamps when stage becomes Funded', () => {
  const deal = contracts.upsertDeal({
    dealId: 'goal_deal_1',
    address: '100 Goal St',
    city: 'Austin',
    state: 'TX',
    stage: 'under_contract'
  });
  assert.equal(deal.fundedAt, null);

  const funded = contracts.patchDeal(deal.dealId, { stage: 'funded' });
  assert.ok(funded.fundedAt, 'fundedAt must be set on Funded transition');
  assert.equal(funded.stage, 'funded');

  const again = contracts.patchDeal(deal.dealId, { notes: 'still funded' });
  assert.equal(again.fundedAt, funded.fundedAt, 'fundedAt must not change on later saves');
});

test('computeFundedGoal counts Funded Yes deals in the 60-day window toward 10', () => {
  contracts.restartFundedGoal({ targetCount: 10, windowDays: 60 });

  contracts.upsertDeal({
    dealId: 'goal_in_window',
    address: '200 Goal Ave',
    city: 'Austin',
    state: 'TX',
    stage: 'funded',
    fundedAt: new Date().toISOString()
  });
  contracts.upsertDeal({
    dealId: 'goal_old',
    address: '300 Old Rd',
    city: 'Austin',
    state: 'TX',
    stage: 'funded',
    fundedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  });
  contracts.upsertDeal({
    dealId: 'goal_open',
    address: '400 Open Ln',
    city: 'Austin',
    state: 'TX',
    stage: 'under_contract'
  });

  const goal = contracts.computeFundedGoal();
  assert.equal(goal.targetCount, 10);
  assert.equal(goal.windowDays, 60);
  assert.ok(goal.currentCount >= 1);
  assert.ok(goal.fundedDealIds.includes('goal_in_window'));
  assert.ok(!goal.fundedDealIds.includes('goal_old'));
  assert.ok(!goal.fundedDealIds.includes('goal_open'));
  assert.equal(goal.percentToGoal, Math.min(100, Math.round((goal.currentCount / 10) * 100)));
  assert.ok(goal.daysRemaining >= 0 && goal.daysRemaining <= 60);
  assert.ok(goal.msRemaining > 0);
});
