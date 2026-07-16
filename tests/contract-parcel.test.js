const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mapReapiDetail } = require('../lib/leads-platform/comping/reapi-client');
const {
  readContractParcelFields,
  needsContractParcelPull,
  applyContractParcelToLead,
  ensureContractParcelFields,
  seedAocSendParcel
} = require('../lib/leads-platform/contract-parcel');
const { extractParcelFields } = require('../lib/leads-platform/land/parcel');

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/comping/reapi-property-detail-land.json'),
    'utf8'
  )
);

describe('contract parcel from REAPI', () => {
  it('maps legalDescription from lotInfo', () => {
    const d = mapReapiDetail(fixture);
    assert.match(d.legalDescription, /LOT 12/);
    assert.equal(d.apn, '011279232');
  });

  it('skips REAPI when APN and legal already present', async () => {
    const reapi = {
      async propertyDetail() {
        assert.fail('should not call REAPI');
      }
    };
    const lead = {
      propertyDetails: {
        apn: '99-1',
        legalDescription: 'Existing legal'
      }
    };
    const out = await ensureContractParcelFields(lead, reapi);
    assert.equal(out.ok, true);
    assert.equal(out.skipped, true);
    assert.equal(out.pulled, false);
    assert.equal(out.fields.apn, '99-1');
  });

  it('fills blanks from PropertyDetail and keeps operator APN', async () => {
    const reapi = {
      async propertyDetail() {
        return mapReapiDetail(fixture);
      }
    };
    const lead = {
      address: '123 Vacant Lot St',
      city: 'Saint Petersburg',
      state: 'FL',
      zip: '33701',
      propertyDetails: { apn: 'OPERATOR-APN' }
    };
    const out = await ensureContractParcelFields(lead, reapi);
    assert.equal(out.ok, true);
    assert.equal(out.pulled, true);
    assert.ok(out.filled.includes('legalDescription'));
    assert.ok(!out.filled.includes('apn'));
    assert.equal(out.fields.apn, 'OPERATOR-APN');
    assert.match(out.fields.legalDescription, /LOT 12/);
    const pd = extractParcelFields(out.lead);
    assert.equal(pd.apn, 'OPERATOR-APN');
    assert.match(pd.legalDescription, /LOT 12/);
  });

  it('seeds aocSend fill-blanks only', () => {
    const deal = { aocSend: { apn: 'KEEP', buyerEmail: 'a@b.com' } };
    const { deal: next, changed } = seedAocSendParcel(deal, {
      apn: 'NEW',
      legalDescription: 'Legal from REAPI'
    });
    assert.equal(changed, true);
    assert.equal(next.aocSend.apn, 'KEEP');
    assert.equal(next.aocSend.legalDescription, 'Legal from REAPI');
  });

  it('treats title-company placeholder as blank and overwrites aocSend', () => {
    const deal = {
      aocSend: {
        apn: 'Q6521033000054',
        legalDescription: 'To be provided by title company'
      }
    };
    assert.equal(
      needsContractParcelPull(readContractParcelFields({}, deal)),
      true
    );
    const { deal: next, changed } = seedAocSendParcel(deal, {
      apn: 'Q6521033000054',
      legalDescription: 'REAL LEGAL LOT 1'
    });
    assert.equal(changed, true);
    assert.equal(next.aocSend.legalDescription, 'REAL LEGAL LOT 1');
  });

  it('needsContractParcelPull detects blanks', () => {
    assert.equal(needsContractParcelPull({ apn: '1', legalDescription: 'x' }), false);
    assert.equal(needsContractParcelPull({ apn: '1', legalDescription: '' }), true);
    assert.equal(needsContractParcelPull(readContractParcelFields({})), true);
  });

  it('applyContractParcelToLead fill-blanks', () => {
    const { lead, filled } = applyContractParcelToLead(
      { propertyDetails: {} },
      { apn: 'A', legalDescription: 'L' }
    );
    assert.deepEqual(filled.sort(), ['apn', 'legalDescription']);
    assert.equal(lead.parcel, 'A');
    assert.equal(lead.propertyDetails.legalDescription, 'L');
  });
});
