'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

let tmpRoot;
let schema;
let store;
let contracts;
let sync;
let api;

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    }
  };
}

function adminReq(url, method = 'GET', body = null) {
  return {
    method,
    url,
    headers: {
      host: '127.0.0.1:3000',
      cookie: '',
      'x-phuglee-user': 'admin',
      'x-phuglee-plan': 'pro'
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    }
  };
}

function maxReq(url, method = 'GET') {
  return {
    method,
    url,
    headers: {
      host: '127.0.0.1:3000',
      cookie: '',
      'x-phuglee-user': 'alice',
      'x-phuglee-plan': 'max'
    },
    async *[Symbol.asyncIterator]() {}
  };
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-catalog-'));
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/schema')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/contracts')];
  delete require.cache[require.resolve('../lib/leads-platform/ghl-contract-sync')];
  delete require.cache[require.resolve('../lib/leads-platform/api')];
  schema = require('../lib/leads-platform/schema');
  store = require('../lib/leads-platform/store');
  contracts = require('../lib/leads-platform/contracts');
  sync = require('../lib/leads-platform/ghl-contract-sync');
  api = require('../lib/leads-platform/api');
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
});

test('mapGhlStageName maps DTS stages', () => {
  // Live DTS sales stages
  assert.equal(sync.mapGhlStageName('🧑‍🍳 Interested | Nurturing'), 'interested');
  assert.equal(sync.mapGhlStageName('🔥 Warm | Engaged'), 'warm');
  assert.equal(sync.mapGhlStageName('🗣️ Verbal Offer Made'), 'verbal_offer');
  assert.equal(sync.mapGhlStageName('📨 Sent Contract to Seller'), 'contract_sent');
  // Contract signed (= Seller Signed) → Under Contract in Phuglee
  assert.equal(sync.mapGhlStageName('✅ Seller Signed | ➡️ Send To Title'), 'under_contract');
  assert.equal(sync.mapGhlStageName('Contract Signed'), 'under_contract');
  assert.equal(sync.mapGhlStageName('🔎 Escrow Opened + Looking for Buyers'), 'under_contract');
  assert.equal(sync.mapGhlStageName('📮 AOC Sent to Cash Buyer'), 'buyer_found');
  assert.equal(sync.mapGhlStageName('✅ AOC Signed | ➡️ Send to Title'), 'buyer_found');
  assert.equal(sync.mapGhlStageName('🏁 In Line to Close'), 'buyer_found');
  assert.equal(sync.mapGhlStageName('🥳 Funded'), 'funded');
  assert.equal(sync.mapGhlStageName('Terminated'), 'terminated');
  assert.equal(sync.mapGhlStageName('🚫 Not Interested'), null);
  assert.equal(sync.mapGhlStageName('Unknown Stage XYZ'), null);
});

test('computeDealProfit uses assignment fee then override', () => {
  assert.equal(schema.computeDealProfit({ assignmentFee: 15000 }), 15000);
  assert.equal(schema.computeDealProfit({ assignmentFee: 15000, profitOverride: 12000 }), 12000);
  assert.equal(schema.computeDealProfit({}), null);
});

