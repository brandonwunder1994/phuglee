const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyPageText,
  resolveHorizontalPageBands,
  zipMatrices,
  bandToMatrix,
  groupTablesByHeaderFingerprint,
  mergeTableGroups,
  headerFingerprint
} = require('../lib/bridge-engine/parsers/pdf-horizontal-bands');
const {
  collectTablesFromResult,
  parseTextBlob
} = require('../lib/bridge-engine/parsers/pdf');

/** Synthetic Whitehall-style wide-sheet pages (left + parcel continuation). */
function whitehallStylePages() {
  const left1 = [
    'ADDRESS  DESC  FILE DT NOTIF DT',
    '4128 BEECHBANK RD  PM 305.3 INTERIOR SURFACES UM  7/6/2026 7/6/2026',
    '0 BEECHWOOD AV  GRASS/WEEDS/LIT REPORT  7/6/2026 7/6/2026',
    '652 BEECHWOOD AV  GRASS/WEEDS/LIT REPORT  7/6/2026 7/6/2026'
  ].join('\n');
  const left2 = [
    '193 COLLINGWOOD AV  GRASS/WEEDS/LIT REPORT  6/24/2026 6/24/2026',
    '381 YEARLING RD S  517.41 LITTERING MM  6/10/2026 6/10/2026'
  ].join('\n');
  const parcelHdr = [
    'EXT DT DEADLINE CITATION COURT DT CLOSED PARCEL ID SUB DIVISION FILE #',
    '7/15/2026 090-002136 202304311',
    '7/8/2026 090-000563 202304312',
    '7/8/2026 090-007482 202304313'
  ].join('\n');
  const parcelMore = [
    '6/17/2026 090-007482 202304216',
    '7/8/2026 090-000476 202304314'
  ].join('\n');
  return [left1, left2, parcelHdr, parcelMore];
}

test('classifyPageText: primary vs parcel continuation', () => {
  const pages = whitehallStylePages();
  assert.equal(classifyPageText(pages[0]).kind, 'primary');
  assert.equal(classifyPageText(pages[1]).kind, 'primary');
  assert.equal(classifyPageText(pages[2]).kind, 'continuation');
  assert.equal(classifyPageText(pages[3]).kind, 'continuation');
});

test('resolveHorizontalPageBands drops parcel rows from primary stack', () => {
  const pages = whitehallStylePages();
  const resolved = resolveHorizontalPageBands(pages);
  assert.ok(resolved && resolved.applied);
  assert.ok(resolved.aoa);
  const headers = resolved.aoa[0];
  const data = resolved.aoa.slice(1);
  // 3 + 2 primary rows
  assert.equal(data.length, 5);
  // No parcel id in the DESC-ish column of primary cells
  for (const row of data) {
    const joined = row.join(' ');
    assert.ok(!/090-\d{6}/.test(joined) || headers.some((h) => /parcel/i.test(h)),
      `parcel should only appear under parcel column: ${joined}`);
  }
  // Streets preserved
  assert.ok(data.some((r) => /BEECHBANK/i.test(r.join(' '))));
  assert.ok(data.some((r) => /YEARLING/i.test(r.join(' '))));
});

test('resolveHorizontalPageBands zip-joins parcel when counts match', () => {
  // Equal counts for clean zip
  const primary = [
    'ADDRESS  DESC  FILE DT',
    '1 MAIN ST  WEEDS  7/1/2026',
    '2 OAK AV  TRASH  7/2/2026'
  ].join('\n');
  const cont = [
    'PARCEL ID  FILE #',
    '090-000001  111',
    '090-000002  222'
  ].join('\n');
  const resolved = resolveHorizontalPageBands([primary, cont]);
  assert.ok(resolved && resolved.aoa);
  const headers = resolved.aoa[0].map((h) => String(h).toLowerCase());
  assert.ok(headers.some((h) => /parcel/i.test(h)), `headers=${headers.join(',')}`);
  const row0 = resolved.aoa[1];
  assert.ok(row0.some((c) => /090-000001/.test(c)));
  assert.ok(row0.some((c) => /MAIN ST/i.test(c)));
  // Violation stays weeds, not parcel
  assert.ok(row0.some((c) => /WEEDS/i.test(c)));
});

