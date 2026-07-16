'use strict';

/**
 * Seed data/buyers/catalog.json from fund-buyers with buyer metadata.
 * Also syncs public/data/buyers/catalog.json as a seed mirror.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcFund = path.join(root, 'data', 'fund-buyers', 'catalog.json');
const dest = path.join(root, 'data', 'buyers', 'catalog.json');
const publicDest = path.join(root, 'public', 'data', 'buyers', 'catalog.json');

const EXIT = {
  siren: { exitPctArvMin: 0.75, exitPctArvMax: 0.78, exitFormula: 'arv_pct_minus_rehab' },
  odin: { exitPctArvMin: 0.7, exitPctArvMax: 0.75, exitFormula: 'arv_pct_minus_rehab' },
  neptune: { exitPctArvMin: 0.7, exitPctArvMax: 0.78, exitFormula: 'arv_pct_minus_rehab' },
  kraken: { exitPctArvMin: 0.65, exitPctArvMax: 0.75, exitFormula: 'arv_pct_minus_rehab' },
  vulcan: { exitPctArvMin: 0.65, exitPctArvMax: 0.75, exitFormula: 'arv_pct_minus_rehab' },
  atlas: { exitPctArvMin: 0.65, exitPctArvMax: 0.75, exitFormula: 'arv_pct_minus_rehab' },
  titan: { exitPctArvMin: 0.7, exitPctArvMax: 0.8, exitFormula: 'arv_pct_minus_rehab' },
  summit: { exitPctArvMin: null, exitPctArvMax: null, exitFormula: null },
  harbor: { exitPctArvMin: null, exitPctArvMax: null, exitFormula: null },
  gaia: { exitPctArvMin: null, exitPctArvMax: null, exitFormula: null },
  leviathan: { exitPctArvMin: 0.65, exitPctArvMax: 0.75, exitFormula: 'arv_pct_minus_rehab' },
  blackfin: { exitPctArvMin: 0.7, exitPctArvMax: 0.8, exitFormula: 'arv_pct_minus_rehab' }
};

const base = JSON.parse(fs.readFileSync(srcFund, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

base.version = 3;
base.updatedAt = today;
base.title = 'Buyers';
base.description = 'Known cash buyers and fund buy boxes — cross-referenced on Under Contract.';

base.funds = (base.funds || []).map((f) => {
  const exit = EXIT[f.id] || {};
  return Object.assign({}, f, {
    buyerType: f.buyerType || 'hedge-fund',
    kind: f.kind || 'known-buyer',
    source: f.source || 'wholesale-brain',
    updatedAt: f.updatedAt || today,
    contact: f.contact && typeof f.contact === 'object'
      ? f.contact
      : { name: '', phone: '', email: '', notes: '' },
    exitPctArvMin: f.exitPctArvMin != null ? f.exitPctArvMin : exit.exitPctArvMin,
    exitPctArvMax: f.exitPctArvMax != null ? f.exitPctArvMax : exit.exitPctArvMax,
    exitFormula: f.exitFormula || exit.exitFormula || null
  });
});

// Alias: funds[] remains for matcher; buyers[] mirrors same list
base.buyers = base.funds;

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.mkdirSync(path.dirname(publicDest), { recursive: true });
const body = JSON.stringify(base, null, 2) + '\n';
fs.writeFileSync(dest, body);
fs.writeFileSync(publicDest, body);
console.log('Migrated buyers catalog:', base.funds.length, 'buyers →', dest);
