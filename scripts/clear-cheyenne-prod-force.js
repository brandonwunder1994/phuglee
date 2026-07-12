const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://phuglee-production.up.railway.app';
const OUT = path.join(__dirname, 'cheyenne-clear-work.json');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: opts.headers || {},
        timeout: 600000
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, text: buf.toString('utf8'), bytes: buf.length, headers: res.headers });
        });
      }
    );
    req.on('error', (err) => {
      console.error('req error', err.message);
      reject(err);
    });
    req.on('timeout', () => {
      console.error('req timeout');
      req.destroy(new Error('timeout'));
    });
    if (opts.body) {
      console.log('writing body bytes', opts.body.length);
      req.write(opts.body);
    }
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

function unwrap(p) {
  if (p?.session) return p.session;
  if (p?.data?.records || p?.data?.results) return p.data;
  return p;
}

(async () => {
  console.log('step1 token');
  const html = await fetchUrl(`${BASE}/analyzer/`);
  console.log('html status', html.status, 'len', html.bytes);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error('no token');
  console.log('token ok', tok.slice(0, 8) + '...');

  const headers = {
    'X-PDA-Token': tok,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json'
  };

  console.log('step2 GET session');
  const get = await fetchUrl(`${BASE}/analyzer/api/session-backup`, { headers });
  console.log('GET', get.status, get.bytes);
  fs.writeFileSync(OUT.replace('.json', '-before.json'), get.text);
  const s = unwrap(JSON.parse(get.text));
  const before = {
    records: (s.records || []).length,
    results: (s.results || []).length,
    cheyR: (s.records || []).filter(isChey).length,
    cheyRes: (s.results || []).filter(isChey).length
  };
  console.log('before', before);

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
  fs.writeFileSync(OUT, body);
  console.log('cleaned body bytes', body.length, 'written', OUT);

  console.log('step3 POST forceReplace');
  const postUrl = `${BASE}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual`;
  const post = await fetchUrl(postUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Content-Length': body.length
    },
    body
  });
  console.log('POST status', post.status);
  console.log('POST body', post.text.slice(0, 500));
  fs.writeFileSync(OUT.replace('.json', '-post-response.json'), post.text);

  console.log('step4 verify');
  const v = await fetchUrl(`${BASE}/analyzer/api/session-backup`, { headers });
  const s2 = unwrap(JSON.parse(v.text));
  const after = {
    records: (s2.records || []).length,
    results: (s2.results || []).length,
    cheyR: (s2.records || []).filter(isChey).length,
    cheyRes: (s2.results || []).filter(isChey).length
  };
  console.log('after', after);

  const idx = await fetchUrl(`${BASE}/analyzer/api/import-address-index`, { headers });
  console.log('index status', idx.status);
  if (idx.status === 200) {
    const j = JSON.parse(idx.text);
    const list = Array.isArray(j.addresses) ? j.addresses : [];
    const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
    console.log('index count', j.count, 'cheyenne-wy', chey.length);
  }

  // max/vault scope same storage as admin for max plan - still try
  console.log('step5 vault/max scope');
  const headersMax = { ...headers, 'X-Phuglee-Plan': 'max' };
  const getMax = await fetchUrl(`${BASE}/analyzer/api/session-backup`, { headers: headersMax });
  const sMax = unwrap(JSON.parse(getMax.text));
  const cheyMax = [...(sMax.records || []), ...(sMax.results || [])].filter(isChey).length;
  console.log('max scope chey total', cheyMax, 'records', (sMax.records || []).length);
  if (cheyMax > 0) {
    sMax.records = (sMax.records || []).filter((r) => !isChey(r));
    sMax.results = (sMax.results || []).filter((r) => !isChey(r));
    sMax.savedAt = Date.now();
    const bodyMax = Buffer.from(JSON.stringify(sMax));
    const postMax = await fetchUrl(postUrl, {
      method: 'POST',
      headers: {
        ...headersMax,
        'Content-Type': 'application/json',
        'Content-Length': bodyMax.length
      },
      body: bodyMax
    });
    console.log('POST max', postMax.status, postMax.text.slice(0, 200));
  }

  if (after.cheyR === 0 && after.cheyRes === 0) {
    console.log('SUCCESS');
    process.exit(0);
  }
  console.log('NOT_CLEAR');
  process.exit(2);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