test('catalogStatusForDealStage hides and sold-maps funded', () => {
  assert.equal(schema.catalogStatusForDealStage('interested'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('warm'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('verbal_offer'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('contract_sent'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('under_contract'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('buyer_found'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('funded'), 'sold');
  assert.equal(schema.catalogStatusForDealStage('terminated'), 'excluded');
});

test('queryLeads hides under_contract leads unless includeHidden', () => {
  const lead = store.upsertLead({
    address: '100 Proof St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    leadType: 'well_maintained',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active'
  });
  assert.equal(store.queryLeads({}).total, 1);

  store.setLeadCatalogStatus(lead.leadId, 'under_contract');
  assert.equal(store.queryLeads({}).total, 0);
  assert.equal(store.queryLeads({ includeHidden: true }).total, 1);
});

test('createDealFromVaultLead hides lead and lists in contracts', () => {
  const lead = store.upsertLead({
    address: '200 Contract Ave',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    leadType: 'distressed',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active'
  });
  const deal = contracts.createDealFromVaultLead(lead.leadId, {
    purchasePrice: 180000,
    assignmentFee: 12000
  });
  assert.equal(deal.stage, 'under_contract');
  assert.equal(deal.profit, 12000);
  const refreshed = store.getLead(lead.leadId);
  assert.equal(refreshed.catalogStatus, 'under_contract');
  assert.equal(store.queryLeads({}).total, 0);
  assert.ok(contracts.listDeals().some((d) => d.dealId === deal.dealId));
});

test('contract_sent PSA deals appear on contracts board Waiting section, not in UC KPIs', () => {
  const lead = store.upsertLead({
    address: '210 Waiting Ave',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    leadType: 'distressed',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active',
    ownerName: 'Pat Seller',
    email: 'pat@example.com'
  });
  const deal = contracts.createDealFromVaultLead(lead.leadId, {
    stage: 'contract_sent',
    purchasePrice: 95000,
    ownerName: 'Pat Seller',
    ownerEmail: 'pat@example.com',
    sellerNames: 'Pat Seller'
  });
  assert.equal(deal.stage, 'contract_sent');
  assert.equal(schema.DEAL_STAGE_LABELS.contract_sent, 'Waiting for Signatures');
  assert.equal(store.getLead(lead.leadId).catalogStatus, 'under_contract');

  const contractDeals = contracts.filterDealsForBoard(contracts.listDeals(), 'contracts');
  assert.ok(contractDeals.some((d) => d.dealId === deal.dealId && d.stage === 'contract_sent'));

  const totals = contracts.proofTotals(contracts.listDeals());
  const dispoCount = contracts.listDeals().filter((d) => schema.isDispoStage(d.stage)).length;
  assert.equal(totals.dealCount, dispoCount);
  assert.equal(
    totals.byStage.under_contract,
    contracts.listDeals().filter((d) => d.stage === 'under_contract').length
  );

  // Brad: tracker glance only (address/photo) — admin opens Waiting for Signatures.
  const bradView = contracts.projectDealForViewer(deal, 'brad');
  assert.equal(bradView.restricted, true);
  assert.equal(bradView.address, deal.address);
  assert.equal(bradView.ownerName, undefined);
  assert.throws(
    () => contracts.assertBradCanWriteDeal(deal, 'brad'),
    (err) => err.code === 'FORBIDDEN_SALES_STAGE'
  );
  const adminView = contracts.projectDealForViewer(deal, 'admin');
  assert.notEqual(adminView.restricted, true);
  assert.equal(adminView.ownerName, 'Pat Seller');
});

test('proofTotals reports pending signatures and average funded assignment fee', () => {
  const deals = [
    { dealId: 'a', stage: 'funded', assignmentFee: 10000 },
    { dealId: 'b', stage: 'funded', assignmentFee: 20000 },
    { dealId: 'c', stage: 'funded', assignmentFee: null }, // no fee → excluded from average
    { dealId: 'd', stage: 'contract_sent', assignmentFee: 5000 },
    { dealId: 'e', stage: 'contract_sent' },
    { dealId: 'f', stage: 'under_contract', assignmentFee: 8000 }
  ];
  const totals = contracts.proofTotals(deals);
  assert.equal(totals.pendingSignatures, 2);
  assert.equal(totals.funded, 3);
  assert.equal(totals.closedAssignmentFees, 30000);
  assert.equal(totals.fundedFeeCount, 2);
  assert.equal(totals.avgFundedAssignmentFee, 15000);
});

test('ensureDealContractParcel seeds APN and legal from mock REAPI', async () => {
  const lead = store.upsertLead({
    address: '300 Parcel Ln',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    leadType: 'distressed',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active'
  });
  const deal = contracts.createDealFromVaultLead(lead.leadId, {
    purchasePrice: 100000,
    assignmentFee: 8000
  });
  const reapi = {
    async propertyDetail() {
      return {
        apn: '123-45-678',
        legalDescription: 'LOT 9 BLOCK 2 SUNSET SUB'
      };
    }
  };
  const out = await contracts.ensureDealContractParcel(deal.dealId, { reapi });
  assert.equal(out.fields.apn, '123-45-678');
  assert.match(out.fields.legalDescription, /LOT 9/);
  assert.ok(out.filled.includes('apn'));
  assert.ok(out.filled.includes('legalDescription'));
  const savedLead = store.getLead(lead.leadId);
  assert.equal(savedLead.propertyDetails.apn, '123-45-678');
  assert.equal(savedLead.parcel, '123-45-678');
  assert.match(savedLead.propertyDetails.legalDescription, /LOT 9/);
  const savedDeal = contracts.getDeal(deal.dealId);
  assert.equal(savedDeal.aocSend.apn, '123-45-678');
  assert.match(savedDeal.aocSend.legalDescription, /LOT 9/);
});

test('normalizeAccessType accepts Seller Will Open', () => {
  assert.equal(contracts.normalizeAccessType('seller_will_open'), 'seller_will_open');
  assert.equal(contracts.normalizeAccessType('Seller Will Open'), 'seller_will_open');
  assert.equal(contracts.normalizeAccessType('seller opens'), 'seller_will_open');
  assert.equal(contracts.accessLabel('seller_will_open'), 'Seller Will Open');
  assert.equal(
    contracts.formatAccessDisplay('seller_will_open', 'call first'),
    'Seller Will Open'
  );

  const deal = contracts.upsertDeal({
    address: '88 Seller Open Way',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract',
    accessType: 'seller_will_open',
    accessDetail: 'text day-of'
  });
  assert.equal(deal.accessType, 'seller_will_open');
  const profile = contracts.getDealProfile(deal.dealId);
  assert.equal(profile.accessType, 'seller_will_open');
  assert.equal(profile.accessLabel, 'Seller Will Open');
  assert.equal(profile.accessDisplay, 'Seller Will Open');
});

test('ensureDealContractParcel skips REAPI when complete', async () => {
  const lead = store.upsertLead({
    address: '301 Parcel Ln',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281',
    leadType: 'distressed',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active',
    parcel: 'KEEP-APN',
    propertyDetails: {
      apn: 'KEEP-APN',
      legalDescription: 'KEEP LEGAL'
    }
  });
  const deal = contracts.createDealFromVaultLead(lead.leadId, {});
  let called = 0;
  const reapi = {
    async propertyDetail() {
      called += 1;
      return { apn: 'NEW', legalDescription: 'NEW LEGAL' };
    }
  };
  const out = await contracts.ensureDealContractParcel(deal.dealId, { reapi });
  assert.equal(called, 0);
  assert.equal(out.skipped, true);
  assert.equal(out.fields.apn, 'KEEP-APN');
  assert.equal(out.fields.legalDescription, 'KEEP LEGAL');
});

test('ghl opportunity upsert merges by ghlOpportunityId and may link lead', () => {
  const lead = store.upsertLead({
    address: '55 Sync Ln',
    city: 'Mesa',
    state: 'AZ',
    zip: '85201',
    leadType: 'well_maintained',
    reviewStatus: 'approved',
    signalTags: ['code']
  });

  const pipeline = {
    id: 'pipe1',
    name: 'DTS Pipeline',
    stages: [{ id: 'st1', name: 'Seller Signed | Send To Title' }]
  };
  const opp = {
    id: 'opp-abc',
    contactId: 'c1',
    pipelineStageId: 'st1',
    name: '55 Sync Ln — Mesa AZ',
    monetaryValue: 200000,
    _stageName: 'Seller Signed | Send To Title'
  };

  // Manual await via then — sync helper is async
  return sync.upsertDealFromOpportunity(opp, pipeline, {
    address1: '55 Sync Ln',
    city: 'Mesa',
    state: 'AZ',
    zip: '85201',
    contractPrice: '195000',
    assignmentFee: '10000',
    cashBuyerName: 'Cash Buyer LLC'
  }).then((deal) => {
    assert.equal(deal.ghlOpportunityId, 'opp-abc');
    assert.equal(deal.leadId, lead.leadId);
    assert.equal(deal.stage, 'under_contract');
    assert.equal(deal.purchasePrice, 195000);
    assert.equal(store.getLead(lead.leadId).catalogStatus, 'under_contract');

    return sync.upsertDealFromOpportunity(
      { ...opp, _stageName: 'Funded' },
      pipeline,
      { address1: '55 Sync Ln', city: 'Mesa', state: 'AZ', assignmentFee: '10000', contractPrice: '195000' }
    );
  }).then((deal2) => {
    assert.equal(deal2.dealId, contracts.findDealByGhlOpportunityId('opp-abc').dealId);
    assert.equal(deal2.stage, 'funded');
    assert.equal(store.getLead(lead.leadId).catalogStatus, 'sold');
  });
});

test('GHL sync refreshes ownerEmail/email/phone from CRM contact', async () => {
  const pipeline = {
    id: 'pipe-contact',
    name: 'DTS Pipeline',
    stages: [{ id: 'st1', name: 'Seller Signed | Send To Title' }]
  };
  const opp = {
    id: 'opp-contact-refresh',
    contactId: 'c-contact-1',
    pipelineStageId: 'st1',
    name: '910 Delaware Avenue Ohio',
    _stageName: 'Seller Signed | Send To Title'
  };
  const first = await sync.upsertDealFromOpportunity(opp, pipeline, {
    address1: '910 Delaware Avenue',
    city: 'Youngstown',
    state: 'OH',
    email: 'old@example.com',
    phone: '+18065551212',
    contractPrice: '50000'
  });
  assert.equal(first.email, 'old@example.com');
  assert.equal(first.ownerEmail, 'old@example.com');

  const refreshed = await sync.upsertDealFromOpportunity(opp, pipeline, {
    address1: '910 Delaware Avenue',
    city: 'Youngstown',
    state: 'OH',
    email: 'correct@crm.example',
    phone: '8068319386',
    contractPrice: '50000'
  });
  assert.equal(refreshed.dealId, first.dealId);
  assert.equal(refreshed.email, 'correct@crm.example');
  assert.equal(refreshed.ownerEmail, 'correct@crm.example');
  assert.ok(String(refreshed.phone || '').includes('806') || String(refreshed.phone || '').includes('831'));
});

test('admin contracts list requires admin', async () => {
  const forbidden = mockRes();
  const url = new URL('http://127.0.0.1/api/leads/admin/contracts');
  await api.handle(maxReq('/api/leads/admin/contracts'), forbidden, '/api/leads/admin/contracts', url);
  assert.equal(forbidden.statusCode, 403);

  const ok = mockRes();
  await api.handle(adminReq('/api/leads/admin/contracts'), ok, '/api/leads/admin/contracts', url);
  assert.equal(ok.statusCode, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.deals));
  assert.ok(body.totals);
  assert.ok(Array.isArray(body.unreadTeam));
});

function bradReq(url, method = 'GET', body = null) {
  return {
    method,
    url,
    headers: {
      host: '127.0.0.1:3000',
      cookie: '',
      'x-phuglee-user': 'brad',
      'x-phuglee-plan': 'max'
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    }
  };
}

test('brad can save desk fields via POST and admin sees them', async () => {
  const deal = contracts.upsertDeal({
    address: '77 Brad Save Ln',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract'
  });
  const path = `/api/leads/admin/contracts/${deal.dealId}`;
  const url = new URL(`http://127.0.0.1${path}`);
  const saveRes = mockRes();
  await api.handle(bradReq(path, 'POST', {
    titleOpened: 'yes',
    sellerEmdSubmitted: 'yes',
    accessType: 'lockbox',
    accessDetail: 'box 12',
    vacancy: 'vacant',
    photosAvailable: 'yes',
    photoCost: 275,
    rehabInfo: { roof: '5 yrs good', ac: 'new', foundation: 'ok', electrical: 'ok', plumbing: 'ok', other: '' },
    notes: 'brad desk note'
  }), saveRes, path, url);
  assert.equal(saveRes.statusCode, 200, saveRes.body);
  const savedBody = JSON.parse(saveRes.body);
  assert.equal(savedBody.ok, true);
  assert.equal(savedBody.deal.titleOpened, 'yes');
  assert.equal(savedBody.deal.rehabInfo.roof, '5 yrs good');
  assert.equal(savedBody.deal.photoCost, 275);

  const onDisk = contracts.getDeal(deal.dealId);
  assert.equal(onDisk.titleOpened, 'yes');
  assert.equal(onDisk.notes, 'brad desk note');
  assert.equal(onDisk.accessType, 'lockbox');

  const adminList = mockRes();
  const listUrl = new URL('http://127.0.0.1/api/leads/admin/contracts');
  await api.handle(adminReq('/api/leads/admin/contracts'), adminList, '/api/leads/admin/contracts', listUrl);
  assert.equal(adminList.statusCode, 200);
  const listed = JSON.parse(adminList.body).deals.find((d) => d.dealId === deal.dealId);
  assert.ok(listed, 'admin board should include brad-saved deal');
  assert.equal(listed.titleOpened, 'yes');
  assert.equal(listed.sellerEmdSubmitted, 'yes');
  assert.equal(listed.accessType, 'lockbox');
  assert.equal(listed.rehabInfo.roof, '5 yrs good');
  assert.equal(listed.photoCost, 275);
  assert.equal(listed.notes, 'brad desk note');
});

test('GHL sync keeps Brad desk fields', async () => {
  const deal = contracts.upsertDeal({
    dealId: 'ghl_opp_brad_keep',
    ghlOpportunityId: 'opp_brad_keep',
    address: '88 Keep Desk Ave',
    city: 'Mesa',
    state: 'AZ',
    stage: 'under_contract',
    titleOpened: 'yes',
    photosAvailable: 'yes',
    photoCost: 150,
    rehabInfo: { roof: 'patched', ac: '', foundation: '', electrical: '', plumbing: '', other: '' },
    notes: 'keep me'
  });
  const after = await sync.upsertDealFromOpportunity(
    {
      id: 'opp_brad_keep',
      contactId: 'c_keep',
      pipelineStageId: 's1',
      _stageName: 'Seller Signed',
      name: '88 Keep Desk Ave',
      monetaryValue: 200000
    },
    { id: 'pipe', stages: [{ id: 's1', name: 'Seller Signed' }] },
    { address1: '88 Keep Desk Ave', city: 'Mesa', state: 'AZ', contractPrice: 200000 }
  );
  assert.equal(after.dealId, deal.dealId);
  assert.equal(after.titleOpened, 'yes');
  assert.equal(after.photosAvailable, 'yes');
  assert.equal(after.photoCost, 150);
  assert.equal(after.rehabInfo.roof, 'patched');
  assert.equal(after.notes, 'keep me');
});

test('GHL sync preserves locked SMS contact remap', async () => {
  const deal = contracts.upsertDeal({
    dealId: 'ghl_opp_sms_lock',
    ghlOpportunityId: 'opp_sms_lock',
    address: '103 Laurel Ave',
    city: 'Victoria',
    state: 'TX',
    stage: 'under_contract',
    ghlContactId: 'Hl2wGn5xH5AoFyucXjM6',
    ghlContactLocked: true,
    phone: '+18322965168',
    conversationId: 'MQYCgAMYQubw69lhUHhy',
    ownerName: 'Gina Galloway'
  });
  const after = await sync.upsertDealFromOpportunity(
    {
      id: 'opp_sms_lock',
      contactId: 'hVAdAnsoJPYPRI29D9Vy',
      pipelineStageId: 's1',
      _stageName: 'Seller Signed',
      name: '103 Laurel Ave',
      monetaryValue: 39000
    },
    { id: 'pipe', stages: [{ id: 's1', name: 'Seller Signed' }] },
    {
      id: 'hVAdAnsoJPYPRI29D9Vy',
      address1: '103 Laurel Ave',
      city: 'Victoria',
      state: 'TX',
      phone: '+12813563939',
      name: 'Jerry Walker'
    }
  );
  assert.equal(after.dealId, deal.dealId);
  assert.equal(after.ghlContactLocked, true);
  assert.equal(after.ghlContactId, 'Hl2wGn5xH5AoFyucXjM6');
  assert.equal(after.phone, '+18322965168');
  assert.equal(after.conversationId, 'MQYCgAMYQubw69lhUHhy');
});

test('computeDealPayouts skips TC and splits 50/50 after photo cost', () => {
  const { computeDealPayouts, DEFAULTS } = require('../lib/leads-platform/payout-settings');
  assert.equal(DEFAULTS.tcFee, 0);
  assert.equal(DEFAULTS.acqPercent, 50);
  assert.equal(DEFAULTS.dispoPercent, 50);
  // Legacy tcFee in settings is ignored — TC is retired.
  const settings = { tcFee: 500, acqPercent: 50, dispoPercent: 50 };
  const out = computeDealPayouts(10000, 1500, settings);
  assert.equal(out.tcPay, 0);
  assert.equal(out.photoCost, 1500);
  assert.equal(out.netAfterCosts, 8500);
  assert.equal(out.acqPay, 4250);
  assert.equal(out.dispoPay, 4250);
});

test('sellerSms unread + mark seen + find latest inbound', () => {
  const deal = contracts.upsertDeal({
    address: '100 SMS Ave',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    ghlContactId: 'contact_sms_test'
  });
  const saved = contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'out1', body: 'Hi seller', direction: 'outbound', dateAdded: '2026-07-14T10:00:00.000Z' },
    { id: 'in1', body: 'Coming by at 3', direction: 'inbound', dateAdded: '2026-07-14T10:05:00.000Z' }
  ]);
  assert.equal(saved.sellerSms.lastInboundId, 'in1');
  assert.equal(contracts.isSellerSmsUnreadForUser(saved, 'admin'), true);
  assert.ok(contracts.listUnreadSellerSmsForUser('admin').some((u) => u.dealId === deal.dealId));

  const seen = contracts.markSellerSmsSeen(deal.dealId, 'admin');
  assert.equal(contracts.isSellerSmsUnreadForUser(seen, 'admin'), false);
  assert.ok(!contracts.listUnreadSellerSmsForUser('admin').some((u) => u.dealId === deal.dealId));

  const funded = contracts.upsertDeal({
    address: '200 Funded St',
    city: 'Tempe',
    state: 'AZ',
    stage: 'funded',
    ghlContactId: 'contact_funded'
  });
  // Funded deals are skipped by peek candidate filter (stage === funded)
  assert.equal(funded.stage, 'funded');

  const inbound = contracts.findLatestInboundMessage([
    { id: 'a', direction: 'out', body: 'x' },
    { id: 'b', direction: 'inbound', body: 'yes' }
  ]);
  assert.equal(inbound.id, 'b');
});

test('sellerSms stays unread until markSellerSmsSeen (open/poll must not auto-clear)', () => {
  const deal = contracts.upsertDeal({
    address: '101 Stay Unread Ave',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    ghlContactId: 'contact_stay_unread'
  });
  contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'stay-in1', body: 'Call me back', direction: 'inbound', dateAdded: '2026-07-14T11:00:00.000Z' }
  ]);
  assert.equal(contracts.isSellerSmsUnreadForUser(contracts.getDeal(deal.dealId), 'admin'), true);
  // Re-recording the same inbound (as GET /messages does) must leave unread intact.
  contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'stay-in1', body: 'Call me back', direction: 'inbound', dateAdded: '2026-07-14T11:00:00.000Z' }
  ]);
  assert.equal(contracts.isSellerSmsUnreadForUser(contracts.getDeal(deal.dealId), 'admin'), true);
  contracts.markSellerSmsSeen(deal.dealId, 'admin');
  assert.equal(contracts.isSellerSmsUnreadForUser(contracts.getDeal(deal.dealId), 'admin'), false);
});

