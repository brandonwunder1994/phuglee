const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rowToEnrichment,
  mergeEnrichmentIntoLead,
  parseCsv,
  isTruthyFlag
} = require('../lib/leads-platform/csv-enrich');

test('rowToEnrichment keeps property/financial and true flags only', () => {
  const enrichment = rowToEnrichment({
    FirstName: 'Ann',
    LastName: 'Lee',
    PropertyAddress: '123 Main St',
    PropertyCity: 'Tyler',
    PropertyState: 'TX',
    PropertyPostalCode: '75701',
    Latitude: '32.3',
    Longitude: '-95.3',
    OwnerType: 'INDIVIDUAL',
    Beds: '3',
    Baths: '2',
    SquareFootage: '1600',
    YearBuilt: '1988',
    Heating: 'Central',
    AirConditioning: 'N/A',
    Roof: 'Shingle',
    Basement: '0',
    Fireplace: '0',
    AVM: '$250,000',
    WholesaleValue: '$160,000',
    EstimatedMortgageBalance: '$100,000',
    LTV: '40%',
    HighEquity: '1',
    BoredInvestor: '0',
    CashBuyer: '1',
    AuctionDate: '',
    LastNoticeDate: '1/2/2026',
    Contact1Phone_1: '2145551212',
    Contact1Phone_1_Litigator: 'FALSE',
    Contact1Email_1: 'a@b.com',
    RecipientAddress: 'PO Box 1',
    RecipientCity: 'Tyler',
    RecipientState: 'TX',
    RecipientPostalCode: '75701'
  });

  assert.equal(enrichment.address, '123 Main St');
  assert.equal(enrichment.estARV, 250000);
  assert.equal(enrichment.propertyDetails.beds, 3);
  assert.equal(enrichment.propertyDetails.heating, 'Central');
  assert.equal(enrichment.propertyDetails.airConditioning, undefined);
  assert.equal(enrichment.propertyDetails.basement, undefined);
  assert.equal(enrichment.financialDetails.wholesaleValue, 160000);
  assert.equal(enrichment.financialDetails.lastNoticeDate, '1/2/2026');
  assert.ok(enrichment.signalTags.includes('High equity'));
  assert.ok(enrichment.signalTags.includes('Cash buyer'));
  assert.equal(enrichment.signalTags.includes('Bored investor'), false);
  assert.deepEqual(enrichment.phones, ['2145551212']);
});

test('mergeEnrichmentIntoLead does not wipe existing phones/photos/score core', () => {
  const lead = {
    leadId: 'abc',
    address: '123 Main St',
    city: 'Tyler',
    state: 'TX',
    leadType: 'distressed',
    reviewStatus: 'approved',
    priorityScore: 77,
    phones: ['9999999999'],
    streetViewUrl: '/analyzer/api/sv-image?x=1',
    signalTags: ['Code violation'],
    estARV: null,
    propertyDetails: {},
    financialDetails: {}
  };
  const enrichment = rowToEnrichment({
    PropertyAddress: '123 Main St',
    PropertyCity: 'Tyler',
    PropertyState: 'TX',
    AVM: '$300,000',
    HighEquity: '1',
    Contact1Phone_1: '2145551212',
    Beds: '4'
  });
  const merged = mergeEnrichmentIntoLead(lead, enrichment);
  assert.equal(merged.priorityScore, 77);
  assert.equal(merged.streetViewUrl, '/analyzer/api/sv-image?x=1');
  assert.ok(merged.phones.includes('9999999999'));
  assert.ok(merged.phones.includes('2145551212'));
  assert.equal(merged.estARV, 300000);
  assert.equal(merged.propertyDetails.beds, 4);
  assert.ok(merged.signalTags.includes('Code violation'));
  assert.ok(merged.signalTags.includes('High equity'));
});

test('isTruthyFlag parses sheet flags', () => {
  assert.equal(isTruthyFlag('1'), true);
  assert.equal(isTruthyFlag('TRUE'), true);
  assert.equal(isTruthyFlag('0'), false);
});

test('canonicalizeRow maps spaced sheet headers to PropStream keys', () => {
  const { canonicalizeRow, rowToEnrichment } = require('../lib/leads-platform/csv-enrich');
  const row = canonicalizeRow({
    'First Name': 'Ann',
    'Last Name': 'Lee',
    'Street Address': '123 Main St',
    City: 'Tyler',
    State: 'TX',
    'Postal Code': '75701',
    Latitude: '32.3',
    Longitude: '-95.3',
    Beds: '3',
    'Air Condition': 'Central',
    'High Equity': '1',
    Vacancy: '0',
    Phone: '2145551212',
    Email: 'a@b.com',
    'Mailing Address': 'PO Box 1',
    'Mailing City': 'Tyler',
    'Mailign State': 'TX',
    'Mailing Postal Code': '75701',
    AVM: '$250,000'
  });
  const enrichment = rowToEnrichment(row);
  assert.equal(enrichment.address, '123 Main St');
  assert.equal(enrichment.city, 'Tyler');
  assert.equal(enrichment.lat, 32.3);
  assert.equal(enrichment.lng, -95.3);
  assert.equal(enrichment.propertyDetails.beds, 3);
  assert.equal(enrichment.propertyDetails.airConditioning, 'Central');
  assert.ok(enrichment.signalTags.includes('High equity'));
  assert.equal(enrichment.signalTags.includes('Vacant'), false);
  assert.deepEqual(enrichment.phones, ['2145551212']);
  assert.equal(enrichment.email, 'a@b.com');
  assert.ok(enrichment.mailingAddress.includes('PO Box 1'));
});
