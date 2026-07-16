'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const match = require('../public/js/trust-funds-match.js');
const urlApi = require('../public/js/trust-funds-url.js');
const pitch = require('../public/js/trust-funds-pitch.js');

const catalogPath = path.join(__dirname, '..', 'data', 'fund-buyers', 'catalog.json');
const publicPath = path.join(__dirname, '..', 'public', 'data', 'fund-buyers', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function fundById(id) {
  return catalog.funds.find((f) => f.id === id);
}

test('catalog synced to public/data', () => {
  const a = fs.readFileSync(catalogPath, 'utf8');
  const b = fs.readFileSync(publicPath, 'utf8');
  assert.equal(a, b);
  assert.equal(catalog.funds.length, 12);
  assert.ok(catalog.presets && catalog.presets.length >= 5);
});

test('geo miss hard-fails even if numbers fit', () => {
  const siren = fundById('siren');
  const result = match.scoreFund(siren, {
    state: 'OH',
    city: 'Columbus',
    assetType: 'sfh',
    sqft: 1400,
    beds: 3,
    baths: 2,
    yearBuilt: 1980,
    arv: 350000,
    rehab: 40000,
    brick: true,
    garage: true
  });
  assert.equal(result.tier, match.TIER_MISS);
  assert.ok(result.blockers.some((r) => /geo miss/i.test(r.reason)));
});

test('Siren-shaped DFW brick scores Strong', () => {
  const siren = fundById('siren');
  const result = match.scoreFund(siren, {
    state: 'TX',
    city: 'Garland',
    assetType: 'sfh',
    sqft: 1400,
    beds: 3,
    baths: 2,
    yearBuilt: 1985,
    arv: 350000,
    rehab: 45000,
    condition: 'light-medium',
    brick: true,
    garage: true
  });
  assert.equal(result.tier, match.TIER_STRONG);
  assert.ok(result.score >= 70);
  assert.ok(result.hits.some((r) => /geo hit/i.test(r.reason)));
});

test('Plano TX does not false-hit Atlas LA market', () => {
  const atlas = fundById('atlas');
  const socal = atlas.buyBoxes.find((b) => b.id === 'socal');
  const geo = match.scoreGeography(socal, { state: 'TX', city: 'Plano' });
  assert.equal(geo.hit, false);
  const la = match.scoreGeography(socal, { state: 'CA', city: 'Los Angeles' });
  assert.equal(la.hit, true);
});

test('tri-state: unknown brick does not soft-penalize like explicit no', () => {
  const siren = fundById('siren');
  const unknown = match.scoreBuyBox(siren.buyBoxes[0], {
    state: 'TX',
    city: 'Garland',
    assetType: 'sfh',
    sqft: 1400,
    beds: 3,
    baths: 2,
    yearBuilt: 1985,
    arv: 350000,
    rehab: 45000,
    brick: null,
    garage: true
  });
  const no = match.scoreBuyBox(siren.buyBoxes[0], {
    state: 'TX',
    city: 'Garland',
    assetType: 'sfh',
    sqft: 1400,
    beds: 3,
    baths: 2,
    yearBuilt: 1985,
    arv: 350000,
    rehab: 45000,
    brick: false,
    garage: true
  });
  assert.ok(unknown.score > no.score, 'unknown should score higher than explicit no');
  assert.ok(unknown.unknowns.some((u) => /brick/i.test(u.label)));
});

test('land deal prefers Gaia / Leviathan / Blackfin', () => {
  const ranked = match.rankFunds(catalog.funds, {
    state: 'FL',
    city: 'Cape Coral',
    assetType: 'land',
    acres: 0.5,
    asking: 180000,
    offMarket: true,
    buildable: true,
    roadAccess: true
  });
  const fits = ranked.filter((r) => r.tier === match.TIER_STRONG || r.tier === match.TIER_PARTIAL);
  assert.ok(fits.some((r) => r.fundId === 'leviathan'));
  assert.ok(fits.some((r) => r.fundId === 'blackfin'));
});

test('land asset does not require cluster filter to surface land funds', () => {
  const ranked = match.rankFunds(catalog.funds, {
    state: 'TX',
    city: 'Dallas',
    zip: '75212',
    assetType: 'land',
    acres: 0.2
  }, { cluster: '' });
  const gaia = ranked.find((r) => r.fundId === 'gaia');
  assert.ok(gaia);
  assert.notEqual(gaia.tier, match.TIER_MISS);
});

test('empty deal returns unknown browse mode including land funds', () => {
  const ranked = match.rankFunds(catalog.funds, {});
  assert.equal(ranked.length, 12);
  assert.ok(ranked.every((r) => r.tier === match.TIER_UNKNOWN));
  const landIds = ranked
    .filter((r) => (r.fund.strategyClusters || []).includes('land'))
    .map((r) => r.fundId)
    .sort();
  assert.deepEqual(landIds, ['blackfin', 'gaia', 'leviathan']);
});

test('URL serialize/parse round-trip', () => {
  const params = urlApi.serialize({
    deal: {
      city: 'Garland', state: 'TX', assetType: 'sfh', arv: 350000, brick: true, garage: null
    },
    cluster: '',
    compareIds: ['siren', 'neptune'],
    showMisses: true
  });
  const parsed = urlApi.parse('?' + params.toString());
  assert.equal(parsed.deal.city, 'Garland');
  assert.equal(parsed.deal.state, 'TX');
  assert.equal(parsed.deal.brick, true);
  assert.equal(parsed.deal.garage, null);
  assert.deepEqual(parsed.compareIds, ['siren', 'neptune']);
  assert.equal(parsed.showMisses, true);
});

test('pitch builder returns non-empty text', () => {
  const siren = fundById('siren');
  const row = match.scoreFund(siren, {
    state: 'TX', city: 'Garland', assetType: 'sfh', sqft: 1400, beds: 3, baths: 2,
    yearBuilt: 1985, arv: 350000, rehab: 45000, brick: true, garage: true
  });
  const text = pitch.buildPitch(siren, row, { city: 'Garland', state: 'TX', address: '123 Main' });
  assert.ok(text.includes('Siren'));
  assert.ok(text.includes('Hits:'));
});

test('multi-box funds expose boxScores', () => {
  const atlas = fundById('atlas');
  const row = match.scoreFund(atlas, {
    state: 'CA', city: 'Sacramento', assetType: 'sfh', sqft: 1400, beds: 3, baths: 2,
    asking: 400000, offMarket: true
  });
  assert.ok(row.boxScores.length >= 2);
  assert.equal(row.bestBox.boxId, 'sacramento');
});
