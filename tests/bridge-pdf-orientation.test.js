/**
 * Sideways-scan PDF OCR: orientation correction + code-compliance table rebuild.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  correctionDegreesFromOsd,
  scoreOcrText
} = require('../lib/bridge-engine/parsers/pdf-ocr');
const {
  extractCodeComplianceAoa,
  extractAddressSpans,
  normalizeAppType,
  parseNumDir,
  buildAddress
} = require('../lib/bridge-engine/parsers/pdf-code-compliance');

describe('PDF orientation correction', () => {
  it('maps OSD 270° (sideways) to clockwise 90° correction', () => {
    // Pharr TX code-compliance scan: OSD reported 270, rotate 90 CW uprighted the table
    assert.equal(correctionDegreesFromOsd(270), 90);
  });

  it('maps OSD 90 / 180 correctly and leaves upright alone', () => {
    assert.equal(correctionDegreesFromOsd(0), 0);
    assert.equal(correctionDegreesFromOsd(90), 270);
    assert.equal(correctionDegreesFromOsd(180), 180);
    assert.equal(correctionDegreesFromOsd(360), 0);
  });

  it('scores upright table text higher than sideways garbage', () => {
    const upright = `
Application Name Opened Date Street # Dir Street Name Type
Public Tree Care 6/1/2026 3409 N CHAMPAGNE DR
Weedy Lot 6/1/2026 917 E MARION ST
Care of Premise 6/2/2026 1110 E ELLER AVE
Illegal Dumping 6/5/2026 123 E BRADY AVE
`;
    const sidewaysGarbage = `
2 w wl lelwlel ole] [ef |sle | |2 2|z(w
5) 5) 0 eee] 5) dll Ee] |] ee ee] Teele
Eluluwlw < H H Elglee BH FE EEP ERE FBEER
`;
    assert.ok(
      scoreOcrText(upright) > scoreOcrText(sidewaysGarbage) + 50,
      `upright ${scoreOcrText(upright)} should beat garbage ${scoreOcrText(sidewaysGarbage)}`
    );
  });
});

describe('code-compliance OCR table rebuild', () => {
  it('parses num|dir tokens and builds addresses', () => {
    assert.deepEqual(parseNumDir('3409|N'), { num: '3409', dir: 'N' });
    assert.deepEqual(parseNumDir('917 E'), { num: '917', dir: 'E' });
    assert.equal(buildAddress('3409', 'N', 'CHAMPAGNE', 'DR'), '3409 N CHAMPAGNE DR');
  });

  it('normalizes OCR app-type typos', () => {
    assert.equal(normalizeAppType('Needy Lot'), 'Weedy Lot');
    assert.equal(normalizeAppType('llegal Dumping'), 'Illegal Dumping');
  });

  it('extracts address spans from sparse OCR text', () => {
    const text = `
Public Tree Care
6/1/2026
3409|N
CHAMPAGNE
DR
Weedy Lot
6/1/2026
917|E
MARION
ST
`;
    // Flatten so regex can see full address phrases
    const flat = text.replace(/\n/g, ' ');
    const spans = extractAddressSpans(flat);
    assert.ok(spans.length >= 2, `expected addresses, got ${spans.length}`);
    assert.ok(spans.some((s) => /CHAMPAGNE/i.test(s.address)));
    assert.ok(spans.some((s) => /MARION/i.test(s.address)));
  });

  it('rebuilds AOA with Property Address from Pharr-style OCR text', () => {
    // Mimic post-rotation sparse OCR of page 1
    const ocrText = `
Application Name
Opened Date
Street #
Dir
Street Name
Type
Public Tree Care
6/1/2026
3409|N
CHAMPAGNE
DR
Tires - Residential
6/1/2026
3409|N
CHAMPAGNE
DR
Care of Premise
6/1/2026
3409|N
CHAMPAGNE
DR
Weedy Lot
6/1/2026
703|E
RIDGE
RD
Weedy Lot
6/1/2026
917|E
MARION
ST
Weedy Lot
6/2/2026
1110|E
ELLER
AVE
Weedy Lot
6/2/2026
4102|N
BUENA VISTA
ST
Illegal Dumping
6/5/2026
123|E
BRADY
AVE
`;
    const result = extractCodeComplianceAoa(ocrText);
    assert.ok(result, 'must extract code-compliance table');
    assert.ok(result.rowCount >= 5, `expected >=5 rows, got ${result.rowCount}`);
    const headers = result.aoa[0];
    assert.ok(headers.includes('Property Address'));
    assert.ok(headers.includes('Application Name'));
    const body = result.aoa.slice(1);
    const addrs = body.map((r) => r[2]);
    assert.ok(
      addrs.some((a) => /3409\s+N\s+CHAMPAGNE/i.test(a)),
      `missing CHAMPAGNE in ${addrs.slice(0, 5)}`
    );
    assert.ok(addrs.some((a) => /MARION/i.test(a)));
    const apps = body.map((r) => r[0]);
    assert.ok(apps.some((a) => /Weedy Lot/i.test(a)));
  });
});
