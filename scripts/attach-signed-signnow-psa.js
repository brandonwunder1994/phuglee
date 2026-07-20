'use strict';

/**
 * Attach a signed SignNow PSA PDF to a Contract Tracker deal and fill PSA metadata.
 *
 * Usage:
 *   node scripts/attach-signed-signnow-psa.js \
 *     --dealId=ghl_Ss46BbxuXNNg0h5OV8KG \
 *     --documentId=97d9c3de531f4be284594c7f42fdca3923563a02 \
 *     --dealType=subject_to \
 *     --signedDate=7/20/2026 \
 *     --purchasePrice=253009.09 \
 *     --emdDeposit=100 \
 *     --sellerName="Joseph Jewell" \
 *     --sellerEmail=jjewell1989@gmail.com \
 *     --apn=2404190007008000 \
 *     --legal="Lot 41, Twin Lakes 3rd Addition"
 */

require('dotenv').config();

const contracts = require('../lib/leads-platform/contracts');

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

async function main() {
  const dealId = arg('dealId');
  const documentId = arg('documentId');
  if (!dealId || !documentId) {
    console.error('Required: --dealId=... --documentId=...');
    process.exit(1);
  }

  const out = await contracts.attachSignedSignNowPsa(dealId, {
    documentId,
    dealType: arg('dealType', 'subject_to'),
    signedDate: arg('signedDate'),
    purchasePrice: arg('purchasePrice') === '' ? undefined : Number(arg('purchasePrice')),
    emdDeposit: arg('emdDeposit') === '' ? undefined : Number(arg('emdDeposit')),
    sellerName: arg('sellerName'),
    sellerEmail: arg('sellerEmail'),
    apn: arg('apn'),
    legalDescription: arg('legal')
  });

  console.log(JSON.stringify({
    ok: true,
    dealId: out.deal.dealId,
    address: out.deal.address,
    dealType: out.deal.dealType,
    originalAgreementDate: out.deal.originalAgreementDate,
    purchasePrice: out.deal.purchasePrice,
    emdDeposit: out.deal.emdDeposit,
    documentId: out.document?.id,
    documentName: out.document?.name,
    signNowDocumentId: out.document?.signNowDocumentId
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
