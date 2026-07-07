const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DIAL_READY_COLUMNS,
  formatCacheDate,
  absoluteUrl,
  buildGoogleMapsStreetViewLink,
  propertyTypeLabel,
  exportLeadCategoryLabel,
  contactName,
  buildDialReadyRow,
  buildDialReadyRows
} = require('../lib/export-schema');

const BASE_DEPS = {
  leadTypeLabel: (id) => String(id || ''),
  resultLeadType: (r) => r?.leadType || 'code_violation',
  resultLeadTier: () => 'distressed',
  resultCategory: () => 'property',
  origin: 'http://localhost:3000'
};

describe('export-schema', () => {
  it('defines 13 dial-ready columns in order', () => {
    assert.equal(DIAL_READY_COLUMNS.length, 13);
    assert.equal(DIAL_READY_COLUMNS[0], 'Cache Date');
    assert.equal(DIAL_READY_COLUMNS[5], 'Street View Image URL');
    assert.equal(DIAL_READY_COLUMNS[6], 'Google Maps Street View Link');
    assert.equal(DIAL_READY_COLUMNS[12], 'Email');
  });

  it('formatCacheDate converts epoch ms to YYYY-MM-DD', () => {
    assert.equal(formatCacheDate(0), '');
    assert.equal(formatCacheDate(null), '');
    assert.equal(formatCacheDate(1719792000000), '2024-07-01');
  });

  it('absoluteUrl prefixes relative cached imagery paths', () => {
    assert.equal(
      absoluteUrl('/api/cached-imagery/streetview/abc.jpg', 'http://localhost:3000'),
      'http://localhost:3000/api/cached-imagery/streetview/abc.jpg'
    );
    assert.equal(absoluteUrl('https://example.com/x.jpg', 'http://localhost:3000'), 'https://example.com/x.jpg');
  });

  it('absoluteUrl with empty origin leaves relative path unchanged', () => {
    assert.equal(absoluteUrl('/api/cached-imagery/streetview/abc.jpg', ''), '/api/cached-imagery/streetview/abc.jpg');
  });

  it('buildGoogleMapsStreetViewLink prefers panoId then lat/lng then address search', () => {
    assert.match(
      buildGoogleMapsStreetViewLink({ viewMeta: { panoId: 'abc123' } }),
      /pano_id=abc123/
    );
    assert.match(
      buildGoogleMapsStreetViewLink({ viewMeta: { panoLat: 30.1, panoLng: -97.2 } }),
      /viewpoint=30\.1,-97\.2/
    );
    assert.match(
      buildGoogleMapsStreetViewLink({ street: '1 Main', city: 'Austin', state: 'TX', postal: '78701' }),
      /query=1%20Main/
    );
  });

  it('buildGoogleMapsStreetViewLink uses targetLat/targetLng when panoId absent', () => {
    assert.match(
      buildGoogleMapsStreetViewLink({ viewMeta: { targetLat: 32.77, targetLng: -96.79 } }),
      /viewpoint=32\.77,-96\.79/
    );
  });

  it('buildGoogleMapsStreetViewLink returns empty when record has no address fields', () => {
    assert.equal(buildGoogleMapsStreetViewLink({}), '');
    assert.equal(buildGoogleMapsStreetViewLink({ viewMeta: {} }), '');
  });

  it('propertyTypeLabel maps categories to dial-ready labels', () => {
    assert.equal(propertyTypeLabel('property'), 'Home');
    assert.equal(propertyTypeLabel('vacant_lot'), 'Land/Lot');
    assert.equal(propertyTypeLabel('blurred'), 'Blocked');
    assert.equal(propertyTypeLabel('unavailable'), 'Unavailable');
  });

  it('exportLeadCategoryLabel returns clean tier text without emoji', () => {
    assert.equal(exportLeadCategoryLabel('distressed'), 'Distressed');
    assert.equal(exportLeadCategoryLabel('well_maintained'), 'Well Maintained');
    assert.equal(exportLeadCategoryLabel('vacant'), 'Vacant');
  });

  it('contactName joins first and last name', () => {
    assert.equal(contactName({ firstName: 'Jane', lastName: 'Doe' }), 'Jane Doe');
    assert.equal(contactName({ firstName: 'Jane' }), 'Jane');
    assert.equal(contactName({}), '');
  });

  it('buildDialReadyRow maps full record with deps', () => {
    const record = {
      street: '100 Oak St',
      city: 'Dallas',
      state: 'TX',
      postal: '75201',
      firstName: 'Sam',
      lastName: 'Lee',
      phone: '555-0100',
      email: 'sam@example.com',
      leadType: 'probate',
      viewMeta: { panoId: 'pano99' },
      imagery: { streetView: { cachedAt: 1719792000000, status: 'ok' } }
    };
    const row = buildDialReadyRow(record, {
      resolveImageryForResult: (r) => r,
      getCachedImageryUrls: () => ({ streetView: '/api/cached-imagery/streetview/x.jpg' }),
      leadTypeLabel: () => 'Probate',
      resultLeadType: (r) => r.leadType,
      resultLeadTier: () => 'distressed',
      resultCategory: () => 'property',
      origin: 'http://localhost:3000'
    });
    assert.equal(row['Cache Date'], '2024-07-01');
    assert.equal(row['Street Address'], '100 Oak St');
    assert.equal(row['Zip Code'], '75201');
    assert.equal(row['Street View Image URL'], 'http://localhost:3000/api/cached-imagery/streetview/x.jpg');
    assert.match(row['Google Maps Street View Link'], /pano_id=pano99/);
    assert.equal(row['Lead Type'], 'Probate');
    assert.equal(row['Lead Category'], 'Distressed');
    assert.equal(row['Property Type'], 'Home');
    assert.equal(row['Contact Name'], 'Sam Lee');
    assert.equal(row.Phone, '555-0100');
    assert.equal(row.Email, 'sam@example.com');
    for (const col of DIAL_READY_COLUMNS) {
      assert.ok(col in row, `missing column ${col}`);
    }
  });

  it('Index hydration: resolveImageryForResult merges cachedAt and absolute URL', () => {
    const indexImagery = {
      streetView: {
        cachedAt: 1719792000000,
        status: 'ok',
        url: '/api/cached-imagery/streetview/hydrated.jpg'
      }
    };
    const record = { street: '200 Elm', city: 'Austin', state: 'TX', postal: '78702' };
    const row = buildDialReadyRow(record, {
      ...BASE_DEPS,
      resolveImageryForResult: (r) => {
        r.imagery = { ...indexImagery };
        return r;
      },
      getCachedImageryUrls: (r) => ({
        streetView: r.imagery?.streetView?.url || null
      })
    });
    assert.equal(row['Cache Date'], '2024-07-01');
    assert.equal(
      row['Street View Image URL'],
      'http://localhost:3000/api/cached-imagery/streetview/hydrated.jpg'
    );
  });

  it('Satellite cachedAt fallback when streetView not cached', () => {
    const record = {
      street: '300 Pine',
      city: 'Houston',
      state: 'TX',
      imagery: { satellite: { cachedAt: 1719792000000, status: 'ok' } }
    };
    const row = buildDialReadyRow(record, {
      ...BASE_DEPS,
      resolveImageryForResult: (r) => r,
      getCachedImageryUrls: () => ({ streetView: null })
    });
    assert.equal(row['Cache Date'], '2024-07-01');
    assert.equal(row['Street View Image URL'], '');
  });

  it('row count parity: buildDialReadyRows on array of 5 returns 5 rows with all columns', () => {
    const records = [
      { street: 'A St', city: 'X', state: 'TX', leadType: 'probate' },
      { street: 'B St', city: 'X', state: 'TX', leadType: 'code_violation' },
      { street: 'C St', city: 'X', state: 'TX', leadType: 'water_shut_off' },
      { street: 'D St', city: 'X', state: 'TX', leadType: 'tax_lien' },
      { street: 'E St', city: 'X', state: 'TX', leadType: 'pre_foreclosure' }
    ];
    const rows = buildDialReadyRows(records, {
      ...BASE_DEPS,
      resolveImageryForResult: (r) => r,
      getCachedImageryUrls: () => ({ streetView: null }),
      resultLeadTier: (r) => (r.street === 'C St' ? 'well_maintained' : 'distressed'),
      resultCategory: (r) => (r.street === 'D St' ? 'vacant_lot' : 'property')
    });
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row), [...DIAL_READY_COLUMNS]);
    }
  });

  it('no-score-sort: dial_ready preserves input record order', () => {
    const records = [
      { street: 'Alpha Rd', city: 'Austin', state: 'TX' },
      { street: 'Beta Rd', city: 'Austin', state: 'TX' },
      { street: 'Gamma Rd', city: 'Austin', state: 'TX' }
    ];
    const rows = buildDialReadyRows(records, {
      ...BASE_DEPS,
      resolveImageryForResult: (r) => r,
      getCachedImageryUrls: () => ({ streetView: null })
    });
    assert.deepEqual(
      rows.map((r) => r['Street Address']),
      ['Alpha Rd', 'Beta Rd', 'Gamma Rd']
    );
  });

  it('empty imagery: blank cache/URL but Maps link from address', () => {
    const record = { street: '404 Missing Imagery Ln', city: 'Dallas', state: 'TX', postal: '75201' };
    const row = buildDialReadyRow(record, {
      ...BASE_DEPS,
      resolveImageryForResult: (r) => r,
      getCachedImageryUrls: () => ({ streetView: null })
    });
    assert.equal(row['Cache Date'], '');
    assert.equal(row['Street View Image URL'], '');
    assert.match(row['Google Maps Street View Link'], /query=404%20Missing/);
  });
});