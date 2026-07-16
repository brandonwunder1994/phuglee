const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isNonDisclosureState } = require('../lib/leads-platform/comping/nd-states');
const { normalizeLeadRecord } = require('../lib/leads-platform/schema');
const { mergeIncomingWithCatalogLead } = require('../lib/leads-platform/analyzer-sync');

describe('nd-states', () => {
  it('treats TX as non-disclosure', () => {
    assert.equal(isNonDisclosureState('TX'), true);
    assert.equal(isNonDisclosureState('tx'), true);
  });
  it('treats CA as disclosure', () => {
    assert.equal(isNonDisclosureState('CA'), false);
  });
});

describe('schema comp fields', () => {
  it('normalizes comping fields', () => {
    const lead = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 250000,
      compSource: 'manual_propelio',
      compConfidence: 'manual',
      compedAt: '2026-07-15T00:00:00.000Z',
      comps: [{ address: '2 Main', price: 240000, soldDate: '2026-01-01', sqft: 1400 }],
      compingReport: { version: '1', arv: 250000, confidence: 'manual' },
      compReportFiles: [{ id: 'f1', filename: 'cma.pdf', mime: 'application/pdf', size: 10, uploadedAt: '2026-07-15T00:00:00.000Z', path: 'x' }]
    });
    assert.equal(lead.compSource, 'manual_propelio');
    assert.equal(lead.compConfidence, 'manual');
    assert.equal(lead.comps.length, 1);
    assert.equal(lead.compReportFiles[0].filename, 'cma.pdf');
  });
});

describe('analyzer-sync comp preserve', () => {
  it('keeps comped estARV when incoming has AVM', () => {
    const existing = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 300000,
      compSource: 'manual_propelio',
      compedAt: '2026-07-15T00:00:00.000Z',
      comps: [{ address: '2 Main', price: 290000 }]
    });
    const incoming = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 111111
    });
    const merged = mergeIncomingWithCatalogLead(existing, incoming);
    assert.equal(merged.estARV, 300000);
    assert.equal(merged.compSource, 'manual_propelio');
    assert.equal(merged.comps.length, 1);
  });
});