test('GHL timestamp parse + attachment-only MMS counts as latest inbound', () => {
  const ghl = require('../lib/leads-platform/ghl-client');
  assert.equal(ghl.parseGhlTimestamp('2026-07-14T16:42:51.303Z'), '2026-07-14T16:42:51.303Z');
  // Bare ISO (no Z) must be treated as UTC, not local wall clock.
  assert.equal(ghl.parseGhlTimestamp('2026-07-14T16:42:51.303'), '2026-07-14T16:42:51.303Z');
  assert.equal(ghl.parseGhlTimestamp(1784047442949), '2026-07-14T16:44:02.949Z');
  assert.equal(
    ghl.isHumanSmsMessage({
      id: 'mms1',
      direction: 'inbound',
      messageType: 'TYPE_SMS',
      body: '',
      attachments: ['https://example.com/a.jpg'],
      dateAdded: '2026-07-14T16:44:04.251Z'
    }),
    true
  );
  assert.equal(
    ghl.isHumanSmsMessage({
      id: 'empty',
      direction: 'inbound',
      messageType: 'TYPE_SMS',
      body: '',
      attachments: []
    }),
    false
  );

  const deal = contracts.upsertDeal({
    address: '102 Photo MMS Ave',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    ghlContactId: 'contact_mms'
  });
  const saved = contracts.recordSellerSmsFromMessages(deal.dealId, [
    {
      id: 'text1',
      body: 'Not of the inside',
      direction: 'inbound',
      dateAdded: '2026-07-14T16:42:51.303Z'
    },
    {
      id: 'mms1',
      body: '',
      direction: 'inbound',
      dateAdded: '2026-07-14T16:44:04.251Z',
      attachments: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    }
  ]);
  assert.equal(saved.sellerSms.lastInboundId, 'mms1');
  assert.equal(saved.sellerSms.lastInboundAt, '2026-07-14T16:44:04.251Z');
  assert.match(saved.sellerSms.lastInboundPreview, /photo/i);
});

