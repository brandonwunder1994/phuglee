#!/usr/bin/env node
/**
 * Ensure every human-reviewed Analyzer lead is in The Vault (prod or local).
 * 1) Force POST /api/leads/sync
 * 2) Page analyzer session results + vault catalog
 * 3) Publish any remaining eligible gaps via /api/leads/publish-from-analyzer
 *
 * Usage:
 *   node scripts/audit-and-publish-reviewed-to-vault.js
 *   node scripts/audit-and-publish-reviewed-to-vault.js --base https://phuglee-production.up.railway.app
 *   node scripts/audit-and-publish-reviewed-to-vault.js --dry-run
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  shouldPublishAnalyzerResult,
  mapAnalyzerResultToVaultLead,
  vaultLeadTypeFromResult,
  isManuallyReviewedForVault
} = require('../lib/leads-platform/analyzer-sync');
const { isManuallyEditedResult } = require('../modules/property-analyzer/lib/backup-logic');
const { normalizeLeadRecord } = require('../lib/leads-platform/schema');
const { computeNeedsReview, resultCategory } = require('../modules/property-analyzer/lib/result-classify');

const SOFT = new Set(['review_session', 'review_skip', 'review_missing']);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const BASE = String(arg('--base', process.env.SHELL_BASE || 'https://phuglee-production.up.railway.app')).replace(/\/$/, '');
const DRY = process.argv.includes('--dry-run');
const USER = process.env.PHUGLEE_USER || 'admin';
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';

function isHumanReviewed(r) {
  if (!r) return false;
  const via = String(r.manuallyReviewedVia || '');
  if (SOFT.has(via)) return false;
  if (r.needsReviewLater) return false;
  // Real Keep/Change/manual edits — not soft queue stamps.
  if (isManuallyEditedResult(r)) return true;
  if (r.manuallyReviewed && via) return true;
  if (r.reviewResolved) return true;
  return false;
}

function leadIdForResult(r) {
  const raw = mapAnalyzerResultToVaultLead(r, { storageKey: 'admin' });
  if (!raw) return null;
  return normalizeLeadRecord(raw).leadId;
}

async function main() {
  if (!PASS) throw new Error('Missing PHUGLEE_PASS / PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD');

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS, plan: 'max' })
  });
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const login = await loginRes.json().catch(() => ({}));
  const cookie = (typeof loginRes.headers.getSetCookie === 'function'
    ? loginRes.headers.getSetCookie()
    : [])
    .map((c) => String(c).split(';')[0])
    .join('; ');

  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie,
    'X-Phuglee-User': USER,
    'X-Phuglee-Plan': 'max'
  };
  if (login.token) {
    headers.Authorization = `Bearer ${login.token}`;
    headers['X-PDA-Token'] = login.token;
  }

  const syncRes = await fetch(`${BASE}/api/leads/sync`, { method: 'POST', headers });
  const syncBody = await syncRes.json().catch(() => ({}));
  if (!syncRes.ok) throw new Error(`sync failed ${syncRes.status}: ${JSON.stringify(syncBody)}`);

  // Collect vault leadIds (page through catalog).
  const vaultIds = new Set();
  let page = 1;
  let vaultTotal = 0;
  for (;;) {
    const res = await fetch(`${BASE}/api/leads?page=${page}&limit=200&includeHidden=1`, { headers });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(`vault list failed ${res.status}`);
    vaultTotal = Number(body.total) || vaultTotal;
    const leads = body.leads || [];
    for (const row of leads) {
      if (row?.leadId) vaultIds.add(row.leadId);
    }
    if (!leads.length || page * 200 >= vaultTotal) break;
    page += 1;
    if (page > 200) break;
  }

  // Page analyzer session results.
  const human = [];
  let offset = 0;
  let sessionTotal = 0;
  for (;;) {
    const res = await fetch(
      `${BASE}/analyzer/api/session-results?offset=${offset}&limit=500`,
      { headers, cache: 'no-store' }
    );
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(`session-results failed ${res.status}`);
    sessionTotal = Number(body.total) || sessionTotal;
    const rows = body.results || [];
    for (const r of rows) {
      if (isHumanReviewed(r)) human.push(r);
    }
    if (!body.hasMore || !rows.length) break;
    offset += rows.length;
  }

  const byReason = {
    eligibleInVault: 0,
    eligibleMissing: 0,
    needsReview: 0,
    noAddress: 0,
    blurred: 0,
    noTier: 0,
    otherIneligible: 0
  };
  const missing = [];
  const seenIds = new Set();

  for (const r of human) {
    if (!shouldPublishAnalyzerResult(r)) {
      if (computeNeedsReview(r)) byReason.needsReview += 1;
      else if (String(r.street || r.address || '').trim().length < 4) byReason.noAddress += 1;
      else {
        const cat = resultCategory(r);
        if (cat === 'blurred' || cat === 'unavailable') byReason.blurred += 1;
        else if (!vaultLeadTypeFromResult(r)) byReason.noTier += 1;
        else byReason.otherIneligible += 1;
      }
      continue;
    }
    let leadId;
    try {
      leadId = leadIdForResult(r);
    } catch (_) {
      byReason.otherIneligible += 1;
      continue;
    }
    if (!leadId || seenIds.has(leadId)) continue;
    seenIds.add(leadId);
    if (vaultIds.has(leadId)) {
      byReason.eligibleInVault += 1;
    } else {
      byReason.eligibleMissing += 1;
      missing.push(r);
    }
  }

  let published = 0;
  let publishErrors = 0;
  const publishErrorSamples = [];
  if (!DRY) {
    for (const r of missing) {
      const res = await fetch(`${BASE}/api/leads/publish-from-analyzer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ result: r, storageKey: USER })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.published) {
        published += 1;
      } else {
        publishErrors += 1;
        if (publishErrorSamples.length < 15) {
          publishErrorSamples.push({
            address: r.street || r.address,
            status: res.status,
            error: body.error || body.reason || 'failed'
          });
        }
      }
    }
  }

  // Re-check vault total after publish.
  const metaRes = await fetch(`${BASE}/api/leads/meta`, { headers });
  const meta = await metaRes.json().catch(() => ({}));

  const report = {
    ok: byReason.eligibleMissing === 0 || (!DRY && published === missing.length && publishErrors === 0),
    base: BASE,
    dryRun: DRY,
    sync: {
      published: syncBody.sync?.published,
      eligible: syncBody.sync?.eligible,
      scanned: syncBody.sync?.scanned,
      errors: (syncBody.sync?.errors || []).length
    },
    sessionTotal,
    humanReviewed: human.length,
    vaultIdsCollected: vaultIds.size,
    vaultMetaTotal: meta.meta?.total ?? meta.total ?? null,
    vaultByType: meta.meta?.byType ?? meta.byType ?? null,
    gap: byReason,
    missingSample: missing.slice(0, 12).map((r) => ({
      address: r.street || r.address,
      tier: r.leadTier,
      via: r.manuallyReviewedVia,
      category: r.category
    })),
    publish: { attempted: missing.length, published, publishErrors, publishErrorSamples },
    note: 'Ineligible rows (Needs Review / blurred / no address / no tier) are intentionally not Vault leads.'
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && byReason.eligibleMissing > 0 && (DRY || publishErrors > 0)) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
