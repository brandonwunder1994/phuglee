/**
 * Set GEOCODIO_* on Railway from local .env.
 * Prerequisites: railway login && railway link (from project root)
 * Usage: node scripts/set-railway-geocodio-env.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env file');
  process.exit(1);
}

const wanted = [
  'GEOCODIO_API_KEYS',
  'GEOCODIO_API_ACCOUNTS',
  'GEOCODIO_DAILY_LIMIT',
  'GEOCODIO_USAGE_TZ'
];
const map = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (wanted.includes(k)) map[k] = v;
}

if (!map.GEOCODIO_API_KEYS) {
  console.error('GEOCODIO_API_KEYS missing from .env');
  process.exit(1);
}

const keyCount = map.GEOCODIO_API_KEYS.split(/[,\n;]+/).filter(Boolean).length;
console.log(
  `Setting ${Object.keys(map).length} vars on Railway (${keyCount} API keys)...`
);

for (const [k, v] of Object.entries(map)) {
  const r = spawnSync('railway', ['variables', '--set', `${k}=${v}`], {
    cwd: root,
    encoding: 'utf8',
    shell: true
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `Failed to set ${k}`);
    console.error('Make sure you ran: railway login && railway link');
    process.exit(r.status || 1);
  }
  console.log(`  set ${k}`);
}

console.log(
  'Done. Redeploy the Railway service if it does not pick up vars automatically.'
);
