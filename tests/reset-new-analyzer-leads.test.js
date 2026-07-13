'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resetNewAnalyzerLeadsSession,
  normalizeGeoKey
} = require('../modules/property-analyzer/lib/reset-new-analyzer-leads');

test('hard reset removes New Analyzer results and injects fresh queue', () => {
  const geo = normalizeGeoKey('100 Main', 'Austin', 'TX');
  const session = {
    results: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main',
        city: 'Austin',
        state: 'TX',
        importSource: 'new_analyzer_leads_2026-07-11',
        leadTier: 'well_maintained',
        score: 2
      },
      {
        email: 'old@x.com',
        phone: '9',
        street: '999 Elder',
        city: 'Waco',
        state: 'TX',
        leadTier: 'distressed',
        score: 8
      }
    ],
    records: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main',
        city: 'Austin',
        state: 'TX',
        importSource: 'new_analyzer_leads_2026-07-11'
      }
    ],
    importBatches: [{ id: 'batch_new_analyzer_leads_1', sourceFile: 'New Analyzer Leads.csv' }]
  };

  const { session: next, stats } = resetNewAnalyzerLeadsSession(session, {
    geoKeys: [geo],
    freshRecords: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main',
        city: 'Austin',
        state: 'TX',
        importSource: 'new_analyzer_leads_2026-07-11',
        sourceFile: 'New Analyzer Leads.csv'
      }
    ],
    fileName: 'New Analyzer Leads.csv'
  });

  assert.equal(stats.removedResults, 1);
  assert.equal(next.results.length, 1);
  assert.equal(next.results[0].street, '999 Elder');
  assert.equal(stats.addedFresh, 1);
  assert.equal(next.records.length, 1);
  assert.equal(next.records[0].street, '100 Main');
  assert.ok(!next.records[0].score);
  assert.equal(next.fileName, 'New Analyzer Leads.csv');
});
