const https = require('https');
const http = require('http');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      { method: opts.method || 'GET', headers: opts.headers || {}, timeout: 300000 },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, text: buf.toString('utf8') });
        });
      }
    );
    req.on('error', reject);
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

function unwrap(p) {
  if (p?.session) return p.session;
  if (p?.data?.records || p?.data?.results) return p.data;
  return p;
}

async function check(base, label) {
  const html = await fetchUrl(`${base}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error(`${label}: no token`);
  for (const plan of ['pro', 'max']) {
    const headers = {
      'X-PDA-Token': tok,
      'X-Phuglee-User': 'admin',
      'X-Phuglee-Plan': plan
    };
    const get = await fetchUrl(`${base}/analyzer/api/session-backup`, { headers });
    const s = unwrap(JSON.parse(get.text));
    const cheyR = (s.records || []).filter(isChey).length;
    const cheyRes = (s.results || []).filter(isChey).length;
    console.log(
      `${label} admin/${plan}: records=${(s.records || []).length} results=${(s.results || []).length} cheyR=${cheyR} cheyRes=${cheyRes}`
    );
    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
      console.log(`${label} index count=${j.count} cheyenne-wy=${chey.length}`);
    } else {
      console.log(`${label} index status=${idx.status}`);
    }
  }
}

(async () => {
  await check('http://127.0.0.1:3000', 'local');
  await check('https://phuglee-production.up.railway.app', 'prod');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
