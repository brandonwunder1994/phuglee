const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAddressUpload, mapHeadersToFields } = require('../lib/geocodio-parse');

describe('geocodio-parse', () => {
  it('maps common header aliases', () => {
    const map = mapHeadersToFields([
      'Street Address',
      'City',
      'State',
      'Postal Code'
    ]);
    assert.equal(map.street, 'Street Address');
    assert.equal(map.zip, 'Postal Code');
  });

  it('parses CSV with address columns', () => {
    const csv = [
      'Street Address,City,State,Postal Code',
      '100 Main St,Austin,TX,78701',
      '200 Oak Ave,Dallas,TX,'
    ].join('\n');
    const parsed = parseAddressUpload(Buffer.from(csv, 'utf8'), 'leads.csv');
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].street, '100 Main St');
    assert.equal(parsed.rows[0].city, 'Austin');
    assert.equal(parsed.rows[1].zip, '');
  });

  it('throws when no street column', () => {
    const csv = 'Foo,Bar\n1,2\n';
    assert.throws(
      () => parseAddressUpload(Buffer.from(csv, 'utf8'), 'bad.csv'),
      (err) => err.code === 'NO_STREET_COLUMN'
    );
  });
});
