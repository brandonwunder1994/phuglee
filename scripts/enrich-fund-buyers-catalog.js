'use strict';

/**
 * Enrich fund catalog with personality + marketAliases, then sync to public/.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'data', 'fund-buyers', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(src, 'utf8'));

const personality = {
  siren: { speed: 'weekly', pay: 'cash', dd: 'normal', emd: null, tags: ['brick', 'dfw'] },
  odin: { speed: 'fast', pay: 'cash', dd: 'light', emd: null, tags: ['sight-unseen'] },
  neptune: { speed: 'process', pay: 'cash', dd: 'normal', emd: null, tags: ['leaseback'] },
  kraken: { speed: 'normal', pay: 'cash', dd: 'normal', emd: null, tags: ['off-market', 'spread'] },
  vulcan: { speed: 'normal', pay: 'cash', dd: 'normal', emd: null, tags: ['detroit', 'flip'] },
  atlas: { speed: 'hours', pay: 'cash', dd: 'light', emd: null, tags: ['sight-unseen', 'fixer'] },
  titan: { speed: 'title-ready', pay: 'cash', dd: 'none', emd: '$10k NR', tags: ['no-dd'] },
  summit: { speed: 'normal', pay: 'cash-or-creative', dd: 'normal', emd: null, tags: ['creative'] },
  harbor: { speed: 'normal', pay: 'cash-or-creative', dd: 'normal', emd: null, tags: ['waterfront', 'creative'] },
  gaia: { speed: 'same-day', pay: 'cash', dd: 'light', emd: null, tags: ['land', 'dallas'] },
  leviathan: { speed: '5-10 days', pay: 'cash', dd: 'light', emd: null, tags: ['land', 'off-market'] },
  blackfin: { speed: 'normal', pay: 'cash', dd: 'light', emd: null, tags: ['infill', 'land'] }
};

for (const fund of catalog.funds) {
  fund.personality = personality[fund.id] || { speed: 'normal', pay: 'cash', dd: 'normal', emd: null, tags: [] };
}

// Atlas SoCal: remove bare "la" from markets; use aliases for Los Angeles
const atlas = catalog.funds.find((f) => f.id === 'atlas');
if (atlas) {
  const socal = atlas.buyBoxes.find((b) => b.id === 'socal');
  if (socal) {
    socal.markets = (socal.markets || []).filter((m) => String(m).toLowerCase() !== 'la');
    socal.marketAliases = [
      'los angeles', 'l.a.', 'la county', 'san fernando valley', 'orange county'
    ];
  }
  const sac = atlas.buyBoxes.find((b) => b.id === 'sacramento');
  if (sac) sac.marketAliases = ['sacramento ca', 'sac'];
}

// Siren: ensure dfw aliases
const siren = catalog.funds.find((f) => f.id === 'siren');
if (siren && siren.buyBoxes[0]) {
  siren.buyBoxes[0].marketAliases = ['dallas fort worth', 'dallas-fort worth', 'dfw metroplex'];
}

catalog.presets = [
  {
    id: 'dfw-brick',
    label: 'DFW brick',
    deal: {
      city: 'Garland', state: 'TX', assetType: 'sfh', sqft: 1400, beds: 3, baths: 2,
      yearBuilt: 1985, arv: 350000, rehab: 45000, condition: 'light-medium',
      brick: true, garage: true, offMarket: null, leaseback: null, waterfront: null
    }
  },
  {
    id: 'ohio-leaseback',
    label: 'Ohio leaseback',
    deal: {
      city: 'Columbus', state: 'OH', zip: '43215', assetType: 'sfh', sqft: 1100, beds: 3, baths: 1,
      yearBuilt: 1955, asking: 180000, rehab: 25000, condition: 'light',
      leaseback: true, brick: null, garage: null
    }
  },
  {
    id: 'dallas-land',
    label: 'Dallas land 75212',
    deal: {
      city: 'Dallas', state: 'TX', zip: '75212', assetType: 'land', acres: 0.2,
      buildable: true, roadAccess: true, utilitiesNearby: null, offMarket: null
    }
  },
  {
    id: 'swfl-lot',
    label: 'SWFL lot',
    deal: {
      city: 'Cape Coral', state: 'FL', assetType: 'land', acres: 0.5, asking: 180000,
      offMarket: true, buildable: true, roadAccess: true
    }
  },
  {
    id: 'denver-32',
    label: 'Denver 3/2',
    deal: {
      city: 'Denver', state: 'CO', assetType: 'sfh', sqft: 1800, beds: 3, baths: 2,
      condition: 'fixer', offMarket: true
    }
  }
];

catalog.updatedAt = '2026-07-15';
catalog.version = 2;

fs.writeFileSync(src, JSON.stringify(catalog, null, 2) + '\n');
require('./sync-fund-buyers-catalog.js');
console.log('Catalog enriched + synced');
