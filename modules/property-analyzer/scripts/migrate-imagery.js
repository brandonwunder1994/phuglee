#!/usr/bin/env node
/**
 * One-time migration: fetch Street View + satellite for all session properties,
 * save permanently to property_imagery/, update session with cached URLs.
 *
 * Usage:
 *   node scripts/migrate-imagery.js
 *   node scripts/migrate-imagery.js --dry-run
 *   node scripts/migrate-imagery.js --session distressAnalyzerSession_LATEST.json
 *   node scripts/migrate-imagery.js --limit 50
 *
 * Requires: server maps key in maps-api-key.txt or MAPS_API_KEY env var.
 * Google is called ONCE per property — never again after this script succeeds.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const imageryCache = require(path.join(ROOT, 'imagery-cache'));

const SESSION_FILE = process.env.SESSION_FILE
  || path.join(ROOT, 'distressAnalyzerSession_LATEST.json');
const PORT = Number(process.env.PORT) || 3456;
const DELAY_MS = Number(process.env.MIGRATE_DELAY_MS) || 350;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, limit: 0, session: SESSION_FILE };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
    else if (args[i] === '--session' && args[i + 1]) opts.session = path.resolve(args[++i]);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function recordKey(r) {
  return `${r.email || ''}|${r.phone || ''}|${r.address || ''}`;
}

function postJson(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function loadSession(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function needsMigration(result) {
  const addr = result?.address;
  if (!addr) return false;
  if (result.imagery?.streetView?.url || result.imagery?.satellite?.url) {
    const svOk = result.imagery.streetView?.url && imageryCache.hasCachedImagery(addr, 'streetview');
    const satOk = result.imagery.satellite?.url && imageryCache.hasCachedImagery(addr, 'satellite');
    if (svOk || satOk) return false;
  }
  return !imageryCache.hasCachedImagery(addr, 'streetview')
    && imageryCache.getEntry(addr, 'streetview')?.status !== 'unavailable';
}

function needsSatellite(result) {
  const addr = result?.address;
  if (!addr) return false;
  if (result.usedSatellite || result.skippedStreetView) return true;
  const svEntry = imageryCache.getEntry(addr, 'streetview');
  return svEntry?.status === 'unavailable';
}

async function cacheProperty(address, type) {
  const res = await postJson('/api/imagery/cache-one', { address, type });
  return res.data;
}

function attachImageryToResult(result) {
  const imagery = imageryCache.buildImageryRecord(result.address);
  if (imagery) result.imagery = imagery;
  return result;
}

async function main() {
  const opts = parseArgs();
  console.log('');
  console.log('  Property Imagery Migration');
  console.log('  --------------------------');
  console.log(`  Session: ${opts.session}`);
  console.log(`  Dry run: ${opts.dryRun}`);
  console.log(`  Storage: ${imageryCache.IMAGERY_DIR}`);
  console.log(`  R2:      ${imageryCache.isR2Configured() ? 'enabled' : 'local only'}`);
  console.log('');

  const session = loadSession(opts.session);
  const results = Array.isArray(session.results) ? session.results : [];
  if (!results.length) {
    console.log('No results in session — nothing to migrate.');
    return;
  }

  let queue = results.filter(needsMigration);
  if (opts.limit > 0) queue = queue.slice(0, opts.limit);

  const alreadyCached = results.length - queue.length;
  console.log(`  Total properties: ${results.length}`);
  console.log(`  Already cached:   ${alreadyCached}`);
  console.log(`  To migrate:       ${queue.length}`);
  console.log('');

  if (!queue.length) {
    console.log('All properties already have cached imagery.');
    return;
  }

  if (opts.dryRun) {
    queue.slice(0, 10).forEach((r, i) => console.log(`  [${i + 1}] ${r.address}`));
    if (queue.length > 10) console.log(`  ... and ${queue.length - 10} more`);
    console.log('\nDry run complete. Re-run without --dry-run to fetch and cache.');
    return;
  }

  const stats = { ok: 0, svFail: 0, satOk: 0, unavailable: 0, errors: 0 };
  const resultMap = new Map(results.map((r) => [recordKey(r), r]));

  for (let i = 0; i < queue.length; i++) {
    const r = queue[i];
    const addr = r.address;
    const pct = Math.round(((i + 1) / queue.length) * 100);
    process.stdout.write(`\r  [${i + 1}/${queue.length}] ${pct}% — ${addr.slice(0, 50).padEnd(50)}`);

    try {
      const sv = await cacheProperty(addr, 'streetview');
      const target = resultMap.get(recordKey(r)) || r;

      if (sv.ok) {
        stats.ok++;
        attachImageryToResult(target);
      } else if (sv.unavailable) {
        stats.unavailable++;
        attachImageryToResult(target);
        if (needsSatellite(r)) {
          const sat = await cacheProperty(addr, 'satellite');
          if (sat.ok) stats.satOk++;
          attachImageryToResult(target);
          await sleep(DELAY_MS);
        }
      } else {
        stats.svFail++;
        console.log(`\n  WARN: ${addr} — ${sv.error || 'Street View failed'}`);
      }
    } catch (err) {
      stats.errors++;
      console.log(`\n  ERROR: ${addr} — ${err.message}`);
      if (/ECONNREFUSED/.test(err.message)) {
        console.error('\n  Server not running. Start it first: node server.js');
        process.exit(1);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  Migration complete');
  console.log(`  Street View cached:  ${stats.ok}`);
  console.log(`  Satellite fallback:  ${stats.satOk}`);
  console.log(`  Unavailable:         ${stats.unavailable}`);
  console.log(`  Failed:              ${stats.svFail + stats.errors}`);

  const updatedResults = results.map((r) => {
    const merged = resultMap.get(recordKey(r)) || r;
    return attachImageryToResult(merged);
  });

  const outSession = { ...session, results: updatedResults, imageryMigratedAt: Date.now() };
  const outPath = opts.session;
  const backupPath = outPath.replace(/\.json$/, `_pre_imagery_${Date.now()}.json`);
  fs.copyFileSync(outPath, backupPath);
  fs.writeFileSync(outPath, JSON.stringify(outSession));
  console.log(`\n  Session updated: ${outPath}`);
  console.log(`  Backup saved:    ${backupPath}`);
  console.log(`  Cache stats:     ${JSON.stringify(imageryCache.getStats())}`);
  console.log('');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});