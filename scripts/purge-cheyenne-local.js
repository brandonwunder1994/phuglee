const http = require('http');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { ...(opts.headers || {}) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = body.length;
    }
    const req = http.request(url, { method: opts.method || 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const base = 'http://127.0.0.1:3000';
  const html = await fetchUrl(`${base}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error('no token');
  for (const plan of ['pro', 'max']) {
    const headers = { 'X-PDA-Token': tok, 'X-Phuglee-User': 'admin', 'X-Phuglee-Plan': plan };
    const p = await fetchUrl(`${base}/analyzer/api/purge-location`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ city: 'Cheyenne', state: 'WY' })
    });
    console.log('purge', plan, p.status, p.text);
    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    const j = JSON.parse(idx.text);
    const list = Array.isArray(j.addresses) ? j.addresses : [];
    const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
    console.log('index', plan, 'count', j.count, 'cheyenne-wy', chey.length);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
