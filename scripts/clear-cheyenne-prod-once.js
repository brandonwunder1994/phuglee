const https = require('https');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        timeout: 600000
      },
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

(async () => {
  const base = 'https://phuglee-production.up.railway.app';
  console.log('1) get token');
  const html = await fetchUrl(`${base}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error('no token');
  console.log('token len', tok.length);

  const scopes = [
    { user: 'admin', plan: 'pro' },
    { user: 'admin', plan: 'max' },
    { user: '', plan: '' }
  ];

  for (const scope of scopes) {
    const headers = {
      'X-PDA-Token': tok,
      'X-Phuglee-User': scope.user,
      'X-Phuglee-Plan': scope.plan,
      Accept: 'application/json'
    };
    console.log('\n--- scope', scope);
    console.log('2) GET session');
    const get = await fetchUrl(`${base}/analyzer/api/session-backup`, { headers });
    console.log('GET', get.status, get.bytes);
    if (get.status !== 200) {
      console.log(get.text.slice(0, 300));
      continue;
    }
    const s = unwrap(JSON.parse(get.text));
    const before = {
      records: (s.records || []).length,
      results: (s.results || []).length,
      cheyR: (s.records || []).filter(isChey).length,
      cheyRes: (s.results || []).filter(isChey).length
    };
    console.log('before', before);
    if (!before.cheyR && !before.cheyRes) {
      console.log('already clean');
      continue;
    }

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
    console.log('3) POST cleaned session bytes', body.length);
    // forceReplace skips merge (which would re-add removed cities); allowDowngrade accepts fewer results
    const post = await fetchUrl(`${base}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': body.length
      },
      body
    });
    console.log('POST', post.status, post.text.slice(0, 400));

    console.log('4) verify');
    const v = await fetchUrl(`${base}/analyzer/api/session-backup`, { headers });
    const s2 = unwrap(JSON.parse(v.text));
    const left = [...(s2.records || []), ...(s2.results || [])].filter(isChey).length;
    console.log('after records', (s2.records || []).length, 'results', (s2.results || []).length, 'chey left', left);

    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    console.log('index', idx.status);
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
      console.log('index count', j.count, 'cheyenne-wy', chey.length, chey[0] || '');
    }
  }
  console.log('\nDONE');
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
