#!/usr/bin/env node
'use strict';

/**
 * Tag all Phuglee vault leads in GHL with: phuglee, code violation, class:*, vault:active
 *
 *   node scripts/backfill-phuglee-ghl-tags.js --live
 *   node scripts/backfill-phuglee-ghl-tags.js --live --limit 50
 *
 * Resume-safe: data/campaigns/sms/backfill-checkpoint.json
 */

require('../lib/load-env').loadEnvFile();

const fs = require('fs');
const path = require('path');
const ghl = require('../lib/leads-platform/ghl-client');
const { PHUGLEE_TAG, SOURCE_TAG, classTagForLeadType } = require('../lib/campaigns/sms-policy');
const { setContactMap } = require('../lib/campaigns/sms-store');
const { writeBackfillProgress } = require('../lib/campaigns/sms-backfill-progress');

const ROOT = path.join(__dirname, '..');
// Same catalog the Vault UI uses (PDA_DATA_ROOT / LEADS_CATALOG_ROOT on Railway)
const { LEADS_CATALOG_ROOT } = require('../lib/config');
const INDEX = path.join(LEADS_CATALOG_ROOT, 'index.json');
const CHECKPOINT = path.join(ROOT, 'data', 'campaigns', 'sms', 'backfill-checkpoint.json');

const DELAY_MS = 400;
const TAG_DELAY_MS = 350;
const BULK_SIZE = 25;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const args = { live: false, dryRun: true, limit: null, resume: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') {
      args.live = true;
      args.dryRun = false;
    } else if (a === '--dry-run') {
      args.dryRun = true;
      args.live = false;
    } else if (a === '--limit') {
      args.limit = Math.max(1, Number(argv[++i]) || 1);
    } else if (a === '--no-resume') {
      args.resume = false;
    }
  }
  return args;
}

function loadCheckpoint() {
  try {
    if (!fs.existsSync(CHECKPOINT)) return { done: {}, stats: {} };
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  } catch (_) {
    return { done: {}, stats: {} };
  }
}

function saveCheckpoint(cp) {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2), 'utf8');
}

function phone10(p) {
  const d = ghl.digitsOnly(p);
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  if (d.length > 10) return d.slice(-10);
  return d;
}

function leadPhones(row) {
  const out = [];
  for (const p of row.phones || []) {
    const d = phone10(p);
    if (d.length === 10) out.push(d);
  }
  if (row.firstPhone) {
    const d = phone10(row.firstPhone);
    if (d.length === 10) out.push(d);
  }
  return [...new Set(out)];
}

async function findContactId(row) {
  const phones = leadPhones(row);
  for (const p of phones) {
    let list = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        list = await ghl.searchContacts(p, { limit: 10 });
        break;
      } catch (err) {
        if (/429|Too Many/i.test(err.message || '')) {
          await sleep(Math.min(30000, 1500 * (2 ** attempt)));
          continue;
        }
        throw err;
      }
    }
    const match = (list || []).find((c) => {
      const cd = phone10(c.phone || c.phoneNumber || '');
      return cd === p || (cd && (cd.endsWith(p) || p.endsWith(cd.slice(-10))));
    });
    if (match && (match.id || match.contactId)) {
      return String(match.id || match.contactId);
    }
  }
  const email = String(row.email || '').trim().toLowerCase();
  if (email.includes('@')) {
    let list = [];
    try {
      list = await ghl.searchContacts(email, { limit: 5 });
    } catch (_) {
      list = [];
    }
    const match = (list || []).find(
      (c) => String(c.email || '').toLowerCase() === email
    );
    if (match && (match.id || match.contactId)) {
      return String(match.id || match.contactId);
    }
  }
  return null;
}

