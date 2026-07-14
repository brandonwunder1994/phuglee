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
  assert.equal(sync.mapGhlStageName('✅ Seller Signed | ➡️ Send To Title'), 'under_contract');
  assert.equal(sync.mapGhlStageName('🔎 Escrow Opened + Looking for Buyers'), 'under_contract');
  assert.equal(sync.mapGhlStageName('📮 AOC Sent to Cash Buyer'), 'buyer_found');
  assert.equal(sync.mapGhlStageName('✅ AOC Signed | ➡️ Send to Title'), 'buyer_found');
  assert.equal(sync.mapGhlStageName('🏁 In Line to Close'), 'closing');
  assert.equal(sync.mapGhlStageName('🥳 Funded'), 'funded');
  assert.equal(sync.mapGhlStageName('Interested'), null);
});

test('computeDealProfit uses assignment fee then override', () => {
  assert.equal(schema.computeDealProfit({ assignmentFee: 15000 }), 15000);
  assert.equal(schema.computeDealProfit({ assignmentFee: 15000, profitOverride: 12000 }), 12000);
  assert.equal(schema.computeDealProfit({}), null);
});

test('catalogStatusForDealStage hides and sold-maps funded', () => {
  assert.equal(schema.catalogStatusForDealStage('under_contract'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('buyer_found'), 'under_contract');
  assert.equal(schema.catalogStatusForDealStage('funded'), 'sold');
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

test('computeDealPayouts deducts TC then photo cost before split', () => {
  const { computeDealPayouts } = require('../lib/leads-platform/payout-settings');
  const settings = { tcFee: 500, acqPercent: 50, dispoPercent: 50 };
  const out = computeDealPayouts(10000, 1500, settings);
  assert.equal(out.tcPay, 500);
  assert.equal(out.photoCost, 1500);
  assert.equal(out.netAfterCosts, 8000);
  assert.equal(out.acqPay, 4000);
  assert.equal(out.dispoPay, 4000);
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
