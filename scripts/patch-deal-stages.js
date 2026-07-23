#!/usr/bin/env node
'use strict';

/**
 * One-shot: set deal stages by dealId on the active contracts catalog.
 * Usage:
 *   node scripts/patch-deal-stages.js --stage buyer_signed_aoc id1 id2 ...
 *   node scripts/patch-deal-stages.js --stage buyer_signed_aoc --from-json path.json
 *
 * JSON format: [{ "dealId": "ghl_…", "stage": "buyer_signed_aoc" }, ...]
 */

const fs = require('fs');
const path = require('path');

try {
  require('../lib/load-env').loadEnvFile();
} catch (_) {
  /* optional */
}

const { LEADS_CATALOG_ROOT } = require('../lib/config');

function parseArgs(argv) {
  const out = { stage: null, ids: [], fromJson: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stage') out.stage = argv[++i];
    else if (a === '--from-json') out.fromJson = argv[++i];
    else if (!a.startsWith('-')) out.ids.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let patches = [];
  if (args.fromJson) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.fromJson), 'utf8'));
    patches = (Array.isArray(raw) ? raw : []).map((row) => ({
      dealId: String(row.dealId || '').trim(),
      stage: String(row.stage || args.stage || '').trim()
    }));
  } else {
    if (!args.stage) throw new Error('--stage required');
    patches = args.ids.map((id) => ({ dealId: id, stage: args.stage }));
  }
  patches = patches.filter((p) => p.dealId && p.stage);
  if (!patches.length) throw new Error('No deal patches');

  const root = path.join(LEADS_CATALOG_ROOT, 'contracts');
  const indexPath = path.join(root, 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing contracts index: ${indexPath}`);
  }
  let index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const isArray = Array.isArray(index);
  const list = isArray ? index : (index.deals || index.items || []);
  if (!Array.isArray(list)) throw new Error('Unexpected index shape');

  const results = [];
  for (const p of patches) {
    const dealPath = path.join(root, `${p.dealId}.json`);
    if (!fs.existsSync(dealPath)) {
      results.push({ dealId: p.dealId, ok: false, error: 'deal file missing' });
      continue;
    }
    const deal = JSON.parse(fs.readFileSync(dealPath, 'utf8'));
    const before = deal.stage;
    deal.stage = p.stage;
    deal.updatedAt = new Date().toISOString();
    fs.writeFileSync(dealPath, JSON.stringify(deal, null, 2), 'utf8');

    const entry = list.find((e) => e && e.dealId === p.dealId);
    if (entry) {
      entry.stage = p.stage;
      if (entry.updatedAt != null) entry.updatedAt = deal.updatedAt;
    }
    results.push({
      dealId: p.dealId,
      ok: true,
      before,
      after: p.stage,
      address: deal.address || entry?.address || ''
    });
  }

  if (isArray) {
    fs.writeFileSync(indexPath, JSON.stringify(list, null, 2), 'utf8');
  } else if (Array.isArray(index.deals)) {
    index.deals = list;
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
  } else {
    fs.writeFileSync(indexPath, JSON.stringify(list, null, 2), 'utf8');
  }

  console.log(JSON.stringify({ root, updated: results.filter((r) => r.ok).length, results }, null, 2));
}

main();