async function addTagsWithRetry(contactId, tags) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await ghl.addContactTags(contactId, tags);
      return true;
    } catch (err) {
      if (/429|Too Many/i.test(err.message || '')) {
        const wait = Math.min(45000, 2000 * (2 ** attempt));
        process.stderr.write(`  429 tag wait ${wait}ms\n`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ghl.isConfigured()) {
    throw new Error('GHL_API_KEY and GHL_LOCATION_ID required');
  }
  if (!fs.existsSync(INDEX)) {
    throw new Error(`Missing vault index: ${INDEX}`);
  }

  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  let leads = index.leads || [];
  if (args.limit) leads = leads.slice(0, args.limit);

  const cp = args.resume ? loadCheckpoint() : { done: {}, stats: {} };
  cp.done = cp.done || {};
  const stats = {
    total: leads.length,
    already: 0,
    found: 0,
    missing: 0,
    tagged: 0,
    failed: 0,
    dryRun: args.dryRun,
    startedAt: new Date().toISOString()
  };

  process.stderr.write(
    `Backfill phuglee tags mode=${args.dryRun ? 'DRY-RUN' : 'LIVE'} leads=${leads.length} resume=${!!args.resume}\n`
  );

  function flushProgressUi() {
    const processed = Object.keys(cp.done || {}).length;
    let tagged = 0;
    let skipped = 0;
    for (const id of Object.keys(cp.done || {})) {
      const row = cp.done[id] || {};
      if (row.contactId && !row.skipped) tagged += 1;
      else if (row.skipped) skipped += 1;
    }
    const pct = leads.length ? Math.round((1000 * processed) / leads.length) / 10 : 0;
    try {
      writeBackfillProgress({
        total: leads.length,
        processed,
        tagged,
        skipped,
        already: stats.already,
        found: stats.found,
        failed: stats.failed,
        percent: pct,
        complete: processed >= leads.length,
        mode: args.dryRun ? 'dry-run' : 'live'
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  flushProgressUi();

  let i = 0;
  for (const row of leads) {
    i += 1;
    const leadId = row.leadId;
    if (!leadId) continue;
    if (cp.done[leadId] && cp.done[leadId].contactId && !cp.done[leadId].skipped) {
      stats.already += 1;
      continue;
    }
    // Re-try not_in_ghl? skip for speed unless --no-resume
    if (cp.done[leadId] && cp.done[leadId].skipped) {
      stats.already += 1;
      continue;
    }

    const phones = leadPhones(row);
    const email = String(row.email || '').trim();
    if (!phones.length && !email.includes('@')) {
      stats.missing += 1;
      cp.done[leadId] = { skipped: 'no_phone_email', at: new Date().toISOString() };
      if (i % 100 === 0) saveCheckpoint(cp);
      continue;
    }

    try {
      const contactId = await findContactId(row);
      await sleep(DELAY_MS);
      if (!contactId) {
        stats.missing += 1;
        cp.done[leadId] = { skipped: 'not_in_ghl', at: new Date().toISOString() };
        if (i % 50 === 0) {
          process.stderr.write(
            `  progress ${i}/${leads.length} found=${stats.found} missing=${stats.missing} tagged=${stats.tagged}\n`
          );
          saveCheckpoint(cp);
        }
        continue;
      }
      stats.found += 1;
      const classTag = classTagForLeadType(row.leadType);
      const tags = [PHUGLEE_TAG, SOURCE_TAG, 'src:phuglee', 'vault:active', classTag].filter(Boolean);

      if (args.dryRun) {
        stats.tagged += 1;
        cp.done[leadId] = { contactId, dryRun: true, at: new Date().toISOString() };
      } else {
        const ok = await addTagsWithRetry(contactId, tags);
        if (!ok) {
          stats.failed += 1;
          continue;
        }
        stats.tagged += 1;
        setContactMap(leadId, contactId);
        cp.done[leadId] = { contactId, at: new Date().toISOString() };
        await sleep(TAG_DELAY_MS);
      }
    } catch (err) {
      stats.failed += 1;
      process.stderr.write(`  lead ${leadId} err: ${err.message}\n`);
      if (/429/.test(err.message || '')) await sleep(10000);
    }

    if (i % 50 === 0) {
      process.stderr.write(
        `  progress ${i}/${leads.length} found=${stats.found} missing=${stats.missing} tagged=${stats.tagged} already=${stats.already}\n`
      );
      saveCheckpoint(cp);
      flushProgressUi();
    }
  }

  stats.finishedAt = new Date().toISOString();
  cp.stats = stats;
  saveCheckpoint(cp);
  flushProgressUi();
  console.log(JSON.stringify(stats, null, 2));
  process.stderr.write(`Checkpoint: ${CHECKPOINT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
