'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  detectLandScrubTags,
  preferLandPath,
  summarizeLandRoute,
  landScrubLabels,
  LAND_VAULT_SIGNAL_CHIPS
} = require('../lib/leads-platform/land/filter-route');
const { getTaxDirtScript, leadHasTaxDirtSignal } = require('../lib/leads-platform/land/tax-dirt-script');
const { tagRow } = require('../lib/bridge-distress-tagger');

describe('Filter → Land routing', () => {
  it('tags tax delinquent vacant lots and prefers land', () => {
    const row = {
      streetAddress: '100 Empty Rd',
      descriptionNotes: 'Vacant lot — delinquent taxes 2022-2024'
    };
    const tags = detectLandScrubTags({ uploadType: 'tax_delinquent', row });
    assert.ok(tags.includes('tax_delinquent'));
    assert.ok(tags.includes('vacant_lot'));
    assert.equal(preferLandPath({ uploadType: 'tax_delinquent', scrubTags: tags }), true);
    assert.deepEqual(
      landScrubLabels(['tax_delinquent', 'code_vacant']),
      ['Tax delinquent', 'Code (vacant)']
    );
  });

  it('does not prefer NOD / lis_pendens alone', () => {
    const row = {
      streetAddress: '55 Foreclose Ave',
      descriptionNotes: 'Notice of default recorded'
    };
    assert.equal(preferLandPath({ uploadType: 'lis_pendens', row }), false);
    assert.equal(preferLandPath({ uploadType: 'pre_foreclosure', row }), false);
  });

  it('prefers land for NOD only when parcel is vacant', () => {
    const row = {
      streetAddress: '9 Lot Ln',
      descriptionNotes: 'NOD on vacant lot with no dwelling'
    };
    assert.equal(preferLandPath({ uploadType: 'lis_pendens', row }), true);
  });

  it('tags code weeds on vacant parcels as code_vacant', () => {
    const row = {
      streetAddress: '12 Weeds Ct',
      violationIssueType: 'Weeds',
      descriptionNotes: 'High grass on vacant lot'
    };
    const tags = detectLandScrubTags({ uploadType: 'code_violation', row });
    assert.ok(tags.includes('code_vacant'));
    assert.ok(tags.includes('vacant_lot'));
    assert.equal(preferLandPath({ uploadType: 'code_violation', scrubTags: tags }), true);
  });

  it('summarizeLandRoute prefers tax lists', () => {
    const summary = summarizeLandRoute([
      { streetAddress: '1 A', descriptionNotes: 'tax delinquent' },
      { streetAddress: '2 B', descriptionNotes: 'vacant lot unpaid tax' }
    ], 'tax_delinquent');
    assert.equal(summary.preferLand, true);
    assert.ok(summary.landPreferRowCount >= 2);
    assert.ok(summary.suggestedAnalyzeHint);
  });

  it('summarizeLandRoute does not prefer NOD lists without vacant majority', () => {
    const summary = summarizeLandRoute([
      { streetAddress: '1 A', descriptionNotes: 'NOD house' },
      { streetAddress: '2 B', descriptionNotes: 'lis pendens SFR' }
    ], 'lis_pendens');
    assert.equal(summary.preferLand, false);
  });

  it('tagRow attaches landScrubTags without changing tax default tag', () => {
    const tagged = tagRow({
      streetAddress: '88 Dirt',
      descriptionNotes: 'Vacant parcel tax sale auction'
    }, 'tax_delinquent');
    assert.ok(tagged.landScrubTags.includes('tax_delinquent'));
    assert.ok(tagged.preferLandPath);
    assert.match(tagged.distressedSignalTag, /Tax Delinquent/i);
  });

  it('exposes Land Vault signal chip labels', () => {
    assert.deepEqual(LAND_VAULT_SIGNAL_CHIPS, [
      'Tax delinquent',
      'Code (vacant)',
      'Auction/tax sale'
    ]);
  });
});

describe('Tax Dirt script', () => {
  it('returns copy lines', () => {
    const s = getTaxDirtScript();
    assert.equal(s.id, 'tax-dirt');
    assert.ok(s.lines.length >= 2);
    assert.ok(leadHasTaxDirtSignal({ signalTags: ['Tax delinquent'] }));
    assert.equal(leadHasTaxDirtSignal({ signalTags: ['Code violation'] }), false);
  });
});

describe('Filter save attaches landRoute metadata', () => {
  let tmpRoot;
  let listStore;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-filter-lists-'));
    process.env.FILTER_LISTS_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/bridge-list-store')];
    listStore = require('../lib/bridge-list-store');
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.FILTER_LISTS_ROOT;
  });

  it('saveList stores preferLand on tax delinquent list', () => {
    process.env.FILTER_LISTS_ROOT = tmpRoot;
    const saved = listStore.saveList({
      name: 'Tax Dirt Test',
      uploadType: 'tax_delinquent',
      city: 'Dallas',
      state: 'TX',
      username: 'alice',
      plan: 'max',
      rows: [
        {
          streetAddress: '100 Lot',
          city: 'Dallas',
          state: 'TX',
          descriptionNotes: 'Vacant lot delinquent taxes',
          distressedSignalTag: 'Tax Delinquent – High Value Distress Signal',
          uploadType: 'tax_delinquent'
        }
      ]
    });
    assert.ok(saved.meta.landRoute);
    assert.equal(saved.meta.landRoute.preferLand, true);
    assert.ok(saved.meta.landRoute.scrubTagCounts.tax_delinquent >= 1);
  });
});
