/**
 * Filter (Data Bridge) stress suite — messy real-world inputs, tagging matrix,
 * dedup/import edge cases, and format variants.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const indexModule = require('../lib/analyzer-import-index');
const { normalizeAddressKey } = require('../lib/analyzer-import-index');
const { tagRow, STRONG_DISTRESSED_TAG } = require('../lib/bridge-distress-tagger');
const { similarityScore, isNearDuplicate } = require('../lib/bridge-dedup');
const { filterAlreadyImported } = require('../lib/bridge-engine/import-filter');

const CITY = { id: 'arizona-marana', city: 'Marana', state: 'Arizona' };
const ZIP = '85704';
const ENGINE_PATH = require.resolve('../lib/bridge-engine');

const emptyImportIndex = async () => ({
  loadedAt: Date.now(),
  addresses: new Set(),
  count: 0,
  sources: null
});

let originalLoadIndex = indexModule.loadImportAddressIndex;

after(() => {
  indexModule.loadImportAddressIndex = originalLoadIndex;
  delete require.cache[ENGINE_PATH];
});

function freshProcessUpload() {
  indexModule.loadImportAddressIndex = emptyImportIndex;
  delete require.cache[ENGINE_PATH];
  return require('../lib/bridge-engine').processUpload;
}

async function runCsv(csv, uploadType = 'code_violation', filename = 'stress.csv') {
  const processUpload = freshProcessUpload();
  return processUpload({
    buffer: Buffer.from(csv),
    filename,
    city: CITY,
    uploadType
  });
}

function row(overrides = {}) {
  return {
    streetAddress: '123 Main St',
    violationIssueType: '',
    descriptionNotes: '',
    city: CITY.city,
    state: CITY.state,
    zip: ZIP,
    ...overrides
  };
}

function keptAddresses(result) {
  return result.rows.map((r) => r.streetAddress);
}

describe('Filter stress — distressed signal tagging matrix', () => {
  const strongCases = [
    ['overgrown weeds exceeding 18 inches', /vegetation|grass|weed/i],
    ['rank vegetation in front yard', /vegetation|grass|weed/i],
    ['accumulation of trash and debris', /trash/i],
    ['illegal dumping of furniture in yard', /trash/i],
    ['abandoned inoperable vehicle on property', /vehicle/i],
    ['unregistered vehicle parked on lawn', /vehicle/i],
    ['dilapidated structure with broken windows', /structure/i],
    ['blighted building open to the elements', /structure/i],
    ['fence in deteriorated condition leaning unsafe', /nuisance|maintenance/i],
    ['roof in deteriorated condition missing shingles', /nuisance|maintenance/i],
    ['unsanitary conditions rodent infestation', /nuisance|maintenance/i],
    ['public nuisance exterior maintenance failure', /nuisance|maintenance/i],
    ['peeling paint on exterior walls', /structure/i],
    ['vacant and open structure unsecured', /structure/i],
    ['high grass over 12 inches unmaintained lawn', /vegetation|grass|weed/i],
    ['junk vehicle derelict truck in driveway', /vehicle/i],
    ['open storage of building materials outside', /trash/i]
  ];

  for (const [text, indicatorPattern] of strongCases) {
    test(`strong tag: ${text.slice(0, 48)}`, () => {
      const tagged = tagRow(row({ descriptionNotes: text }), 'code_violation');
      assert.equal(tagged.distressedSignalTag, STRONG_DISTRESSED_TAG);
      assert.ok(tagged.matchedIndicators.some((m) => indicatorPattern.test(m)), text);
    });
  }

  const standardCases = [
    'Fence permit expired',
    'Sign violation — banner too large',
    'Business license delinquent',
    'Pool permit missing',
    'Zoning variance request',
    'Noise complaint — barking dog',
    'Parking on street overnight',
    'HOA administrative notice',
    'Building permit application incomplete',
    'Fire inspection certificate expired'
  ];

  for (const issue of standardCases) {
    test(`standard tag: ${issue.slice(0, 48)}`, () => {
      const tagged = tagRow(row({ violationIssueType: issue }), 'code_violation');
      assert.equal(tagged.distressedSignalTag, 'Standard Code Violation');
      assert.deepEqual(tagged.matchedIndicators, []);
    });
  }

  test('water shut off ignores violation text for tag override', () => {
    const tagged = tagRow(row({ descriptionNotes: 'Overgrown weeds' }), 'water_shut_off');
    assert.match(tagged.distressedSignalTag, /Water Shut Off/i);
  });
});

describe('Filter stress — address parsing and discard rules', () => {
  test('keeps unit and hash address variants', async () => {
    const csv = [
      'Property Address,Violation Type',
      '123 Main St Apt 4B,Trash accumulation',
      '456 Oak Ave #12,Overgrown weeds',
      '789 Pine Dr Unit 3,Abandoned vehicle'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 3);
  });

  test('keeps lot and parcel style addresses', async () => {
    const csv = [
      'Site Address,Issue Type',
      'Lot 14 Block C,Trash',
      'Parcel 2201-033,Junk vehicle'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 2);
  });

  test('discards intersection-only and TBD addresses', async () => {
    const csv = [
      'Property Address,Violation Type',
      'Main St & Oak Ave,Sign violation',
      'TBD,Trash',
      'Unknown,Weeds',
      'N/A,Debris'
    ].join('\n');
    await assert.rejects(
      () => runCsv(csv),
      (err) => err.code === 'NO_USABLE_ROWS'
    );
  });

  test('discards municipal non-property locations', async () => {
    const csv = [
      'Property Address,Violation Type',
      'City Hall,Sign violation',
      'Municipal Building parking lot,Trash',
      'County office suite 200,Maintenance'
    ].join('\n');
    await assert.rejects(
      () => runCsv(csv),
      (err) => err.code === 'NO_USABLE_ROWS'
    );
  });

  test('keeps directional and abbreviated street variants', async () => {
    const csv = [
      'Property Address,Violation Type',
      '100 N Main St,Weeds',
      '200 S Oak Ave,Trash',
      '300 E Pine Blvd,Abandoned vehicle',
      '400 W Cedar Ln,Debris'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 4);
  });

  test('maps alternate header aliases (civic address, site address, notice date)', async () => {
    const csv = [
      'Civic Address,Offense,Narrative,Notice Date,Postal',
      '55 Birch Ln,Accumulation of trash,Junk in yard,2026-05-01,85704'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 1);
    assert.equal(result.rows[0].streetAddress, '55 Birch Ln');
    assert.equal(result.rows[0].violationDate, '2026-05-01');
    assert.equal(result.rows[0].zip, '85704');
    assert.match(result.rows[0].distressedSignalTag, /Strong/i);
  });
});

describe('Filter stress — file format variants', () => {
  test('parses UTF-8 BOM CSV', async () => {
    const csv = '\uFEFFProperty Address,Violation Type\n88 Mesa Dr,Overgrown weeds\n';
    const result = await runCsv(csv, 'code_violation', 'bom.csv');
    assert.equal(result.stats.kept, 1);
  });

  test('parses CRLF line endings', async () => {
    const csv = 'Property Address,Violation Type\r\n77 River Rd,Trash accumulation\r\n';
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 1);
  });

  test('parses quoted CSV fields with embedded commas', async () => {
    const csv = [
      'Property Address,Violation Type,Description',
      '"123 Main St, Unit 2","Trash, junk","Sofa, mattress in yard"'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 1);
    assert.match(result.rows[0].streetAddress, /123 Main St/);
    assert.match(result.rows[0].distressedSignalTag, /Strong/i);
  });

  test('parses semicolon-delimited TXT', async () => {
    const txt = 'Property Address;Violation Type;Date\n999 Canyon Rd;High grass;2026-06-15\n';
    const result = await runCsv(txt, 'code_violation', 'semi.txt');
    assert.equal(result.stats.kept, 1);
    assert.equal(result.processingMeta.delimiter, ';');
  });

  test('parses xlsx with alternate column names', async () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Parcel Address': '12 Desert View',
        'Charge': 'Abandoned vehicle',
        'Comments': 'Inoperable truck',
        'Date Issued': '2026-07-01'
      },
      {
        'Parcel Address': '14 Desert View',
        'Charge': 'Sign permit',
        'Comments': 'Administrative',
        'Date Issued': '2026-07-02'
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Code Enforcement');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const processUpload = freshProcessUpload();
    const result = await processUpload({
      buffer,
      filename: 'city-export.xlsx',
      city: CITY,
      uploadType: 'code_violation'
    });
    // Sign permit is not distress — only abandoned vehicle row is kept
    assert.equal(result.stats.kept, 1);
    assert.equal(result.stats.noDistress, 1);
    const strong = result.rows.find((r) => r.streetAddress === '12 Desert View');
    assert.match(strong.distressedSignalTag, /Strong/i);
    assert.equal(result.rows.some((r) => r.streetAddress === '14 Desert View'), false);
  });

  test('water shutoff list with mixed disconnect wording', async () => {
    const txt = [
      'Service Address\tDisconnect Reason\tDate',
      '410 Cedar Ln\tNon-payment shutoff\t2026-05-12',
      '88 W River Rd\tWater service terminated\t2026-05-18',
      '12 Oak St\tDelinquent account\t2026-05-20'
    ].join('\n');
    const result = await runCsv(txt, 'water_shut_off', 'shutoffs.txt');
    assert.equal(result.stats.kept, 3);
    assert.ok(result.rows.every((r) => /Water Shut Off/i.test(r.distressedSignalTag)));
  });
});

describe('Filter stress — deduplication and analyze cross-reference', () => {
  test('keeps same address with different violation types', async () => {
    const csv = [
      'Property Address,Violation Type',
      '123 Main St,Overgrown weeds',
      '123 Main St,Accumulation of trash'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 2);
    assert.equal(result.stats.deduplicated, 0);
  });

  test('dedupes abbreviation and punctuation variants', async () => {
    const csv = [
      'Property Address,Violation Type',
      '123 N. Main Street,Overgrown weeds',
      '123 North Main St.,Overgrown weeds',
      '456 Oak Avenue,Trash',
      '456 Oak Ave,Trash'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 2);
    assert.equal(result.stats.deduplicated, 2);
  });

  test('similarity boundary: adjacent house numbers stay separate', () => {
    assert.ok(!isNearDuplicate(
      row({ streetAddress: '123 Main St', violationIssueType: 'Weeds' }),
      row({ streetAddress: '124 Main St', violationIssueType: 'Weeds' })
    ));
  });

  test('filters analyze matches but keeps new addresses in same file', async () => {
    indexModule.loadImportAddressIndex = async () => ({
      loadedAt: Date.now(),
      addresses: new Set([
        normalizeAddressKey('100 Elm St, Marana, Arizona, 85704'),
        normalizeAddressKey('200 Oak Ave, Marana, Arizona, 85705')
      ]),
      count: 2,
      sources: { records: 1, results: 1 }
    });
    delete require.cache[ENGINE_PATH];
    const processFresh = require('../lib/bridge-engine').processUpload;

    const csv = [
      'Property Address,Violation Type,ZIP',
      '100 Elm St,Weeds,85704',
      '200 Oak Ave,Trash,85705',
      '300 Pine Rd,Abandoned vehicle,85706'
    ].join('\n');

    try {
      const result = await processFresh({
        buffer: Buffer.from(csv),
        filename: 'mixed.csv',
        city: CITY,
        uploadType: 'code_violation'
      });
      assert.equal(result.stats.alreadyImported, 2);
      assert.equal(result.stats.kept, 1);
      assert.deepEqual(keptAddresses(result), ['300 Pine Rd']);
    } finally {
      indexModule.loadImportAddressIndex = emptyImportIndex;
      delete require.cache[ENGINE_PATH];
    }
  });

  test('import filter catches St vs Street against analyze index', () => {
    const imported = new Set([normalizeAddressKey('500 Maple Street, Marana, Arizona, 85704')]);
    const filtered = filterAlreadyImported(
      [row({ streetAddress: '500 Maple St', zip: ZIP })],
      imported
    );
    assert.equal(filtered.removedCount, 1);
    assert.equal(filtered.rows.length, 0);
  });
});

describe('Filter stress — messy municipal export scenarios', () => {
  test('handles sparse rows and blank lines in export', async () => {
    const csv = [
      'Property Address,Violation Type,Status',
      '111 First St,Weeds,Open',
      ',,',
      '222 Second Ave,Trash,Closed',
      '   ,  ,  ',
      '333 Third Dr,Sign violation,Open'
    ].join('\n');
    const result = await runCsv(csv);
    // Sign violation dropped as non-distress; blank rows discarded
    assert.equal(result.stats.kept, 2);
    assert.ok(result.stats.noDistress >= 1);
  });

  test('closed status rows are retained for code violations', async () => {
    const csv = [
      'Property Address,Violation Type,Status',
      '444 Closed St,Overgrown weeds,Closed',
      '555 Open St,Trash,Open'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 2);
  });

  test('description-only distress when issue type is vague', async () => {
    const csv = [
      'Property Address,Violation Type,Description',
      '666 Vague Ln,CV-1042,Junk vehicle inoperable on property'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 1);
    assert.match(result.rows[0].distressedSignalTag, /Strong/i);
  });

  test('mixed strong and standard keeps only distress leads', async () => {
    const csv = [
      'Property Address,Violation Type',
      '10 Alpha Rd,Overgrown weeds',
      '20 Beta Ln,Fence permit expired',
      '30 Gamma Ct,Abandoned vehicle',
      '40 Delta Dr,Pool permit',
      '50 Epsilon Way,Accumulation of trash'
    ].join('\n');
    const result = await runCsv(csv);
    assert.equal(result.stats.kept, 3);
    assert.equal(result.stats.noDistress, 2);
    const strong = result.rows.filter((r) => r.distressedSignalTag === STRONG_DISTRESSED_TAG);
    const standard = result.rows.filter((r) => r.distressedSignalTag === 'Standard Code Violation');
    assert.equal(strong.length, 3);
    assert.equal(standard.length, 0);
    assert.ok(result.stats.tagBreakdown[STRONG_DISTRESSED_TAG] >= 3);
  });

  test('all rows already analyzed yields specific error message', async () => {
    indexModule.loadImportAddressIndex = async () => ({
      loadedAt: Date.now(),
      addresses: new Set([normalizeAddressKey('777 Solo Rd, Marana, Arizona')]),
      count: 1,
      sources: { records: 0, results: 1 }
    });
    delete require.cache[ENGINE_PATH];
    const { processUpload: processFresh } = require('../lib/bridge-engine');

    const csv = 'Property Address,Violation Type\n777 Solo Rd,Weeds\n';
    try {
      await assert.rejects(
        () => processFresh({
          buffer: Buffer.from(csv),
          filename: 'solo.csv',
          city: CITY,
          uploadType: 'code_violation'
        }),
        (err) => {
          assert.equal(err.code, 'NO_USABLE_ROWS');
          assert.match(err.message, /already in your Analyze session/i);
          return true;
        }
      );
    } finally {
      indexModule.loadImportAddressIndex = emptyImportIndex;
      delete require.cache[ENGINE_PATH];
    }
  });
});

describe('Filter stress — export row integrity', () => {
  test('every kept row has required normalized fields populated', async () => {
    const csv = [
      'Property Address,Violation Type,ZIP',
      '808 Integrity Blvd,Trash,85704'
    ].join('\n');
    const result = await runCsv(csv);
    const r = result.rows[0];
    assert.ok(r.streetAddress);
    assert.equal(r.city, CITY.city);
    assert.equal(r.state, CITY.state);
    assert.ok(r.distressedSignalTag);
    assert.ok(r.confidenceLevel);
    assert.ok(r.sourceFile);
    assert.ok(r.processedAt);
    assert.equal(r.uploadType, 'code_violation');
  });
});