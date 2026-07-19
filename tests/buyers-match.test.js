'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const match = require('../public/js/buyers-match.js');
const urlApi = require('../public/js/buyers-url.js');
const pitch = require('../public/js/buyers-pitch.js');
const ask = require('../public/js/buyers-ask.js');

const catalogPath = path.join(__dirname, '..', 'data', 'buyers', 'catalog.json');
const publicPath = path.join(__dirname, '..', 'public', 'data', 'buyers', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function fundById(id) {
  return catalog.funds.find((f) => f.id === id);
}

test('buyers catalog seeded with metadata', () => {
  // Live buyer intel must NOT be mirrored under public/ (unauthenticated /data/buyers).
  const publicCatalog = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
  assert.ok(Array.isArray(publicCatalog.funds));
  assert.equal(publicCatalog.funds.length, 0);
  assert.ok(catalog.funds.length >= 12);
  assert.equal(catalog.version, 3);
  const siren = fundById('siren');
  assert.equal(siren.buyerType, 'hedge-fund');
  assert.ok(siren.contact);
  assert.ok(siren.exitPctArvMin >= 0.7);
});

test('suggestAsk uses exit % minus rehab', () => {
  const siren = fundById('siren');
  const out = ask.suggestAsk(siren, { arv: 350000, rehab: 40000, asking: 220000 });
  assert.equal(out.ok, true);
  assert.ok(out.mid > 200000);
  assert.ok(out.vsAsking > 0);
});

test('speed rank prefers hours over process among same tier', () => {
  const hours = {
    id: 'a',
    name: 'A',
    personality: { speed: 'hours' },
    strategyClusters: ['fix-flip'],
    buyBoxes: fundById('siren').buyBoxes
  };
  const slow = {
    id: 'b',
    name: 'B',
    personality: { speed: 'process' },
    strategyClusters: ['fix-flip'],
    buyBoxes: fundById('siren').buyBoxes
  };
  const deal = {
    city: 'Garland',
    state: 'TX',
    assetType: 'sfh',
    sqft: 1500,
    beds: 3,
    baths: 2,
    yearBuilt: 1985,
    arv: 350000,
    rehab: 40000,
    brick: true,
    garage: true
  };
  const ranked = match.rankFunds([slow, hours], deal, {});
  assert.equal(ranked[0].fundId, 'a');
});

test('url serialize/parse round trip', () => {
  const state = {
    deal: { city: 'Garland', state: 'TX', assetType: 'sfh' },
    cluster: 'fix-flip',
    tierFilter: 'strong',
    compareIds: ['siren'],
    dealId: null
  };
  const qs = urlApi.serialize(state).toString();
  const parsed = urlApi.parse('?' + qs);
  assert.equal(parsed.deal.city, 'Garland');
  assert.equal(parsed.cluster, 'fix-flip');
  assert.deepEqual(parsed.compareIds, ['siren']);
});

test('pitch includes buyer name', () => {
  const text = pitch.buildPitch(fundById('siren'), {
    tier: 'strong',
    score: 90,
    hits: [{ reason: 'DFW' }],
    blockers: [],
    bestBox: { boxLabel: 'DFW brick SFH' }
  }, { city: 'Garland', state: 'TX', address: '123 Main' });
  assert.match(text, /Siren/);
});

test('addBuyer persists to temp BUYERS_ROOT', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buyers-'));
  fs.copyFileSync(catalogPath, path.join(tmp, 'catalog.json'));
  const storePath = require.resolve('../lib/buyers/store');
  const configPath = require.resolve('../lib/config');
  const prev = process.env.BUYERS_ROOT;
  process.env.BUYERS_ROOT = tmp;
  delete require.cache[configPath];
  delete require.cache[storePath];
  try {
    const store = require('../lib/buyers/store');
    assert.ok(store.rootDir().includes(tmp) || store.rootDir() === tmp);
    const { buyer, catalog: next } = store.addBuyer({
      name: 'Test Flipper LLC',
      markets: 'Dallas, Fort Worth',
      states: 'TX',
      buyerType: 'local',
      exitPctArvMin: 0.7,
      exitPctArvMax: 0.75,
      speed: 'fast',
      contactName: 'Alex',
      contactPhone: '555-0100'
    });
    assert.equal(buyer.name, 'Test Flipper LLC');
    assert.ok(next.funds.some((f) => f.id === buyer.id));
    assert.equal(buyer.contact.phone, '555-0100');
  } finally {
    if (prev == null) delete process.env.BUYERS_ROOT;
    else process.env.BUYERS_ROOT = prev;
    delete require.cache[configPath];
    delete require.cache[storePath];
  }
});