test('zipMatrices appends columns without overwriting primary', () => {
  const primary = [
    ['Address', 'Desc'],
    ['1 A St', 'weeds'],
    ['2 B St', 'trash']
  ];
  const cont = [
    ['Parcel ID'],
    ['090-1'],
    ['090-2']
  ];
  const out = zipMatrices(primary, [cont]);
  assert.equal(out[0].length, 3);
  assert.equal(out[1][0], '1 A St');
  assert.equal(out[1][1], 'weeds');
  assert.equal(out[1][2], '090-1');
});

test('collectTablesFromResult does not stack different headers as rows', () => {
  const result = {
    total: 2,
    mergedTables: [],
    pages: [
      {
        num: 1,
        tables: [
          [
            ['Address', 'Desc'],
            ['1 Main St', 'weeds'],
            ['2 Oak Ave', 'trash']
          ]
        ]
      },
      {
        num: 2,
        tables: [
          [
            ['Parcel ID', 'File #'],
            ['090-000001', '111'],
            ['090-000002', '222']
          ]
        ]
      }
    ]
  };
  const aoa = collectTablesFromResult(result);
  assert.ok(aoa);
  // Primary address rows only as identity (or zip — not 4 stacked rows under Address/Desc)
  const data = aoa.slice(1);
  const fakeViolationParcels = data.filter(
    (row) => /090-/.test(String(row[1] || '')) && !/parcel/i.test(String(aoa[0][1] || ''))
  );
  assert.equal(
    fakeViolationParcels.length,
    0,
    `parcel values must not sit in Desc column: ${JSON.stringify(data)}`
  );
  assert.ok(data.some((r) => /Main St/i.test(r.join(' '))));
  // If zip worked, parcel is an extra column
  if (aoa[0].length > 2) {
    assert.ok(aoa[0].some((h) => /parcel/i.test(h)));
  }
});

test('groupTablesByHeaderFingerprint separates schemas', () => {
  const groups = groupTablesByHeaderFingerprint([
    [
      ['Address', 'Type'],
      ['1 A', 'weeds']
    ],
    [
      ['Address', 'Type'],
      ['2 B', 'trash']
    ],
    [
      ['Parcel ID', 'File'],
      ['090-1', 'x']
    ]
  ]);
  assert.equal(groups.length, 2);
  const merged = mergeTableGroups(groups);
  assert.ok(merged);
  assert.ok(merged.slice(1).some((r) => /1 A/.test(r.join(' '))));
});

test('parseTextBlob with pages uses horizontal band path', () => {
  const pages = whitehallStylePages();
  const fullText = pages.join('\n');
  const parsed = parseTextBlob(fullText, {
    pageCount: pages.length,
    filename: 'whitehall-style.xlsx',
    pages
  });
  assert.ok(parsed, 'expected parse result');
  assert.ok(parsed.rows.length >= 5);
  assert.ok(parsed.rows.length <= 6, `should not stack parcel pages as rows, got ${parsed.rows.length}`);

  const typeKeys = (parsed.headers || []).filter((h) =>
    /desc|type|viol|issue/i.test(h)
  );
  const typeKey = typeKeys[0] || parsed.headers[1];
  for (const row of parsed.rows) {
    const typeVal = String(row[typeKey] || '');
    assert.ok(
      !/^090-\d{6}$/.test(typeVal.trim()),
      `type column must not be parcel id: ${typeVal}`
    );
  }
  // At least one real violation description
  assert.ok(
    parsed.rows.some((r) =>
      Object.values(r).some((v) => /GRASS|WEEDS|LITTER|INTERIOR|SURFACES/i.test(String(v)))
    )
  );
});

test('headerFingerprint normalizes whitespace', () => {
  assert.equal(
    headerFingerprint(['Parcel ID', 'File #']),
    headerFingerprint(['parcel  id', 'file #'])
  );
});

test('bandToMatrix parses single-spaced parcel lines', () => {
  const matrix = bandToMatrix(
    [
      'PARCEL ID FILE #',
      '7/15/2026 090-002136 202304311',
      '7/8/2026 090-000563 202304312'
    ].join('\n')
  );
  assert.ok(matrix);
  assert.ok(matrix.length >= 3);
  assert.ok(matrix.slice(1).every((r) => r.some((c) => /090-/.test(c))));
});
