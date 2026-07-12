const https = require('https');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: opts.method || 'GET', headers: opts.headers || {}, timeout: 600000 },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, text: buf.toString('utf8'), bytes: buf.length });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isChey(r) {
  const city = String(r.city || '').trim().toLowerCase();
  const state = String(r.state || '').trim().toLowerCase();
  const addr = String(r.address || '').toLowerCase();
  if (city === 'cheyenne' && (state === 'wy' || state === 'wyoming' || !state)) return true;
  if (/cheyenne/i.test(addr) && /\b(wy|wyoming)\b/i.test(addr) && !/keller|\btx\b/i.test(addr)) return true;
  return false;
}

function unwrap(payload) {
  if (payload?.session) return payload.session;
  if (payload?.data?.records || payload?.data?.results) return payload.data;
  return payload;
}

async function attemptClear(base) {
  const html = await fetchUrl(`${base}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error('no token');

  const scopes = [
    { user: 'admin', plan: 'pro' },
    { user: 'admin', plan: 'max' }
  ];

  let anyLeft = 0;
  for (const scope of scopes) {
    const headers = {
      'X-PDA-Token': tok,
      'X-Phuglee-User': scope.user,
      'X-Phuglee-Plan': scope.plan,
      Accept: 'application/json'
    };
    const get = await fetchUrl(`${base}/analyzer/api/session-backup`, { headers });
    if (get.status !== 200) throw new Error(`GET ${get.status}`);
    const s = unwrap(JSON.parse(get.text));
    const cheyR = (s.records || []).filter(isChey).length;
    const cheyRes = (s.results || []).filter(isChey).length;
    console.log(`scope ${scope.user}/${scope.plan}: chey records=${cheyR} results=${cheyRes}`);
    if (!cheyR && !cheyRes) continue;

    s.records = (s.records || []).filter((r) => !isChey(r));
    s.results = (s.results || []).filter((r) => !isChey(r));
    if (Array.isArray(s.importBatches)) {
      s.importBatches = s.importBatches.filter((b) => {
        const c = String(b.city || '').toLowerCase();
        const st = String(b.state || '').toLowerCase();
        return !(c === 'cheyenne' && (st === 'wy' || st === 'wyoming' || !st));
      });
    }
    if (typeof s.processed === 'number') s.processed = Math.min(s.processed, (s.results || []).length);
    s.savedAt = Date.now();
    const body = Buffer.from(JSON.stringify(s));
    const post = await fetchUrl(
      `${base}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual`,
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
    console.log(`POST ${post.status} ${post.text.slice(0, 250)}`);
    if (post.status === 409 || post.status === 400) {
      return { ready: false, reason: post.text.slice(0, 200) };
    }
    if (post.status !== 200) {
      return { ready: false, reason: `POST ${post.status}` };
    }

    const v = await fetchUrl(`${base}/analyzer/api/session-backup`, { headers });
    const s2 = unwrap(JSON.parse(v.text));
    const left = [...(s2.records || []), ...(s2.results || [])].filter(isChey).length;
    console.log(`verify left=${left} records=${(s2.records || []).length} results=${(s2.results || []).length}`);
    anyLeft += left;

    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
      console.log(`index count=${j.count} cheyenne-wy=${chey.length}`);
      anyLeft += chey.length;
    }
  }
  return { ready: true, left: anyLeft };
}

(async () => {
  const base = 'https://phuglee-production.up.railway.app';
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const health = await fetchUrl(`${base}/api/health`);
      console.log('\nhealth', health.status, health.text.slice(0, 120));
      const result = await attemptClear(base);
      if (result.ready && result.left === 0) {
        console.log('\nSUCCESS Cheyenne WY import history cleared on production');
        process.exit(0);
      }
      if (result.ready && result.left > 0) {
        console.log('still left', result.left, '- retrying');
      } else {
        console.log('deploy not ready yet:', result.reason || 'unknown');
      }
    } catch (err) {
      console.log('wait error', err.message);
    }
    await sleep(25000);
  }
  console.error('FAILED timeout waiting for deploy/clear');
  process.exit(1);
})();
