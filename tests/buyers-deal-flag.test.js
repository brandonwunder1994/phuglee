'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const flag = require('../public/js/buyers-deal-flag.js');
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'buyers', 'catalog.json'), 'utf8')
);

test('evaluateDeal marks strong DFW brick as buyer fit', () => {
  const deal = {
    dealId: 'd1',
    address: '100 Main St, Garland, TX 75040',
    city: 'Garland',
    state: 'TX',
    zip: '75040',
    purchasePrice: 220000,
    arv: 350000,
    rehabEstimate: 40000,
    sqft: 1600,
    beds: 3,
    baths: 2,
    yearBuilt: 1982
  };
  const out = flag.evaluateDeal(deal, catalog.funds);
  assert.equal(out.hit, true);
  assert.ok(out.href.includes('/buyers?deal=d1'));
  assert.match(out.label, /Buyer fit|Possible buyer fit/);
});

test('flagDeals attaches buyerMatch and legacy trustFundMatch', async () => {
  const deals = await flag.flagDeals([
    {
      dealId: 'd2',
      address: '200 Oak, Garland, TX',
      city: 'Garland',
      state: 'TX',
      purchasePrice: 210000,
      arv: 340000,
      rehabEstimate: 35000,
      sqft: 1500,
      beds: 3,
      baths: 2,
      yearBuilt: 1980
    }
  ], {
    fetch: async () => ({
      ok: true,
      json: async () => catalog
    })
  });
  assert.equal(deals[0].buyerMatch.hit, deals[0].trustFundMatch.hit);
});