test('seller SMS alert clears after desk reply and never regresses to older inbound', () => {
  const deal = contracts.upsertDeal({
    address: '104 Reply Clears Ave',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    ghlContactId: 'contact_reply_clears'
  });
  contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'in-new', body: 'Front door open', direction: 'inbound', dateAdded: '2026-07-14T16:23:42.081Z' }
  ]);
  assert.equal(contracts.isSellerSmsUnreadForUser(contracts.getDeal(deal.dealId), 'admin'), true);

  const afterReply = contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'in-new', body: 'Front door open', direction: 'inbound', dateAdded: '2026-07-14T16:23:42.081Z' },
    { id: 'out-reply', body: 'Ok perfect', direction: 'outbound', dateAdded: '2026-07-14T16:28:20.369Z' }
  ]);
  assert.equal(contracts.isSellerSmsUnreadForUser(afterReply, 'admin'), false);
  assert.equal(contracts.isSellerSmsUnreadForUser(afterReply, 'brad'), false);

  // Incomplete older peek must not overwrite a newer stored inbound.
  const afterStalePeek = contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'in-old', body: 'Old text', direction: 'inbound', dateAdded: '2026-06-01T12:00:00.000Z' },
    { id: 'out-reply', body: 'Ok perfect', direction: 'outbound', dateAdded: '2026-07-14T16:28:20.369Z' }
  ]);
  assert.equal(afterStalePeek.sellerSms.lastInboundId, 'in-new');
  assert.equal(afterStalePeek.sellerSms.lastInboundAt, '2026-07-14T16:23:42.081Z');

  // New seller text after our reply brings the alert back.
  const afterSellerAgain = contracts.recordSellerSmsFromMessages(deal.dealId, [
    { id: 'in-new', body: 'Front door open', direction: 'inbound', dateAdded: '2026-07-14T16:23:42.081Z' },
    { id: 'out-reply', body: 'Ok perfect', direction: 'outbound', dateAdded: '2026-07-14T16:28:20.369Z' },
    { id: 'in-photos', body: '', direction: 'inbound', dateAdded: '2026-07-14T16:44:04.251Z', attachments: ['https://x/a.jpg'] }
  ]);
  assert.equal(afterSellerAgain.sellerSms.lastInboundId, 'in-photos');
  assert.equal(contracts.isSellerSmsUnreadForUser(afterSellerAgain, 'admin'), true);
});

