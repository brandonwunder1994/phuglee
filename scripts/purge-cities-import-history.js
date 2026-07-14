/**
 * Clear Analyze "already imported" addresses for specific cities so Filter can re-import.
 * Defaults to LOCAL. Pass --prod for Railway only.
 *
 *   node scripts/purge-cities-import-history.js
 *   node scripts/purge-cities-import-history.js --prod
 */
const https = require('https');
const http = require('http');
const { resolveScriptTarget } = require('./script-target');

const CITIES = [
  { city: 'Cheyenne', state: 'WY' },
  { city: 'Midlothian', state: 'TX' }
];

const { base: BASE, label: TARGET_LABEL } = resolveScriptTarget(process.argv);
const BASES = [BASE];

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { ...(opts.headers || {}) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = body.length;
    }
    const req = lib.request(
      url,
      { method: opts.method || 'GET', headers, timeout: 180000 },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function statePattern(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'WY' || s === 'WYOMING') return /\b(wy|wyoming)\b/i;
  if (s === 'TX' || s === 'TEXAS') return /\b(tx|texas)\b/i;
  return new RegExp(`\\b${state}\\b`, 'i');
}

async function purgeBase(base) {
  console.log(`\n=== ${base} ===`);
  let html;
  try {
    html = await fetchUrl(`${base}/analyzer/`);
  } catch (err) {
    console.log('skip (unreachable):', err.message);
    return;
  }
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) {
    console.log('skip: no PDA token');
    return;
  }

  for (const plan of ['pro', 'max']) {
    const headers = {
      'X-PDA-Token': tok,
      'X-Phuglee-User': 'admin',
      'X-Phuglee-Plan': plan
    };

    // Free disk if full (production)
    const cleanup = await fetchUrl(`${base}/analyzer/api/disk-cleanup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    if (cleanup.status !== 404) {
      console.log(`cleanup admin/${plan}:`, cleanup.status, cleanup.text.slice(0, 160));
    }

    for (const { city, state } of CITIES) {
      const post = await fetchUrl(`${base}/analyzer/api/purge-location`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ city, state })
      });
      console.log(`purge ${city}, ${state} admin/${plan}:`, post.status, post.text.slice(0, 350));
    }

    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      for (const { city, state } of CITIES) {
        const reCity = new RegExp(city, 'i');
        const reState = statePattern(state);
        const hits = list.filter((a) => reCity.test(String(a)) && reState.test(String(a)));
        console.log(`index remaining ${city}/${state}:`, hits.length, '(want 0)');
      }
      console.log('index total count:', j.count);
    } else {
      console.log('index status', idx.status);
    }
  }
}

(async () => {
  console.log(`[purge-cities] Targeting ${TARGET_LABEL} (${BASE}). Pass --prod for Railway.`);
  for (const base of BASES) {
    try {
      await purgeBase(base);
    } catch (err) {
      console.error(base, err.message);
    }
  }
  console.log('\nDONE');
})();
