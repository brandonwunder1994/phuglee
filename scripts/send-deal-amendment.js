'use strict';

/**
 * One-shot: send a seller amendment for a contract deal via SignNow.
 *
 * Usage:
 *   node scripts/send-deal-amendment.js <dealId> "terms..."
 *   node scripts/send-deal-amendment.js --address "103 Laurel" "The purchase price is to be changed to $32,130.90"
 *
 * Loads .env when present. On Railway, run via:
 *   railway ssh -- node scripts/send-deal-amendment.js ...
 */

require('dotenv').config();

const path = require('path');

function usage() {
  console.error('Usage: node scripts/send-deal-amendment.js <dealId> "terms"');
  console.error('   or: node scripts/send-deal-amendment.js --address "103 Laurel" "terms"');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) usage();

  let dealId = '';
  let terms = '';
  let addressHint = '';

  if (args[0] === '--address') {
    addressHint = String(args[1] || '').trim();
    terms = args.slice(2).join(' ').trim();
    if (!addressHint || !terms) usage();
  } else {
    dealId = String(args[0] || '').trim();
    terms = args.slice(1).join(' ').trim();
    if (!dealId || !terms) usage();
  }

  // Prefer production volume when present on Railway container.
  if (!process.env.PDA_DATA_ROOT && process.env.RAILWAY_ENVIRONMENT) {
    process.env.PDA_DATA_ROOT = '/app/pda-data';
  }

  const contracts = require(path.join(__dirname, '..', 'lib', 'leads-platform', 'contracts'));
  const { isSignNowConfigured } = require(path.join(__dirname, '..', 'lib', 'leads-platform', 'signnow-client'));

  if (!isSignNowConfigured()) {
    console.error('SignNow not configured (SIGNNOW_ACCESS_TOKEN missing)');
    process.exit(2);
  }

  if (!dealId && addressHint) {
    const list = contracts.listDeals();
    const needle = addressHint.toLowerCase();
    const matches = list.filter((d) => {
      const line = `${d.address || ''} ${d.city || ''} ${d.ownerName || ''}`.toLowerCase();
      return line.includes(needle);
    });
    if (matches.length === 1) {
      dealId = matches[0].dealId;
    } else if (matches.length > 1) {
      console.error('Multiple deals match address hint:');
      matches.forEach((d) => console.error(`  ${d.dealId}  ${d.address}  ${d.ownerName || ''}`));
      process.exit(3);
    } else {
      console.error('No deal matched address hint:', addressHint);
      process.exit(3);
    }
  }

  const deal = contracts.getDeal(dealId);
  if (!deal) {
    console.error('Deal not found:', dealId);
    process.exit(3);
  }

  console.log('Sending amendment for', deal.dealId, deal.address, deal.ownerName || '');
  console.log('Terms:', terms);

  const sellers = [];
  const name = String(deal.ownerName || deal.sellerNames || '').trim();
  const email = String(deal.ownerEmail || deal.email || '').trim().toLowerCase();
  if (name && email) sellers.push({ name, email });
  if (Array.isArray(deal.contractSellers)) {
    for (const s of deal.contractSellers) {
      const n = String(s?.name || '').trim();
      const e = String(s?.email || '').trim().toLowerCase();
      if (n && e && !sellers.some((x) => x.email === e)) sellers.push({ name: n, email: e });
    }
  }

  const out = await contracts.requestAmendmentSend(dealId, {
    partyType: 'seller',
    amendmentTerms: terms,
    sellerCount: sellers.length || 1,
    sellers,
    sellerName: sellers[0]?.name,
    sellerEmail: sellers[0]?.email
  }, 'admin-script');

  console.log('OK', {
    status: out.amendment?.status,
    documentId: out.amendment?.documentId,
    message: out.amendment?.message
  });
}

main().catch((err) => {
  console.error('FAIL', err.code || '', err.message);
  process.exit(1);
});