test('seller media saves locally and zips for download', async () => {
  const deal = contracts.upsertDeal({
    address: '105 Media Zip Ave',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    ghlContactId: 'contact_media_zip'
  });
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const mediaDir = path.join(
    process.env.LEADS_CATALOG_ROOT || path.join(tmpRoot, 'leads-catalog'),
    'contracts',
    'files',
    deal.dealId,
    'media'
  );
  fs.mkdirSync(mediaDir, { recursive: true });
  const fileName = 'media_unit_test.png';
  fs.writeFileSync(path.join(mediaDir, fileName), tinyPng);
  const saved = contracts.upsertDeal({
    ...deal,
    sellerMedia: [{
      id: 'media_unit_test',
      name: 'seller-photo.png',
      mimeType: 'image/png',
      kind: 'image',
      size: tinyPng.length,
      sourceUrl: 'https://example.com/seller-photo.png',
      localFile: fileName,
      savedAt: '2026-07-14T18:00:00.000Z'
    }]
  });
  const enriched = contracts.enrichDealForDisplay(saved);
  assert.equal(enriched.sellerMedia.length, 1);
  assert.match(enriched.sellerMedia[0].viewUrl, /\/media\/media_unit_test$/);
  assert.match(enriched.mediaZipUrl, /\/media\/zip$/);

  const zip = await contracts.buildSellerMediaZip(deal.dealId);
  assert.ok(zip.buffer.length > 40);
  assert.match(zip.filename, /media\.zip$/i);
  assert.equal(zip.count, 1);

  const afterRemove = contracts.removeSellerMedia(deal.dealId, 'media_unit_test');
  assert.equal((afterRemove.sellerMedia || []).length, 0);
});

test('team messages + unread list for other user', () => {
  const deal = contracts.upsertDeal({
    address: '910 Delaware St',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract',
    assignmentFee: 12000,
    photoCost: 250
  });
  const enriched = contracts.enrichDealForDisplay(deal);
  assert.equal(enriched.photoCost, 250);
  assert.equal(enriched.funded, 'no');
  assert.ok(enriched.tcPay != null);

  const { message } = contracts.addTeamMessage(deal.dealId, {
    fromUser: 'brad',
    body: 'Title called — EMD wire tomorrow'
  });
  assert.equal(message.fromUser, 'brad');
  assert.ok(message.readBy.brad);

  const unreadAdmin = contracts.listUnreadTeamForUser('admin');
  assert.ok(unreadAdmin.some((u) => u.dealId === deal.dealId && u.count >= 1));

  contracts.markTeamMessagesRead(deal.dealId, 'admin');
  const unreadAfter = contracts.listUnreadTeamForUser('admin');
  assert.ok(!unreadAfter.some((u) => u.dealId === deal.dealId));

  // New unread for admin, then admin replies — reply must clear their banner/unread.
  contracts.addTeamMessage(deal.dealId, {
    fromUser: 'brad',
    body: 'Follow-up from title'
  });
  assert.ok(contracts.listUnreadTeamForUser('admin').some((u) => u.dealId === deal.dealId));
  contracts.addTeamMessage(deal.dealId, {
    fromUser: 'admin',
    body: 'Got it — thanks'
  });
  assert.ok(
    !contracts.listUnreadTeamForUser('admin').some((u) => u.dealId === deal.dealId),
    'sending a team reply clears unread for the sender on that deal'
  );

  const reacted = contracts.toggleTeamMessageReaction(deal.dealId, message.id, 'fire', 'admin');
  assert.ok(reacted.message.reactions.fire.admin);
  const unreacted = contracts.toggleTeamMessageReaction(deal.dealId, message.id, 'fire', 'admin');
  assert.equal(unreacted.message.reactions.fire.admin, null);

  const desk = contracts.isDeskReady({
    accessType: 'lockbox',
    vacancy: 'vacant',
    rehabInfo: { roof: 'ok', ac: 'ok', foundation: 'ok', electrical: 'ok', plumbing: 'ok', other: '' }
  });
  assert.equal(desk, true);
});

