'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const flag = require('../public/js/trust-funds-deal-flag.js');
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'fund-buyers', 'catalog.json'), 'utf8')
);

test('Garland TX UC deal flags Siren strong fit', () => {
  const deal = {
    dealId: 'deal_test_1',
    address: '100 Main St, Garland, TX 75040',
    city: 'Garland',
    state: 'TX',
    zip: '75040',
    purchasePrice: 200000
  };
  const result = flag.evaluateDeal(deal, catalog.funds);
  assert.equal(result.hit, true);
  assert.ok(result.funds.some((f) => f.id === 'siren'));
  assert.ok(result.href.includes('deal_test_1'));
});

test('random out-of-market deal does not false-flag', () => {
  const deal = {
    dealId: 'deal_test_2',
    address: '1 Nowhere Rd',
    city: 'Boise',
    state: 'ID',
    zip: '83702',
    purchasePrice: 200000
  };
  const result = flag.evaluateDeal(deal, catalog.funds);
  assert.equal(result.hit, false);
});

test('mapDeal parses city/state from address line', () => {
  const model = flag.mapDeal({
    address: '55 Oak Ave, Frisco, TX 75034',
    purchasePrice: 250000
  });
  assert.equal(model.city, 'Frisco');
  assert.equal(model.state, 'TX');
  assert.equal(model.zip, '75034');
  assert.equal(model.assetType, 'sfh');
});
