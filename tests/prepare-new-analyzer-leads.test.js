'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  prepareNewAnalyzerLeadsSession
} = require('../modules/property-analyzer/lib/prepare-new-analyzer-leads');

test('prepare opens soft-reviewed New Analyzer leads and requeues unavailable', () => {
  const session = {
    results: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main',
        city: 'Austin',
        state: 'TX',
        address: '100 Main, Austin, TX',
        importSource: 'new_analyzer_leads_2026-07-11',
        sourceFile: 'New Analyzer Leads.csv',
        leadTier: 'well_maintained',
        manuallyReviewed: true,
        manuallyReviewedVia: 'review_session'
      },
      {
        email: 'b@x.com',
        phone: '2',
        street: '200 Oak',
        city: 'Austin',
        state: 'TX',
        address: '200 Oak, Austin, TX',
        importSource: 'new_analyzer_leads_2026-07-11',
        sourceFile: 'New Analyzer Leads.csv',
        leadTier: 'unavailable',
        category: 'unavailable'
      },
      {
        email: 'c@x.com',
        phone: '3',
        street: '300 Pine',
        city: 'Austin',
        state: 'TX',
        address: '300 Pine, Austin, TX',
        importSource: 'other',
        leadTier: 'distressed',
        manuallyReviewed: true,
        manuallyReviewedVia: 'review_keep'
      }
    ],
    records: [
      {
        email: 'a@x.com',
        phone: '1',
        street: '100 Main',
        city: 'Austin',
        state: 'TX',
        address: '100 Main, Austin, TX',
        importSource: 'new_analyzer_leads_2026-07-11',
        sourceFile: 'New Analyzer Leads.csv'
      }
    ],
    reviewedKeysByFilter: {
      well_maintained: ['a@x.com|1|100 Main, Austin, TX']
    }
  };

  const { session: next, stats } = prepareNewAnalyzerLeadsSession(session);

  assert.equal(stats.clearedSoft, 1);
  assert.equal(stats.requeuedUnavailable, 1);
  assert.equal(next.results.length, 3); // WM + unavailable kept + non-sheet
  const wm = next.results.find((r) => r.street === '100 Main');
  assert.ok(wm);
  assert.equal(!!wm.manuallyReviewed, false);
  assert.ok(next.records.some((r) => r.street === '200 Oak' && r.forceRescan));
  assert.ok(!next.records.some((r) => r.street === '100 Main')); // already good result
});
