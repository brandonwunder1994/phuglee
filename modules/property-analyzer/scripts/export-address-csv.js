/**
 * One-off: export analyzer session results as 4-column address CSV.
 * Usage: node scripts/export-address-csv.js [outPath]
 */
const fs = require('fs');
const path = require('path');

const sessionPath = path.join(
  __dirname,
  '..',
  'users',
  '_vault',
  'distressAnalyzerSession_LATEST.json'
);
const defaultOut = path.join(
  process.env.USERPROFILE || 'C:\\Users\\brand',
  'Desktop',
  'UPDATE THESE LEADS LIST.csv'
);
const outPath = process.argv[2] || defaultOut;

const j = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
const results = Array.isArray(j.results) ? j.results : [];

function esc(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const header = ['Street Address', 'City', 'State', 'Postal Code'];
const lines = [header.join(',')];
let withStreet = 0;
for (const r of results) {
  const street = String(r.street || '').trim();
  const city = String(r.city || '').trim();
  const state = String(r.state || '').trim();
  const postal = String(r.postal || '').trim();
  if (street) withStreet++;
  lines.push([esc(street), esc(city), esc(state), esc(postal)].join(','));
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\r\n'), 'utf8');

console.log(
  JSON.stringify(
    {
      totalResults: results.length,
      dataRows: results.length,
      withStreet,
      outPath,
      bytes: fs.statSync(outPath).size,
      firstDataLine: lines[1] || null,
      lastDataLine: lines[lines.length - 1] || null
    },
    null,
    2
  )
);
