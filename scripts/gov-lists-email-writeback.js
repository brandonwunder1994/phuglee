'use strict';

/**
 * Merge researched clerk emails into the catalog via the research overlay.
 *
 * Reads all data/government-lists/research/email-batches/results-*.jsonl
 * (one JSON object per line: { key, contactEmail, evidence, confidence }),
 * expands each place key to its row ids (from email-targets.json), and upserts
 * an overlay entry per id carrying the found contactEmail. Then you rebuild:
 *   node scripts/build-government-lists-catalog.js
 *
 * Only accepts syntactically valid emails. Skips places with no/blank email.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = path.join(ROOT, 'data', 'government-lists', 'research', 'email-targets.json');
const CATALOG = path.join(ROOT, 'public', 'data', 'government-lists', 'catalog.json');
const OVERLAY = path.join(ROOT, 'data', 'government-lists', 'research', 'catalog-overlay.json');
const BATCH_DIR = path.join(ROOT, 'data', 'government-lists', 'research', 'email-batches');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`Bad JSONL ${file}:${i + 1}: ${e.message}`); }
  });
}

const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
const idsByKey = new Map(targets.places.map((p) => [p.key, p.ids]));

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const rowById = new Map(catalog.sources.map((s) => [s.id, s]));

const overlay = fs.existsSync(OVERLAY)
  ? JSON.parse(fs.readFileSync(OVERLAY, 'utf8'))
  : { version: 1, sources: [] };
if (!Array.isArray(overlay.sources)) overlay.sources = [];
const overlayById = new Map(overlay.sources.map((s) => [s.id, s]));

const resultFiles = fs.existsSync(BATCH_DIR)
  ? fs.readdirSync(BATCH_DIR).filter((f) => /^results-.*\.jsonl$/.test(f)).map((f) => path.join(BATCH_DIR, f))
  : [];

let placesFilled = 0;
let rowsFilled = 0;
let skipped = 0;
const skippedKeys = [];

for (const file of resultFiles) {
  for (const r of readJsonl(file)) {
    const key = r.key;
    const email = String(r.contactEmail || '').trim();
    if (!key || !idsByKey.has(key)) { skipped++; continue; }
    if (!email || !EMAIL_RE.test(email)) { skipped++; skippedKeys.push(key); continue; }
    let filledThisPlace = false;
    for (const id of idsByKey.get(key)) {
      const base = overlayById.get(id) || rowById.get(id);
      if (!base) continue;
      const entry = { ...base, contactEmail: email, emailSource: r.evidence || '', emailConfidence: r.confidence || '' };
      overlayById.set(id, entry);
      rowsFilled++;
      filledThisPlace = true;
    }
    if (filledThisPlace) placesFilled++;
  }
}

overlay.sources = [...overlayById.values()];
overlay.updatedAt = new Date().toISOString();
fs.writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n');

console.log(`Result files: ${resultFiles.length}`);
console.log(`Places filled: ${placesFilled} / ${targets.placeCount}`);
console.log(`Rows filled:   ${rowsFilled} / ${targets.rowCount}`);
console.log(`Skipped (no/invalid email): ${skipped}`);
console.log(`Overlay now has ${overlay.sources.length} sources -> ${path.relative(ROOT, OVERLAY)}`);
console.log('Next: node scripts/build-government-lists-catalog.js');
