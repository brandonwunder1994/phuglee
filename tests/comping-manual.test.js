const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MANUAL = '../lib/leads-platform/comping/manual-comp';
const FILES = '../lib/leads-platform/comping/report-files';

describe('manual-comp', () => {
  it('requires arv and at least 3 comps', () => {
    const { buildManualCompReport } = require(MANUAL);
    assert.throws(() => buildManualCompReport({
      lead: { state: 'TX' }, arv: null, comps: [],
    }));
    assert.throws(() => buildManualCompReport({
      lead: { state: 'TX' }, arv: 200000, comps: [
        { address: 'a', price: 200000, soldDate: '2026-01-01', sqft: 1400, beds: 3, baths: 2 },
      ],
    }));
  });

  it('builds manual leadPatch', () => {
    const { buildManualCompReport } = require(MANUAL);
    const out = buildManualCompReport({
      lead: { leadId: 'L1', state: 'TX', address: '1 Main' },
      arv: 275000,
      comps: [
        { address: 'a', price: 270000, soldDate: '2026-01-01', sqft: 1400, beds: 3, baths: 2 },
        { address: 'b', price: 280000, soldDate: '2026-02-01', sqft: 1450, beds: 3, baths: 2 },
        { address: 'c', price: 275000, soldDate: '2026-03-01', sqft: 1420, beds: 3, baths: 2 },
      ],
      note: 'Propelio CMA',
    });
    assert.equal(out.leadPatch.estARV, 275000);
    assert.equal(out.leadPatch.compSource, 'manual_propelio');
    assert.equal(out.leadPatch.compConfidence, 'manual');
    assert.equal(out.leadPatch.comps.length, 3);
    assert.equal(out.report.source, 'manual_propelio');
    assert.equal(out.report.confidence, 'manual');
    assert.equal(out.report.manualNote, 'Propelio CMA');
    assert.ok(out.leadPatch.compedAt);
    assert.ok(out.leadPatch.compingReport);
  });

  it('scores comps with ruleResults when lat/lng present', () => {
    const { buildManualCompReport } = require(MANUAL);
    const out = buildManualCompReport({
      lead: {
        leadId: 'L2',
        state: 'TX',
        address: '100 Main',
        lat: 30.0,
        lng: -97.0,
        propertyDetails: { sqft: 1400, beds: 3, baths: 2 },
      },
      arv: 275000,
      comps: [
        { address: 'a', price: 270000, soldDate: '2026-01-01', sqft: 1400, beds: 3, baths: 2, lat: 30.01, lng: -97.01, distanceMi: 0.3 },
        { address: 'b', price: 280000, soldDate: '2026-02-01', sqft: 1450, beds: 3, baths: 2, lat: 30.02, lng: -97.02, distanceMi: 0.5 },
        { address: 'c', price: 275000, soldDate: '2026-03-01', sqft: 1420, beds: 3, baths: 2, lat: 30.03, lng: -97.03, distanceMi: 0.7 },
      ],
    });
    for (const comp of out.leadPatch.comps) {
      assert.ok(Array.isArray(comp.ruleResults));
      assert.ok(comp.ruleResults.length > 0);
      assert.ok(comp.includedInArv);
    }
  });
});

describe('report-files', () => {
  let tmpRoot;
  let prevRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-reports-'));
    prevRoot = process.env.LEADS_COMP_REPORTS_ROOT;
    process.env.LEADS_COMP_REPORTS_ROOT = tmpRoot;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve(FILES)];
  });

  afterEach(() => {
    if (prevRoot === undefined) delete process.env.LEADS_COMP_REPORTS_ROOT;
    else process.env.LEADS_COMP_REPORTS_ROOT = prevRoot;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve(FILES)];
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('rejects unsupported mime types', () => {
    const { saveCompReportFile } = require(FILES);
    assert.throws(
      () => saveCompReportFile('lead-1', {
        buffer: Buffer.from('x'),
        filename: 'evil.exe',
        mime: 'application/octet-stream',
      }),
      (err) => err.code === 'UNSUPPORTED_MIME',
    );
  });

  it('rejects files over 25MB', () => {
    const { saveCompReportFile } = require(FILES);
    const big = Buffer.alloc(25 * 1024 * 1024 + 1);
    assert.throws(
      () => saveCompReportFile('lead-1', {
        buffer: big,
        filename: 'big.pdf',
        mime: 'application/pdf',
      }),
      (err) => err.code === 'FILE_TOO_LARGE',
    );
  });

  it('saves and reads comp report files', () => {
    const { saveCompReportFile, readCompReportFile } = require(FILES);
    const buf = Buffer.from('%PDF-1.4 propelio');
    const meta = saveCompReportFile('lead-abc', {
      buffer: buf,
      filename: '../Propelio CMA Report.pdf',
      mime: 'application/pdf',
    });
    assert.match(meta.id, /^[a-f0-9]{16}$/);
    assert.equal(meta.mime, 'application/pdf');
    assert.equal(meta.size, buf.length);
    assert.equal(meta.filename, 'Propelio_CMA_Report.pdf');
    assert.ok(meta.uploadedAt);
    assert.match(meta.path, /^lead-abc\//);

    const read = readCompReportFile('lead-abc', meta.id);
    assert.equal(read.mime, 'application/pdf');
    assert.equal(read.filename, 'Propelio_CMA_Report.pdf');
    assert.ok(fs.existsSync(read.path));
    assert.equal(fs.readFileSync(read.path).toString(), buf.toString());
  });

  it('isolates files per lead folder', () => {
    const { saveCompReportFile } = require(FILES);
    const a = saveCompReportFile('lead-a', {
      buffer: Buffer.from('a'),
      filename: 'a.png',
      mime: 'image/png',
    });
    const b = saveCompReportFile('lead-b', {
      buffer: Buffer.from('b'),
      filename: 'b.png',
      mime: 'image/png',
    });
    assert.notEqual(a.path, b.path);
    assert.ok(fs.existsSync(path.join(tmpRoot, 'lead-a')));
    assert.ok(fs.existsSync(path.join(tmpRoot, 'lead-b')));
  });
});
