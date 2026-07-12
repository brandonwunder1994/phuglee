const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapGeocodioResultToCleanRow,
  extractCleanRowFromBatchItem,
  buildQueryForRow,
  isDailyLimitError,
  geocodeRowsWithKey,
  cleanRowsToCsv,
  CLEAN_HEADERS
} = require('../lib/geocodio-client');

describe('geocodio-client', () => {
  it('maps address_components to 4 columns', () => {
    const row = mapGeocodioResultToCleanRow(
      {
        number: '1109',
        predirectional: 'N',
        street: 'Highland',
        suffix: 'St',
        formatted_street: 'N Highland St',
        city: 'Arlington',
        state_province: 'VA',
        postal_code: '22201'
      },
      ['1109 N Highland St', '', 'Arlington, VA 22201']
    );
    assert.deepEqual(row, {
      'Street Address': '1109 N Highland St',
      City: 'Arlington',
      State: 'VA',
      'Zip Code': '22201'
    });
  });

  it('drops incomplete rows', () => {
    assert.equal(
      mapGeocodioResultToCleanRow({ city: 'X', state_province: 'TX' }, []),
      null
    );
  });

  it('extracts from batch item', () => {
    const item = {
      query: '1 Main St',
      response: {
        results: [
          {
            address_components: {
              number: '1',
              formatted_street: 'Main St',
              city: 'Austin',
              state_province: 'TX',
              postal_code: '78701'
            },
            address_lines: ['1 Main St']
          }
        ]
      }
    };
    const row = extractCleanRowFromBatchItem(item);
    assert.equal(row.City, 'Austin');
    assert.equal(row['Zip Code'], '78701');
  });

  it('buildQueryForRow uses structured fields', () => {
    const q = buildQueryForRow({
      street: '1 Main',
      city: 'Austin',
      state: 'TX',
      zip: '78701'
    });
    assert.equal(q.street, '1 Main');
    assert.equal(q.state_province, 'TX');
  });

  it('detects daily limit errors', () => {
    assert.equal(
      isDailyLimitError(403, '', { error: 'You have exceeded your daily limit' }),
      true
    );
    assert.equal(isDailyLimitError(500, 'oops', { error: 'server' }), false);
  });

  it('cleanRowsToCsv has required headers', () => {
    const csv = cleanRowsToCsv([
      {
        'Street Address': '1 Main St',
        City: 'Austin',
        State: 'TX',
        'Zip Code': '78701'
      }
    ]);
    assert.ok(csv.startsWith(CLEAN_HEADERS.join(',')));
    assert.ok(csv.includes('1 Main St'));
  });

  it('geocodeRowsWithKey uses mock fetch and counts lookups', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [
            {
              query: 'x',
              response: {
                results: [
                  {
                    address_components: {
                      number: '9',
                      formatted_street: 'Oak Ave',
                      city: 'Dallas',
                      state_province: 'TX',
                      postal_code: '75201'
                    },
                    address_lines: ['9 Oak Ave']
                  }
                ]
              }
            }
          ]
        })
    });

    const result = await geocodeRowsWithKey(
      [{ street: '9 Oak Ave', city: 'Dallas', state: 'TX' }],
      'fake-key',
      { maxLookups: 10, batchSize: 50, fetchImpl }
    );
    assert.equal(result.lookupsUsed, 1);
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0]['Zip Code'], '75201');
  });

  it('geocodeRowsWithKey marks exhausted on limit response', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'Exceeded daily limit of 2500 lookups' })
    });
    const result = await geocodeRowsWithKey(
      [{ street: '1 A St', city: 'X', state: 'TX' }],
      'fake-key',
      { maxLookups: 5, fetchImpl }
    );
    assert.equal(result.exhausted, true);
    assert.equal(result.lookupsUsed, 0);
  });
});
