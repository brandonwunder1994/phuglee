'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  buildBuilderPacket,
  buildBuilderPacketPdf,
  leadAcres,
  leadZoning
} = require('../lib/leads-platform/land/builder-packet');
const {
  extractParcelFields,
  mergeParcelIntoLead
} = require('../lib/leads-platform/land/parcel');
const {
  applyLandDispositionPatch,
  normalizeLandDisposition
} = require('../lib/leads-platform/land/disposition');

describe('builder packet', () => {
  it('formats acres from lotSqft and zoning, and builds PDF', async () => {
    const lead = {
      leadId: 'x1',
      address: '1 Lot Rd',
      city: 'Dallas',
      state: 'TX',
      propertyDetails: { lotSqft: 21780, zoning: 'R-1', water: 'City', sewer: 'City' },
      landScreen: {
        verdict: 'keep',
        demandBuilders: 'pass',
        checks: {
          infill: { status: 'pass' },
          utilities: { status: 'pass' },
          pavedAccess: { status: 'unknown' },
          cleared: { status: 'pass' },
          flat: { status: 'pass' },
          flood: { status: 'pass' },
          zoning: { status: 'pass', note: 'R-1 ok' }
        }
      },
      landUnderwriting: {
        landFmv: 45000,
        siteCosts: 5000,
        investorGap: 5000,
        assignmentFee: 5000,
        buyerCeiling: 35000,
        contractTarget: 30000,
        lao: 30000
      },
      fundMatches: [{ fundName: 'Gaia', score: 82, reasons: ['infill'] }]
    };
    assert.equal(leadAcres(lead), 0.5);
    assert.equal(leadZoning(lead), 'R-1');
    const packet = await buildBuilderPacket(lead, { note: 'Builder corridor' });
    assert.match(packet.text, /BUILDER PACKET/);
    assert.match(packet.text, /0\.5 ac/);
    assert.match(packet.text, /Zoning: R-1/);
    assert.match(packet.text, /Verdict: KEEP/);
    assert.match(packet.text, /LAO: \$30,000/);
    assert.match(packet.text, /Gaia/);
    assert.match(packet.text, /Builder corridor/);
    assert.match(packet.filename, /\.txt$/);
    assert.match(packet.pdfFilename, /\.pdf$/);
    assert.ok(Buffer.isBuffer(packet.pdfBuffer));
    assert.ok(packet.pdfBuffer.length > 500);
    assert.equal(packet.pdfBuffer.toString('utf8', 0, 4), '%PDF');
  });
});

describe('parcel + disposition helpers', () => {
  it('merges parcel fields without wiping omitted keys', () => {
    const lead = {
      propertyDetails: { acres: 0.3, zoning: 'R-1', water: 'City' }
    };
    const next = mergeParcelIntoLead(lead, { sewer: 'Septic', acres: 0.4 });
    assert.equal(next.propertyDetails.acres, 0.4);
    assert.equal(next.propertyDetails.zoning, 'R-1');
    assert.equal(next.propertyDetails.water, 'City');
    assert.equal(next.propertyDetails.sewer, 'Septic');
    const fields = extractParcelFields(next);
    assert.equal(fields.sewer, 'Septic');
  });

  it('tracks disposition status and pitches', () => {
    let d = normalizeLandDisposition({});
    assert.equal(d.status, 'new');
    d = applyLandDispositionPatch(d, { status: 'ready', note: 'Screened' }, 'matt');
    assert.equal(d.status, 'ready');
    d = applyLandDispositionPatch(d, {
      pitch: { fundName: 'Gaia', status: 'waiting', note: 'Sent packet' }
    }, 'matt');
    assert.equal(d.status, 'waiting');
    assert.equal(d.pitches.length, 1);
    assert.equal(d.pitches[0].fundName, 'Gaia');
  });
});

