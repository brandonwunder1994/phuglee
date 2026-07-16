const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  recommendLandVerdict,
  normalizeLandScreen,
  emptyChecks
} = require('../lib/leads-platform/land/screen');
const { normalizeLeadRecord } = require('../lib/leads-platform/schema');

function allPassChecks() {
  const checks = emptyChecks();
  for (const id of Object.keys(checks)) {
    checks[id] = { status: 'pass', note: '' };
  }
  return checks;
}

describe('land screen', () => {
  it('tosses when demand fails', () => {
    assert.equal(recommendLandVerdict({
      demandBuilders: { status: 'fail' },
      checks: allPassChecks()
    }), 'toss');
  });

  it('tosses when any check fails', () => {
    const checks = allPassChecks();
    checks.flood = { status: 'fail', note: '100yr' };
    assert.equal(recommendLandVerdict({
      demandBuilders: { status: 'pass' },
      checks
    }), 'toss');
  });

  it('keeps when demand + all seven pass', () => {
    assert.equal(recommendLandVerdict({
      demandBuilders: { status: 'pass' },
      checks: allPassChecks()
    }), 'keep');
  });

  it('returns null when unknowns remain without fails', () => {
    assert.equal(recommendLandVerdict({
      demandBuilders: { status: 'pass' },
      checks: emptyChecks()
    }), null);
  });

  it('normalizes landScreen defaults on land leads', () => {
    const lead = normalizeLeadRecord({
      leadId: 'a',
      address: 'Lot 1',
      city: 'Dallas',
      state: 'TX',
      leadType: 'land',
      reviewStatus: 'approved',
      signalTags: []
    });
    assert.equal(lead.landScreen.verdict, 'pending');
    assert.equal(lead.landScreen.checks.infill.status, 'unknown');
    assert.deepEqual(lead.fundMatches, []);
  });

  it('normalizeLandScreen preserves pass notes', () => {
    const screen = normalizeLandScreen({
      demandBuilders: { status: 'pass', note: 'new builds' },
      checks: { infill: { status: 'pass', note: 'L/R homes' } },
      verdict: 'keep'
    });
    assert.equal(screen.demandBuilders.note, 'new builds');
    assert.equal(screen.checks.infill.status, 'pass');
    assert.equal(screen.verdict, 'keep');
  });
});
