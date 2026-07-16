#!/usr/bin/env node
/**
 * Fill land parcel fields from RealEstateAPI PropertyDetail (local catalog).
 * Fill-blanks only — does not wipe operator-entered parcel data.
 *
 * Usage:
 *   node scripts/enrich-land-from-reapi.js
 *   node scripts/enrich-land-from-reapi.js --limit=25 --dry-run
 *   node scripts/enrich-land-from-reapi.js --force --lead=02c9c9ffb715bad3
 */
'use strict';

const path = require('path');

// Load .env if present (same pattern as server)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const config = require('../lib/config');
const { createReapiClient } = require('../lib/leads-platform/comping/reapi-client');
const {
  enrichLandLeadFromReapi,
  enrichLandLeadsFromReapi
} = require('../lib/leads-platform/land/enrich-from-reapi');
const {
  getLead,
  readIndex,
  upsertLead,
  upsertLeadsBatch
} = require('../lib/leads-platform/store');
const { normalizeLeadRecord, validateLeadRecord } = require('../lib/leads-platform/schema');
const { computePriorityScore } = require('../lib/leads-platform/scoring');
const { extractParcelFields } = require('../lib/leads-platform/land/parcel');

function parseArgs(argv) {
  const out = {
    dryRun: false,
    force: false,
    limit: 0,
    offset: 0,
    concurrency: 2,
    delayMs: 150,
    leadId: ''
  };
  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryRun') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a.startsWith('--limit=')) out.limit = Math.max(0, Number(a.slice(8)) || 0);
    else if (a.startsWith('--offset=')) out.offset = Math.max(0, Number(a.slice(9)) || 0);
    else if (a.startsWith('--concurrency=')) out.concurrency = Math.max(1, Number(a.slice(14)) || 2);
    else if (a.startsWith('--delay=')) out.delayMs = Math.max(0, Number(a.slice(8)) || 0);
    else if (a.startsWith('--lead=')) out.leadId = a.slice(7).trim();
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = config.REALESTATE_API_KEY;
  if (!apiKey) {
    console.error('REALESTATE_API_KEY is not set in .env — cannot call REAPI locally.');
    console.error('Ship the admin endpoint and run: node scripts/push-land-reapi-enrich-to-prod.js');
    process.exit(1);
  }

  const reapi = createReapiClient({
    apiKey,
    baseUrl: config.REALESTATE_API_BASE
  });

  if (opts.leadId) {
    const lead = getLead(opts.leadId);
    if (!lead || lead.leadType !== 'land') {
      console.error('Land lead not found:', opts.leadId);
      process.exit(1);
    }
    const out = await enrichLandLeadFromReapi(lead, reapi, { force: opts.force });
    console.log(JSON.stringify({
      leadId: opts.leadId,
      ok: out.ok,
      skipped: out.skipped,
      filled: out.filled,
      coordsFilled: out.coordsFilled,
      error: out.error,
      parcelBefore: extractParcelFields(lead),
      parcelAfter: out.lead ? extractParcelFields(out.lead) : null
    }, null, 2));
    if (out.ok && !out.skipped && !opts.dryRun && ((out.filled || []).length || (out.coordsFilled || []).length)) {
      const saved = upsertLead(out.lead);
      console.log('saved', saved.leadId);
    }
    return;
  }

  let ids = readIndex()
    .filter((e) => e.leadType === 'land' && (e.catalogStatus || 'active') === 'active')
    .map((e) => e.leadId);
  const total = ids.length;
  if (opts.offset) ids = ids.slice(opts.offset);
  if (opts.limit > 0) ids = ids.slice(0, opts.limit);

  const leads = ids.map((id) => getLead(id)).filter(Boolean);
  console.log(`Enriching ${leads.length} of ${total} land leads (dryRun=${opts.dryRun})…`);

  const { results, summary } = await enrichLandLeadsFromReapi(leads, reapi, {
    force: opts.force,
    concurrency: opts.concurrency,
    delayMs: opts.delayMs
  });

  const toUpsert = [];
  if (!opts.dryRun) {
    for (const r of results) {
      if (!r.ok || r.skipped) continue;
      if (!(r.filled || []).length && !(r.coordsFilled || []).length) continue;
      const lead = normalizeLeadRecord(r.lead);
      lead.priorityScore = computePriorityScore(lead);
      const check = validateLeadRecord(lead);
      if (!check.ok) continue;
      toUpsert.push(lead);
    }
  }
  const batch = opts.dryRun ? { published: 0 } : upsertLeadsBatch(toUpsert);

  console.log(JSON.stringify({
    ok: true,
    dryRun: opts.dryRun,
    totalLand: total,
    processed: leads.length,
    summary,
    updated: batch.published || 0,
    sample: results.filter((r) => r.ok && (r.filled || []).length).slice(0, 5).map((r) => ({
      leadId: r.leadId,
      address: r.address,
      filled: r.filled,
      coordsFilled: r.coordsFilled
    })),
    errors: results.filter((r) => !r.ok).slice(0, 10).map((r) => ({
      leadId: r.leadId,
      error: r.error,
      code: r.code
    }))
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
