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
