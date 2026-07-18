'use strict';

/**
 * Export the rows whose workflow needs a send-to email but have none.
 * Groups by place so the email hunt is one lookup per place, not per row.
 * Output: data/government-lists/research/email-targets.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'public', 'data', 'government-lists', 'catalog.json');
const OUT = path.join(ROOT, 'data', 'government-lists', 'research', 'email-targets.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const sources = (catalog.sources || []).filter((s) => !s.isPlaybook);

const noEmail = (r) => !(r.contactEmail && String(r.contactEmail).trim());
const needsEmail = (r) =>
  ['email', 'pdf'].includes(r.method) ||
  r.verifyStatus === 'email_only' ||
  r.verifyStatus === 'pdf_only';

const rows = sources.filter((r) => needsEmail(r) && noEmail(r));

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

const bySource = {};
for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;

const places = new Map();
for (const r of rows) {
  const key = [r.city || '', r.county || '', r.state || ''].join('|');
  if (!places.has(key)) {
    places.set(key, {
      key,
      city: r.city || '',
      county: r.county || '',
      state: r.state || '',
      domains: new Set(),
      ids: [],
      listTypes: new Set()
    });
  }
  const p = places.get(key);
  p.ids.push(r.id);
  if (r.listType) p.listTypes.add(r.listType);
  const d = domainOf(r.url);
  if (d) p.domains.add(d);
}

const placeList = [...places.values()]
  .map((p) => ({
    key: p.key,
    city: p.city,
    county: p.county,
    state: p.state,
    domains: [...p.domains],
    listTypes: [...p.listTypes],
    ids: p.ids
  }))
  .sort((a, b) => (a.state + a.county + a.city).localeCompare(b.state + b.county + b.city));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rowCount: rows.length, placeCount: placeList.length, bySource, places: placeList }, null, 2) + '\n');

console.log('rows needing email:', rows.length);
console.log('unique places:', placeList.length);
console.log('by source:', bySource);
console.log('sample places:');
for (const p of placeList.slice(0, 8)) {
  console.log('  ', [p.city, p.county, p.state].filter(Boolean).join(', '), '| domains:', p.domains.join(',') || '(none)', '| types:', p.listTypes.join(','));
}
console.log('wrote', path.relative(ROOT, OUT));
