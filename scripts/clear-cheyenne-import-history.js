/**
 * Remove Cheyenne, WY leads from Analyze sessions so Filter can re-import.
 * Usage: node scripts/clear-cheyenne-import-history.js [--prod] [--local]
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const doLocal = args.has('--local') || !args.has('--prod');
const doProd = args.has('--prod') || !args.has('--local');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method: opts.method || 'GET', headers: opts.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function isCheyenneWY(r) {
  const city = String(r.city || '').trim().toLowerCase();
  const state = String(r.state || '').trim().toLowerCase();
  const addr = String(r.address || '').toLowerCase();
  if (city === 'cheyenne' && (state === 'wy' || state === 'wyoming' || !state)) return true;
  if (/cheyenne/i.test(addr) && /\b(wy|wyoming)\b/i.test(addr) && !/keller|\btx\b/i.test(addr)) return true;
  return false;
}

function cleanSession(session) {
  const base = session && typeof session === 'object' ? session : {};
  const records = Array.isArray(base.records) ? base.records : [];
  const results = Array.isArray(base.results) ? base.results : [];
  const removedRecords = records.filter(isCheyenneWY);
  const removedResults = results.filter(isCheyenneWY);
  const next = {
    ...base,
    records: records.filter((r) => !isCheyenneWY(r)),
    results: results.filter((r) => !isCheyenneWY(r)),
    savedAt: Date.now()
  };
  if (Array.isArray(base.importBatches)) {
    next.importBatches = base.importBatches.filter((b) => {
      const c = String(b.city || '').toLowerCase();
      const st = String(b.state || '').toLowerCase();
      return !(c === 'cheyenne' && (st === 'wy' || st === 'wyoming' || !st));
    });
  }
  if (typeof next.processed === 'number') {
    next.processed = Math.min(next.processed, next.results.length);
  }
  return {
    session: next,
    removedRecords: removedRecords.length,
    removedResults: removedResults.length,
    sample: (removedRecords[0] && (removedRecords[0].address || removedRecords[0].street)) || null
  };
}

function unwrapSession(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.session && typeof payload.session === 'object') return payload.session;
  if (payload.data && typeof payload.data === 'object' && (payload.data.records || payload.data.results)) {
    return payload.data;
  }
  return payload;
}

async function extractToken(baseUrl) {
  const html = await fetchUrl(`${baseUrl.replace(/\/$/, '')}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`No PDA token in HTML for ${baseUrl}`);
  return m[1];
}

async function clearRemote(baseUrl, label, scopes) {
  const token = await extractToken(baseUrl);
  console.log(`[${label}] token ok (len ${token.length})`);

  for (const scope of scopes) {
    const headers = {
      'X-PDA-Token': token,
      'X-Phuglee-User': scope.user,
      'X-Phuglee-Plan': scope.plan,
      Accept: 'application/json'
    };
    const getRes = await fetchUrl(`${baseUrl}/analyzer/api/session-backup`, { headers });
    console.log(`[${label}] GET session ${scope.user}/${scope.plan} -> ${getRes.status} (${getRes.body.length} bytes)`);
    if (getRes.status !== 200) {
      console.log(getRes.text.slice(0, 300));
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(getRes.text);
    } catch (err) {
      console.log(`[${label}] parse fail`, err.message);
      continue;
    }
    const session = unwrapSession(payload);
    const beforeR = (session.records || []).length;
    const beforeRes = (session.results || []).length;
    const cleaned = cleanSession(session);
    console.log(
      `[${label}] ${scope.user}/${scope.plan}: records ${beforeR}->${cleaned.session.records.length}, ` +
      `results ${beforeRes}->${cleaned.session.results.length}, ` +
      `removed ${cleaned.removedRecords}/${cleaned.removedResults}, sample=${cleaned.sample || 'n/a'}`
    );
    if (!cleaned.removedRecords && !cleaned.removedResults) continue;

    const body = Buffer.from(JSON.stringify(cleaned.session));
    const postRes = await fetchUrl(
      `${baseUrl}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': body.length
        },
        body
      }
    );
    console.log(`[${label}] POST session ${scope.user}/${scope.plan} -> ${postRes.status} ${postRes.text.slice(0, 200)}`);

    const verify = await fetchUrl(`${baseUrl}/analyzer/api/session-backup`, { headers });
    if (verify.status === 200) {
      const v = unwrapSession(JSON.parse(verify.text));
      const left = [...(v.records || []), ...(v.results || [])].filter(isCheyenneWY).length;
      console.log(`[${label}] verify left Cheyenne WY: ${left}`);
    }

    const idx = await fetchUrl(`${baseUrl}/analyzer/api/import-address-index`, { headers });
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
      console.log(`[${label}] import index count=${j.count} cheyenne-wy=${chey.length}`);
    } else {
      console.log(`[${label}] import index -> ${idx.status}`);
    }
  }
}

function clearLocalFiles() {
  const files = [
    path.join(ROOT, 'modules/property-analyzer/users/admin/distressAnalyzerSession_LATEST.json'),
    path.join(ROOT, 'modules/property-analyzer/users/_vault/distressAnalyzerSession_LATEST.json')
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.log(`[local-file] missing ${file}`);
      continue;
    }
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cleaned = cleanSession(session);
    if (!cleaned.removedRecords && !cleaned.removedResults) {
      console.log(`[local-file] ${path.basename(path.dirname(file))}: already clean`);
      continue;
    }
    const bak = `${file}.bak-cheyenne-clear-${Date.now()}`;
    fs.copyFileSync(file, bak);
    fs.writeFileSync(file, JSON.stringify(cleaned.session));
    console.log(
      `[local-file] ${file}: removed rec=${cleaned.removedRecords} res=${cleaned.removedResults} bak=${path.basename(bak)}`
    );
  }
}

(async () => {
  if (doLocal) {
    clearLocalFiles();
    try {
      await clearRemote('http://127.0.0.1:3000', 'local-api', [
        { user: 'admin', plan: 'pro' },
        { user: 'admin', plan: 'max' }
      ]);
    } catch (err) {
      console.warn('[local-api]', err.message);
    }
  }
  if (doProd) {
    await clearRemote('https://phuglee-production.up.railway.app', 'prod', [
      { user: 'admin', plan: 'pro' },
      { user: 'admin', plan: 'max' },
      { user: '', plan: '' }
    ]);
  }
  console.log('DONE');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
