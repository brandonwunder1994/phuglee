#!/usr/bin/env node
/**
 * Repair Vault lead imagery URLs that point at deleted analyzer cache files.
 * Dead /analyzer/api/cached-imagery/... paths become live /analyzer/api/sv-image proxies
 * (or a working cache hit if one still exists for that address).
 *
 * Does NOT wipe catalog leads — only updates streetViewUrl / photos / satelliteUrl / index thumbs.
 *
 * Usage: node scripts/repair-vault-imagery.js [--dry-run]
 */
const {
  parseCachedImageryUrl,
  cachedImageryFileExists,
  ensureUsableStreetViewUrl,
  vaultImageryUrl
} = require('../lib/leads-platform/imagery-resolve');
const {
  readIndex,
  writeIndex,
  indexEntryFromLead,
  getLead,
  writeLeadIfChanged,
  invalidateIndexCache
} = require('../lib/leads-platform/store');

const dryRun = process.argv.includes('--dry-run');

function needsRepair(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (!parseCachedImageryUrl(u)) return false;
  return !cachedImageryFileExists(u);
}

function repairLead(lead) {
  if (!lead) return { changed: false, lead };
  const before = lead.streetViewUrl || '';
  const satBefore = lead.satelliteUrl || '';

  const nextSv = ensureUsableStreetViewUrl(before, lead, lead.viewMeta);
  let nextSat = vaultImageryUrl(satBefore);
  if (nextSat && parseCachedImageryUrl(nextSat) && !cachedImageryFileExists(nextSat)) {
    nextSat = '';
  }

  const photos = [];
  if (nextSv) photos.push(nextSv);
  if (nextSat && nextSat !== nextSv) photos.push(nextSat);

  const changed = nextSv !== before || nextSat !== satBefore
    || JSON.stringify(photos) !== JSON.stringify(lead.photos || []);

  if (!changed) return { changed: false, lead };

  return {
    changed: true,
    lead: {
      ...lead,
      streetViewUrl: nextSv,
      satelliteUrl: nextSat,
      photos
    },
    from: before,
    to: nextSv
  };
}

function main() {
  const index = readIndex();
  let scanned = 0;
  let repaired = 0;
  let missingLive = 0;
  const nextIndex = [];

  for (const entry of index) {
    scanned += 1;
    const lead = getLead(entry.leadId);
    if (!lead) {
      nextIndex.push(entry);
      continue;
    }

    const hadDead = needsRepair(lead.streetViewUrl)
      || (Array.isArray(lead.photos) && lead.photos.some(needsRepair));

    const result = repairLead(lead);
    if (result.changed) {
      repaired += 1;
      if (!result.to) missingLive += 1;
      if (!dryRun) writeLeadIfChanged(result.lead);
      nextIndex.push(indexEntryFromLead(result.lead));
      if (repaired <= 8 || repaired % 500 === 0) {
        console.log(`[repair] ${lead.leadId} ${hadDead ? 'dead-cache' : 'normalize'} → ${(result.to || '').slice(0, 90)}`);
      }
    } else {
      nextIndex.push(indexEntryFromLead(lead));
    }
  }

  if (!dryRun) {
    writeIndex(nextIndex);
    invalidateIndexCache();
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    scanned,
    repaired,
    missingLive,
    message: dryRun
      ? 'Dry run — no files written'
      : 'Catalog + index updated; hard-refresh Vault'
  }, null, 2));
}

main();