test('team chat GIF attachment + giphy client + admin gif routes', async () => {
  const deal = contracts.upsertDeal({
    address: '911 Meme Ave',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract',
    assignmentFee: 10000,
    photoCost: 0
  });
  const gifUrl = 'https://media.giphy.com/media/xT4uQulxzV39haRFjG/giphy.gif';
  const { message } = contracts.addTeamMessage(deal.dealId, {
    fromUser: 'admin',
    body: '',
    gif: { url: gifUrl, title: 'test meme', provider: 'giphy', id: 'xT4uQulxzV39haRFjG' }
  });
  assert.ok(message.gif);
  assert.equal(message.gif.url, gifUrl);
  assert.ok(message.body === 'test meme' || message.body === 'GIF');

  const blocked = contracts.normalizeGifAttachment({
    url: 'https://evil.example/hack.gif'
  });
  assert.equal(blocked, null);

  const giphy = require('../lib/leads-platform/giphy-client');
  assert.equal(typeof giphy.searchGifs, 'function');
  assert.equal(typeof giphy.isConfigured, 'function');

  const statusUrl = new URL('http://127.0.0.1/api/leads/admin/gifs/status');
  const statusRes = mockRes();
  const handledStatus = await api.handle(
    adminReq('/api/leads/admin/gifs/status'),
    statusRes,
    '/api/leads/admin/gifs/status',
    statusUrl
  );
  assert.equal(handledStatus, true);
  assert.equal(statusRes.statusCode, 200);
  const statusBody = JSON.parse(statusRes.body);
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.provider, 'giphy');
  assert.equal(typeof statusBody.configured, 'boolean');

  // Without a key, search returns 503 GIPHY_NOT_CONFIGURED (not a silent 404).
  const prevKey = process.env.GIPHY_API_KEY;
  delete process.env.GIPHY_API_KEY;
  delete process.env.GIPHY_KEY;
  try {
    const searchPath = '/api/leads/admin/gifs/search?q=test&limit=2';
    const searchUrl = new URL(`http://127.0.0.1${searchPath}`);
    const searchRes = mockRes();
    const handledSearch = await api.handle(
      adminReq(searchPath),
      searchRes,
      '/api/leads/admin/gifs/search',
      searchUrl
    );
    assert.equal(handledSearch, true);
    assert.equal(searchRes.statusCode, 503);
    const searchBody = JSON.parse(searchRes.body);
    assert.equal(searchBody.code, 'GIPHY_NOT_CONFIGURED');
  } finally {
    if (prevKey != null) process.env.GIPHY_API_KEY = prevKey;
  }

  // GIF click stages a draft in compose — does not auto-send.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'under-contract.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'under-contract.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'under-contract.css'), 'utf8');
  assert.match(html, /id="uc-gif-draft"/);
  assert.match(html, /id="uc-gif-draft-clear"/);
  assert.match(js, /function stageGifInCompose\s*\(/);
  assert.match(js, /function clearPendingTeamGif\s*\(/);
  assert.match(js, /pendingTeamGif/);
  assert.match(js, /stageGifInCompose\(gif\)/);
  assert.doesNotMatch(js, /function sendGifFromPicker\s*\(/);
  assert.match(css, /\.uc-gif-draft/);
});

test('pre-UC GHL upsert hides Vault lead; pipeline board includes it', async () => {
  const lead = store.upsertLead({
    address: '77 Pipeline Rd',
    city: 'Gilbert',
    state: 'AZ',
    zip: '85233',
    leadType: 'well_maintained',
    reviewStatus: 'approved',
    signalTags: ['code'],
    catalogStatus: 'active'
  });
  assert.equal(store.queryLeads({}).total >= 1, true);

  const pipeline = {
    id: 'pipe-sales',
    name: 'DTS Pipeline',
    stages: [{ id: 'st-int', name: 'Interested' }]
  };
  const opp = {
    id: 'opp-sales-1',
    contactId: 'c-sales',
    pipelineStageId: 'st-int',
    name: '77 Pipeline Rd — Gilbert AZ',
    monetaryValue: 0,
    _stageName: 'Interested'
  };
  const deal = await sync.upsertDealFromOpportunity(opp, pipeline, {
    address1: '77 Pipeline Rd',
    city: 'Gilbert',
    state: 'AZ',
    zip: '85233'
  });
  assert.equal(deal.stage, 'interested');
  assert.equal(deal.leadId, lead.leadId);
  assert.equal(store.getLead(lead.leadId).catalogStatus, 'under_contract');
  assert.equal(store.queryLeads({}).leads.some((l) => l.leadId === lead.leadId), false);

  const pipelineDeals = contracts.filterDealsForBoard(contracts.listDeals(), 'pipeline');
  assert.ok(pipelineDeals.some((d) => d.dealId === deal.dealId && d.stage === 'interested'));
  const contractDeals = contracts.filterDealsForBoard(contracts.listDeals(), 'contracts');
  assert.ok(!contractDeals.some((d) => d.dealId === deal.dealId));
});

test('Brad projection strips PII on pre-UC; full on UC+; write blocked', async () => {
  const sales = contracts.upsertDeal({
    address: '12 Secret Ave',
    city: 'Scottsdale',
    state: 'AZ',
    stage: 'verbal_offer',
    phone: '4805550199',
    ownerName: 'Hidden Owner',
    notes: 'secret offer notes',
    streetViewUrl: 'https://example.com/sv.jpg'
  });
  const projected = contracts.projectDealForViewer(sales, 'brad');
  assert.equal(projected.restricted, true);
  assert.equal(projected.address, '12 Secret Ave');
  assert.ok(projected.thumbUrl || projected.streetViewUrl);
  assert.equal(projected.phone, undefined);
  assert.equal(projected.ownerName, undefined);
  assert.equal(projected.notes, undefined);

  assert.throws(
    () => contracts.assertBradCanWriteDeal(sales, 'brad'),
    (err) => err.code === 'FORBIDDEN_SALES_STAGE'
  );

  const waiting = contracts.upsertDeal({
    address: '44 Waiting Sig Ave',
    city: 'Mesa',
    state: 'AZ',
    stage: 'contract_sent',
    phone: '4805550111',
    ownerName: 'Pending Seller',
    purchasePrice: 220000,
    streetViewUrl: 'https://example.com/wait.jpg'
  });
  const waitingProj = contracts.projectDealForViewer(waiting, 'brad');
  assert.equal(waitingProj.restricted, true);
  assert.equal(waitingProj.address, '44 Waiting Sig Ave');
  assert.ok(waitingProj.thumbUrl || waitingProj.streetViewUrl);
  assert.equal(waitingProj.phone, undefined);
  assert.equal(waitingProj.ownerName, undefined);
  assert.equal(waitingProj.purchasePrice, undefined);
  assert.throws(
    () => contracts.assertBradCanWriteDeal(waiting, 'brad'),
    (err) => err.code === 'FORBIDDEN_SALES_STAGE'
  );
  const adminWaiting = contracts.projectDealForViewer(waiting, 'admin');
  assert.notEqual(adminWaiting.restricted, true);
  assert.equal(adminWaiting.ownerName, 'Pending Seller');

  const uc = contracts.upsertDeal({
    address: '99 Open Ln',
    city: 'Tempe',
    state: 'AZ',
    stage: 'under_contract',
    phone: '4805550100',
    ownerName: 'Visible'
  });
  const full = contracts.projectDealForViewer(uc, 'brad');
  assert.notEqual(full.restricted, true);
  assert.equal(full.phone, '4805550100');
  assert.doesNotThrow(() => contracts.assertBradCanWriteDeal(uc, 'brad'));

  const patchRes = mockRes();
  await api.handle(
    bradReq(`/api/leads/admin/contracts/${sales.dealId}`, 'POST', { notes: 'hack' }),
    patchRes,
    `/api/leads/admin/contracts/${sales.dealId}`,
    new URL(`http://127.0.0.1/api/leads/admin/contracts/${sales.dealId}`)
  );
  assert.equal(patchRes.statusCode, 403);

  const waitGet = mockRes();
  await api.handle(
    bradReq(`/api/leads/admin/contracts/${waiting.dealId}`),
    waitGet,
    `/api/leads/admin/contracts/${waiting.dealId}`,
    new URL(`http://127.0.0.1/api/leads/admin/contracts/${waiting.dealId}`)
  );
  assert.equal(waitGet.statusCode, 403);
  assert.match(JSON.parse(waitGet.body).error || '', /Waiting for Signatures/i);

  const adminGet = mockRes();
  await api.handle(
    adminReq(`/api/leads/admin/contracts/${waiting.dealId}`),
    adminGet,
    `/api/leads/admin/contracts/${waiting.dealId}`,
    new URL(`http://127.0.0.1/api/leads/admin/contracts/${waiting.dealId}`)
  );
  assert.equal(adminGet.statusCode, 200);
  assert.equal(JSON.parse(adminGet.body).deal.ownerName, 'Pending Seller');

  const listRes = mockRes();
  await api.handle(
    bradReq('/api/leads/admin/contracts?board=contracts'),
    listRes,
    '/api/leads/admin/contracts',
    new URL('http://127.0.0.1/api/leads/admin/contracts?board=contracts')
  );
  assert.equal(listRes.statusCode, 200);
  const listBody = JSON.parse(listRes.body);
  const waitingCard = listBody.deals.find((d) => d.dealId === waiting.dealId);
  assert.ok(waitingCard);
  assert.equal(waitingCard.restricted, true);
  assert.equal(waitingCard.ownerName, undefined);
  assert.equal(waitingCard.phone, undefined);

  const pipeRes = mockRes();
  await api.handle(
    bradReq('/api/leads/admin/contracts?board=pipeline'),
    pipeRes,
    '/api/leads/admin/contracts',
    new URL('http://127.0.0.1/api/leads/admin/contracts?board=pipeline')
  );
  assert.equal(pipeRes.statusCode, 200);
  const pipeBody = JSON.parse(pipeRes.body);
  const salesCard = pipeBody.deals.find((d) => d.dealId === sales.dealId);
  assert.ok(salesCard);
  assert.equal(salesCard.restricted, true);
  assert.equal(salesCard.phone, undefined);
});

test('dispos role allows all pages except settings', () => {
  const roles = require('../lib/phuglee-roles');
  assert.equal(roles.isPathAllowedForUsername('brad', '/pipeline'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/under-contract'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/land-vault'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/buyers'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/trust-funds'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/government-lists'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/filter'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/command'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/collect'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/analyzer'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/pre-liens'), true);
  assert.equal(roles.isPathAllowedForUsername('brad', '/operating-costs'), false);
  assert.ok(roles.DISPOS_DENIED_PATHS.has('/operating-costs'));
});

test('vault-only role (matt) allows /vault and /land-vault', () => {
  const roles = require('../lib/phuglee-roles');
  assert.equal(roles.isVaultOnlyUsername('matt'), true);
  assert.equal(roles.isPathAllowedForUsername('matt', '/vault'), true);
  assert.equal(roles.isPathAllowedForUsername('matt', '/land-vault'), true);
  assert.equal(roles.isPathAllowedForUsername('matt', '/under-contract'), false);
  assert.equal(roles.isPathAllowedForUsername('matt', '/pipeline'), false);
  assert.equal(roles.isPathAllowedForUsername('matt', '/buyers'), false);
  assert.equal(roles.isPathAllowedForUsername('matt', '/trust-funds'), false);
  assert.equal(roles.isPathAllowedForUsername('matt', '/filter'), false);
  assert.equal(roles.isPathAllowedForUsername('matt', '/command'), false);
  assert.equal(roles.isAdminUsername('matt'), false);
  assert.equal(roles.isContractDeskUsername('matt'), false);
  assert.equal(roles.hasVaultAccess('matt', 'pro'), true);
  assert.equal(roles.defaultHomeForUsername('matt'), '/vault');
  assert.equal(roles.roleForUsername('matt').id, 'vault');
});

test('compareDealsByProcess ranks closer-to-funding higher', () => {
  const funded = { dealId: 'a', stage: 'funded', createdAt: '2026-01-01T00:00:00.000Z' };
  const buyer = { dealId: 'b', stage: 'buyer_found', createdAt: '2026-01-01T00:00:00.000Z' };
  const uc = { dealId: 'c', stage: 'under_contract', createdAt: '2026-01-01T00:00:00.000Z' };
  const term = { dealId: 'd', stage: 'terminated', createdAt: '2026-01-01T00:00:00.000Z' };
  const ordered = [term, uc, funded, buyer].sort(schema.compareDealsByProcess);
  assert.deepEqual(ordered.map((d) => d.stage), [
    'funded',
    'buyer_found',
    'under_contract',
    'terminated'
  ]);
});

test('listDeals orders by process stage not updatedAt', () => {
  const funded = contracts.upsertDeal({
    address: '1 Sort Funded St',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'funded',
    fundedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  });
  const buyer = contracts.upsertDeal({
    address: '2 Sort Buyer St',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'buyer_found',
    createdAt: '2026-01-02T00:00:00.000Z'
  });
  const uc = contracts.upsertDeal({
    address: '3 Sort UC St',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract',
    createdAt: '2026-01-03T00:00:00.000Z'
  });
  const term = contracts.upsertDeal({
    address: '4 Sort Term St',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'terminated',
    createdAt: '2026-01-04T00:00:00.000Z'
  });

  // Bump updatedAt on the least-progress deal — must not leap above funded/buyer
  contracts.upsertDeal({
    ...contracts.getDeal(uc.dealId),
    notes: 'touch for updatedAt'
  });

  const ids = new Set([funded.dealId, buyer.dealId, uc.dealId, term.dealId]);
  const ordered = contracts.listDeals().filter((d) => ids.has(d.dealId));
  assert.deepEqual(ordered.map((d) => d.dealId), [
    funded.dealId,
    buyer.dealId,
    uc.dealId,
    term.dealId
  ]);
});

test('listDeals ranks checklist progress within under_contract; updatedAt ignored', () => {
  const low = contracts.upsertDeal({
    address: '10 Progress Low Ave',
    city: 'Mesa',
    state: 'AZ',
    stage: 'under_contract',
    titleOpened: 'yes',
    createdAt: '2026-02-01T00:00:00.000Z'
  });
  const high = contracts.upsertDeal({
    address: '11 Progress High Ave',
    city: 'Mesa',
    state: 'AZ',
    stage: 'under_contract',
    buyerEmdSubmitted: 'yes',
    cashBuyerName: 'Cash Buyer LLC',
    createdAt: '2026-02-02T00:00:00.000Z'
  });

  // Newer updatedAt on the lower-progress deal must not reorder
  contracts.upsertDeal({
    ...contracts.getDeal(low.dealId),
    notes: 'sms peek bump'
  });

  const ids = new Set([low.dealId, high.dealId]);
  const ordered = contracts.listDeals().filter((d) => ids.has(d.dealId));
  assert.deepEqual(ordered.map((d) => d.dealId), [high.dealId, low.dealId]);
  assert.ok(schema.dealProcessProgressScore(high) > schema.dealProcessProgressScore(low));
});

test('listDeals ranks funded peers by fundedAt newest first', () => {
  const older = contracts.upsertDeal({
    address: '20 Funded Old Rd',
    city: 'Tempe',
    state: 'AZ',
    stage: 'funded',
    fundedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z'
  });
  const newer = contracts.upsertDeal({
    address: '21 Funded New Rd',
    city: 'Tempe',
    state: 'AZ',
    stage: 'funded',
    fundedAt: '2026-05-01T00:00:00.000Z',
    createdAt: '2026-02-02T00:00:00.000Z'
  });

  const ids = new Set([older.dealId, newer.dealId]);
  const ordered = contracts.listDeals().filter((d) => ids.has(d.dealId));
  assert.deepEqual(ordered.map((d) => d.dealId), [newer.dealId, older.dealId]);
});

test('resolveDealTypeForAlert prefers dealType then SignNow / cash PSA hints', () => {
  const notify = require('../lib/leads-platform/team-notify');
  assert.equal(notify.resolveDealTypeForAlert({ dealType: 'subject_to' }).label, 'Subject-to contract');
  assert.equal(notify.resolveDealTypeForAlert({ dealType: 'cash' }).label, 'Cash contract');
  assert.equal(
    notify.resolveDealTypeForAlert({
      signNowPending: [{ templateKey: 'cash', documentName: 'Cash Purchase Agreement' }]
    }).key,
    'cash'
  );
  assert.equal(
    notify.resolveDealTypeForAlert({
      cashPsaSend: { status: 'sent', signNowDocumentId: 'abc123' }
    }).key,
    'cash'
  );
  assert.equal(
    notify.resolveDealTypeForAlert({
      notes: 'Subto lead — Joseph Jewell Alabama'
    }).key,
    'subject_to'
  );
});

test('under-contract entry fires one-shot team alert flag', async () => {
  const sales = contracts.upsertDeal({
    address: '12 New Deal Alert Ln',
    city: 'Dallas',
    state: 'TX',
    stage: 'contract_sent',
    purchasePrice: 185000
  });
  assert.equal(sales.alertFlags?.underContract, false);

  const after = contracts.upsertDeal({
    ...sales,
    stage: 'under_contract'
  });
  const result = await contracts.fireDealTransitionAlerts(sales, after);
  assert.ok(result.fired.includes('underContract'));
  const saved = contracts.getDeal(sales.dealId);
  assert.equal(saved.alertFlags.underContract, true);

  const again = await contracts.fireDealTransitionAlerts(saved, saved);
  assert.equal(again.fired.includes('underContract'), false);
});

test('dealType cash vs subject_to normalizes and patches', () => {
  const cash = contracts.upsertDeal({
    address: '10 Cash Deal St',
    city: 'Tulsa',
    state: 'OK',
    stage: 'under_contract',
    dealType: 'cash'
  });
  assert.equal(cash.dealType, 'cash');
  assert.equal(contracts.enrichDealForDisplay(cash).dealTypeLabel, 'Cash deal');

  const sub = contracts.patchDeal(cash.dealId, { dealType: 'subto' });
  assert.equal(sub.dealType, 'subject_to');
  assert.equal(contracts.enrichDealForDisplay(sub).dealTypeLabel, 'Subject-to deal');

  const cleared = contracts.patchDeal(cash.dealId, { dealType: '' });
  assert.equal(cleared.dealType, '');
  assert.equal(contracts.normalizeDealType('Subject To'), 'subject_to');
  assert.equal(contracts.normalizeDealType('Cash Deal'), 'cash');
});

test('dealType badges infer cash vs subject_to when unset', () => {
  const unsetCash = contracts.upsertDeal({
    address: '11 Infer Cash Ave',
    city: 'Tulsa',
    state: 'OK',
    stage: 'under_contract'
  });
  assert.equal(unsetCash.dealType, '');
  assert.equal(contracts.resolveDealType(unsetCash), 'cash');
  assert.equal(contracts.enrichDealForDisplay(unsetCash).dealType, 'cash');

  const withSubtoDoc = {
    ...unsetCash,
    dealType: '',
    documents: [{
      kind: 'purchase_contract',
      label: 'subto',
      name: 'Subject-To Purchase Agreement.pdf'
    }]
  };
  assert.equal(contracts.resolveDealType(withSubtoDoc), 'subject_to');
  assert.equal(contracts.enrichDealForDisplay(withSubtoDoc).dealTypeLabel, 'Subject-to deal');
});

test('POST contract documents accepts large base64 body and stores file', async () => {
  const deal = contracts.upsertDeal({
    address: '77 Upload Docs Rd',
    city: 'Phoenix',
    state: 'AZ',
    stage: 'under_contract'
  });
  // ~3MB raw → ~4MB base64 JSON — previously rejected by 2MB readBody default
  const raw = Buffer.alloc(3 * 1024 * 1024, 0x25);
  const contentBase64 = raw.toString('base64');
  const res = mockRes();
  await api.handle(
    adminReq(`/api/leads/admin/contracts/${deal.dealId}/documents`, 'POST', {
      kind: 'purchase_contract',
      name: 'big-psa.pdf',
      mimeType: 'application/pdf',
      contentBase64,
      source: 'local'
    }),
    res,
    `/api/leads/admin/contracts/${deal.dealId}/documents`,
    new URL(`http://127.0.0.1/api/leads/admin/contracts/${deal.dealId}/documents`)
  );
  assert.equal(res.statusCode, 200, res.body);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.ok(body.document?.id);
  assert.ok(Array.isArray(body.deal?.documents));
  assert.ok(body.deal.documents.some((d) => d.name === 'big-psa.pdf'));
  const got = contracts.getDealDocument(deal.dealId, body.document.id);
  assert.ok(got?.document?.localFile);
  const full = contracts.resolveLocalDocumentPath(deal.dealId, got.document);
  assert.ok(full && fs.existsSync(full));
  assert.equal(fs.statSync(full).size, raw.length);
});

test('Send New PSA dialog CSS keeps an inner vertical scrollport when zoomed', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'css', 'under-contract.css'),
    'utf8'
  );
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'under-contract.html'),
    'utf8'
  );
  const psaBlock = css.match(/\.uc-dialog--psa\s*\{[^}]+\}/);
  assert.ok(psaBlock, 'expected .uc-dialog--psa rule');
  assert.match(psaBlock[0], /overflow:\s*hidden/);
  assert.match(psaBlock[0], /max-height:\s*min\(85dvh,\s*40rem\)/);
  assert.equal(
    /display\s*:\s*flex/.test(psaBlock[0]),
    false,
    'closed .uc-dialog--psa must not set display:flex'
  );
  assert.match(css, /\.uc-dialog--psa\[open\]|\.uc-dialog--psa:modal/);
  assert.match(css, /\.uc-dialog--psa\s+\.uc-edit-form\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.uc-dialog--psa\s+\.uc-edit-form\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.uc-psa-results\s*\{[^}]*max-height:\s*min\(12\.5rem,\s*40dvh\)/s);
  assert.match(html, /under-contract\.css\?v=138-team-alert-clear/);
  assert.match(html, /name="uc-psa-deal-type"[^>]*value="cash"/);
  assert.match(html, /name="uc-psa-deal-type"[^>]*value="subject_to"/);
  assert.match(html, /under-contract\.js\?v=138-team-alert-clear/);
  assert.match(html, /team-alert-banner\.js\?v=2-clear-on-open/);
  // Seller phone/email live in the main Edit dialog (not a separate Edit contact control)
  assert.match(html, /id="uc-edit-phone"/);
  assert.match(html, /id="uc-edit-email"/);
  assert.equal(/uc-seller-contact-edit/.test(html), false);
});