describe('land queue meta + acres index', () => {
  let tmpRoot;
  let store;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-polish-'));
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/leads-platform/store')];
    store = require('../lib/leads-platform/store');
    store.upsertLead({
      leadId: 'land-keep-1',
      address: '10 Keep Ln',
      city: 'Austin',
      state: 'TX',
      leadType: 'land',
      reviewStatus: 'approved',
      signalTags: ['Tax delinquent'],
      propertyDetails: { acres: 0.25, zoning: 'SF-3' },
      landScreen: { verdict: 'keep' },
      fundMatches: [{ fundId: 'gaia', fundName: 'Gaia' }],
      landDisposition: { status: 'ready' }
    });
    store.upsertLead({
      leadId: 'land-pending-1',
      address: '11 Pending Ln',
      city: 'Austin',
      state: 'TX',
      leadType: 'land',
      reviewStatus: 'approved',
      signalTags: ['Vacant lot'],
      propertyDetails: { lotSqft: 43560, zoning: 'AG' }
    });
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.LEADS_CATALOG_ROOT;
  });

  it('indexes acres/zoning and landQueue KPIs', () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    const list = store.queryLeads({ surface: 'land', limit: 20 });
    const keep = list.leads.find((l) => l.leadId === 'land-keep-1');
    const pending = list.leads.find((l) => l.leadId === 'land-pending-1');
    assert.equal(keep.acres, 0.25);
    assert.equal(keep.zoning, 'SF-3');
    assert.equal(keep.landDispoStatus, 'ready');
    assert.equal(pending.acres, 1);
    assert.equal(pending.zoning, 'AG');

    const meta = store.getMeta({ surface: 'land' });
    assert.ok(meta.landQueue);
    assert.equal(meta.landQueue.keep, 1);
    assert.equal(meta.landQueue.needsScreen, 1);
    assert.equal(meta.landQueue.fundShaped, 1);
    assert.ok(meta.withAcres >= 2);

    const readyOnly = store.queryLeads({ surface: 'land', landDispo: 'ready', limit: 20 });
    assert.equal(readyOnly.leads.length, 1);
    assert.equal(readyOnly.leads[0].leadId, 'land-keep-1');
  });
});

describe('builder-packet API', () => {
  let tmpRoot;
  let store;
  let api;
  const fixtureLand = require('./fixtures/leads/sample-land.json');

  function mockRes() {
    return {
      statusCode: null,
      body: '',
      headers: {},
      writeHead(status, headers) {
        this.statusCode = status;
        this.headers = headers || {};
      },
      end(chunk) {
        if (chunk) {
          if (Buffer.isBuffer(chunk)) this.body = chunk;
          else this.body += chunk;
        }
      }
    };
  }

  function maxReq(urlPath, accept) {
    return {
      method: 'GET',
      url: urlPath,
      headers: {
        host: '127.0.0.1:3000',
        'x-phuglee-user': 'alice',
        'x-phuglee-plan': 'max',
        accept: accept || 'application/json'
      },
      async *[Symbol.asyncIterator]() {}
    };
  }

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-packet-api-'));
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/leads-platform/store')];
    delete require.cache[require.resolve('../lib/leads-platform/api')];
    store = require('../lib/leads-platform/store');
    api = require('../lib/leads-platform/api');
    store.upsertLead({
      ...fixtureLand,
      propertyDetails: { acres: 0.4, zoning: 'R-SF' },
      landUnderwriting: { landFmv: 40000, lao: 28000, investorGap: 5000, assignmentFee: 5000, siteCosts: 2000 }
    });
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.LEADS_CATALOG_ROOT;
  });

  it('GET builder-packet returns text packet JSON by default', async () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    const id = fixtureLand.leadId;
    const res = mockRes();
    const url = new URL(`http://127.0.0.1/api/leads/${id}/builder-packet`);
    await api.handle(maxReq(url.pathname), res, url.pathname, url);
    assert.equal(res.statusCode, 200, String(res.body));
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.match(body.packet, /BUILDER PACKET/);
    assert.match(body.packet, /0\.4 ac/);
    assert.ok(body.filename.endsWith('.txt'));
    assert.ok(body.pdfFilename.endsWith('.pdf'));
  });

  it('GET builder-packet?format=pdf returns PDF bytes', async () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    const id = fixtureLand.leadId;
    const res = mockRes();
    const url = new URL(`http://127.0.0.1/api/leads/${id}/builder-packet?format=pdf`);
    await api.handle(maxReq(url.pathname + url.search, 'application/pdf'), res, url.pathname, url);
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['Content-Type'] || ''), /pdf/i);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8', 0, 4), '%PDF');
  });
});
