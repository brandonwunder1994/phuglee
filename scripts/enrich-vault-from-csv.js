#!/usr/bin/env node
/**
 * Enrich existing Vault leads from PropStream CSVs (match by address/city/state).
 * Only updates leads already in the catalog — does not create new leads.
 *
 * Usage:
 *   node scripts/enrich-vault-from-csv.js "C:/path/a.csv" "C:/path/b.csv"
 */
const fs = require('fs');
const {
  loadEnrichmentsFromFiles,
  mergeEnrichmentIntoLead,
  matchKey
} = require('../lib/leads-platform/csv-enrich');
const {
  getLead,
  readIndex,
  upsertLeadsBatch
} = require('../lib/leads-platform/store');
const { normalizeLeadRecord, validateLeadRecord } = require('../lib/leads-platform/schema');
const { computePriorityScore } = require('../lib/leads-platform/scoring');

function main() {
  const paths = process.argv.slice(2).filter((p) => p && !p.startsWith('-'));
  if (!paths.length) {
    console.error('Usage: node scripts/enrich-vault-from-csv.js <csv1> [csv2...]');
    process.exit(1);
  }
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error('File not found:', p);
      process.exit(1);
    }
  }

  const { enrichments, stats: loadStats } = loadEnrichmentsFromFiles(paths);
  const index = readIndex();

  const indexByKey = new Map();
  for (const entry of index) {
    indexByKey.set(matchKey(entry), entry.leadId);
  }

  let matched = 0;
  let errors = 0;
  const toUpsert = [];

  for (const enrichment of enrichments) {
    const leadId = indexByKey.get(enrichment.matchKey);
    if (!leadId) continue;
    matched += 1;

    const existing = getLead(leadId);
    if (!existing) continue;

    try {
      const merged = mergeEnrichmentIntoLead(existing, enrichment);
      const lead = normalizeLeadRecord(merged);
      lead.propertyDetails = merged.propertyDetails || {};
      lead.financialDetails = merged.financialDetails || {};
      lead.enrichedAt = merged.enrichedAt;
      lead.enrichmentSource = merged.enrichmentSource;
      lead.priorityScore = computePriorityScore(lead);

      const check = validateLeadRecord(lead);
      if (!check.ok) {
        errors += 1;
        continue;
      }
      toUpsert.push(lead);
    } catch (_) {
      errors += 1;
    }
  }

  const batch = upsertLeadsBatch(toUpsert);

  const result = {
    ok: true,
    files: loadStats.files,
    csvRows: loadStats.rows,
    enrichments: enrichments.length,
    vaultLeads: index.length,
    matched,
    updated: batch.published || 0,
    unchanged: batch.unchanged || 0,
    unmatchedCsv: enrichments.length - matched,
    errors
  };
  console.log(JSON.stringify(result, null, 2));
}

main();
