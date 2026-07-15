'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildImportProfile,
  profileForImportRecord,
  headerKey
} = require('../lib/import-profile');

describe('import-profile mapping', () => {
  it('maps common skip-trace / BatchLead headers into dossier field slots', () => {
    const row = {
      'Property Address': '100 Oak Ave',
      City: 'Waco',
      State: 'TX',
      Zip: '76701',
      Beds: '3',
      Bathrooms: '2',
      'Living Area': '1450',
      'Lot Size': '7200',
      'Year Built': '1978',
      Stories: '1',
      'Property Type': 'Single Family',
      County: 'McLennan',
      AVM: '185000',
      'Market Value': '190000',
      'Wholesale Value': '140000',
      'Assessed Value': '160000',
      'Tax Amount': '3200',
      LTV: '62',
      'Mortgage Balance': '95000',
      'Mortgage Payment': '980',
      'Interest Rate': '4.25',
      Lender: 'Wells Fargo',
      'Loan Type': 'Conventional',
      'Mailing Address': 'PO Box 12',
      'Mail City': 'Dallas',
      'Mail State': 'TX',
      'Mail Zip': '75201',
      'Owner Name': 'Jane Owner',
      Heating: 'Central',
      'Heating Fuel': 'Gas',
      'Air Conditioning': 'Central',
      Fireplace: '1',
      Roof: 'Composition',
      'Roof Shape': 'Gable',
      'Interior Walls': 'Drywall',
      Basement: 'None',
      Water: 'Public',
      Sewer: 'Public',
      Garage: '2 Car',
      Patio: 'Yes',
      Pool: 'No',
      Porch: 'Covered',
      HOA: 'Yes',
      'HOA Name': 'Oak HOA',
      'HOA Fee': '45',
      'HOA Frequency': 'Monthly',
      'Last Sale Date': '2019-04-01',
      'Sale Price': '150000',
      'Price Per Sqft': '103',
      'Auction Date': '2026-08-01',
      'Last Notice Date': '2026-06-15',
      'Code Category': 'Nuisance',
      'Violation Description': 'Tall weeds',
      'Violation Date': '2026-05-01',
      'Absentee Owner': 'Yes',
      Vacant: '1',
      'Pre Foreclosure': 'true',
      'High Equity': 'yes'
    };

    const profile = buildImportProfile(row);
    assert.ok(profile);
    assert.equal(profile.beds, '3');
    assert.equal(profile.baths, '2');
    assert.equal(profile.squareFootage, '1450');
    assert.equal(profile.lotSizeSqFt, '7200');
    assert.equal(profile.yearBuilt, '1978');
    assert.equal(profile.stories, '1');
    assert.equal(profile.propertyType, 'Single Family');
    assert.equal(profile.county, 'McLennan');
    assert.equal(profile.avm, '185000');
    assert.equal(profile.marketValue, '190000');
    assert.equal(profile.wholesaleValue, '140000');
    assert.equal(profile.taxAssessedValue, '160000');
    assert.equal(profile.taxAmount, '3200');
    assert.equal(profile.ltv, '62');
    assert.equal(profile.estimatedMortgageBalance, '95000');
    assert.equal(profile.estimatedMortgagePayment, '980');
    assert.equal(profile.mortgageInterestRate, '4.25');
    assert.equal(profile.lenderName, 'Wells Fargo');
    assert.equal(profile.loanType, 'Conventional');
    assert.equal(profile.mailingStreet, 'PO Box 12');
    assert.equal(profile.mailingCity, 'Dallas');
    assert.equal(profile.mailingState, 'TX');
    assert.equal(profile.mailingPostal, '75201');
    assert.equal(profile.contactName, 'Jane Owner');
    assert.equal(profile.heating, 'Central');
    assert.equal(profile.heatingFuel, 'Gas');
    assert.equal(profile.airConditioning, 'Central');
    assert.equal(profile.fireplace, '1');
    assert.equal(profile.roof, 'Composition');
    assert.equal(profile.roofShape, 'Gable');
    assert.equal(profile.interiorWalls, 'Drywall');
    assert.equal(profile.basement, 'None');
    assert.equal(profile.water, 'Public');
    assert.equal(profile.sewer, 'Public');
    assert.equal(profile.garage, '2 Car');
    assert.equal(profile.patio, 'Yes');
    assert.equal(profile.pool, 'No');
    assert.equal(profile.porch, 'Covered');
    assert.equal(profile.hoa, 'Yes');
    assert.equal(profile.hoaName, 'Oak HOA');
    assert.equal(profile.hoaFee, '45');
    assert.equal(profile.hoaFeeFrequency, 'Monthly');
    assert.equal(profile.lastSalesDate, '2019-04-01');
    assert.equal(profile.lastSalesPrice, '150000');
    assert.equal(profile.pricePerSqFt, '103');
    assert.equal(profile.auctionDate, '2026-08-01');
    assert.equal(profile.lastNoticeDate, '2026-06-15');
    assert.equal(profile.codeCategory, 'Nuisance');
    assert.equal(profile.violationDescription, 'Tall weeds');
    assert.equal(profile.violationDate, '2026-05-01');
    assert.equal(profile.flags.absenteeOwner, 1);
    assert.equal(profile.flags.vacancy, 1);
    assert.equal(profile.flags.preForeclosure, 1);
    assert.equal(profile.flags.highEquity, 1);
  });

  it('keeps full profile on import (no lean strip of lot/amenities/values)', () => {
    const profile = buildImportProfile({
      Beds: '4',
      'Lot Size Sq Ft': '9000',
      Heating: 'Forced air',
      'Est Mortgage Balance': '120000',
      Patio: 'Covered'
    });
    const stored = profileForImportRecord(profile);
    assert.equal(stored.beds, '4');
    assert.equal(stored.lotSizeSqFt, '9000');
    assert.equal(stored.heating, 'Forced air');
    assert.equal(stored.estimatedMortgageBalance, '120000');
    assert.equal(stored.patio, 'Covered');
    assert.equal(stored._shaped, true);
  });

  it('normalizes header keys the same way as the UI importer', () => {
    assert.equal(headerKey('Property Address'), 'propertyaddress');
    assert.equal(headerKey('property_address'), 'propertyaddress');
    assert.equal(headerKey('Price / Sqft'), 'pricesqft');
  });
});
