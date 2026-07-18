'use strict';

/**
 * Split email-targets.json into N batch files for parallel research subagents.
 * Usage: node scripts/gov-lists-email-split.js [batchCount]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = path.join(ROOT, 'data', 'government-lists', 'research', 'email-targets.json');
const OUT_DIR = path.join(ROOT, 'data', 'government-lists', 'research', 'email-batches');

const batchCount = Math.max(1, parseInt(process.argv[2], 10) || 6);
const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
const places = targets.places || [];

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const batches = Array.from({ length: batchCount }, () => []);
places.forEach((p, i) => batches[i % batchCount].push(p));

const manifest = [];
batches.forEach((places, i) => {
  const n = String(i + 1).padStart(2, '0');
  const file = path.join(OUT_DIR, `batch-${n}.json`);
  fs.writeFileSync(file, JSON.stringify({ batch: n, places }, null, 2) + '\n');
  manifest.push({ batch: n, count: places.length, file: path.relative(ROOT, file), out: `data/government-lists/research/email-batches/results-${n}.jsonl` });
});

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Split ${places.length} places into ${batchCount} batches:`);
manifest.forEach((m) => console.log(`  ${m.batch}: ${m.count} places -> ${m.file}`));
