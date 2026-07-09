const https = require('https');
const http = require('http');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { ...(opts.headers || {}) };
    if (body) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = body.length;
    }
    const req = lib.request(
      url,
      { method: opts.method || 'GET', headers, timeout: 120000 },
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
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

async function purgeAt(base, label) {
  console.log(`\n=== ${label} ${base} ===`);
  const html = await fetchUrl(`${base}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
  if (!tok) throw new Error('no token');

  for (const plan of ['pro', 'max']) {
    const headers = {
      'X-PDA-Token': tok,
      'X-Phuglee-User': 'admin',
      'X-Phuglee-Plan': plan
    };
    const cleanup = await fetchUrl(`${base}/analyzer/api/disk-cleanup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    console.log(`cleanup admin/${plan}: ${cleanup.status} ${cleanup.text.slice(0, 300)}`);
    const post = await fetchUrl(`${base}/analyzer/api/purge-location`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ city: 'Cheyenne', state: 'WY' })
    });
    console.log(`purge admin/${plan}: ${post.status} ${post.text.slice(0, 400)}`);

    const idx = await fetchUrl(`${base}/analyzer/api/import-address-index`, { headers });
    if (idx.status === 200) {
      const j = JSON.parse(idx.text);
      const list = Array.isArray(j.addresses) ? j.addresses : [];
      const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
      console.log(`index admin/${plan}: count=${j.count} cheyenne-wy=${chey.length}`);
    } else {
      console.log(`index admin/${plan}: ${idx.status} ${idx.text.slice(0, 120)}`);
    }
  }
}

(async () => {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const health = await fetchUrl('https://phuglee-production.up.railway.app/api/health');
      console.log('health', health.status, health.text.slice(0, 100));
      await purgeAt('https://phuglee-production.up.railway.app', 'prod');
      // success if purge returned 200 with removed or already zero
      const html = await fetchUrl('https://phuglee-production.up.railway.app/analyzer/');
      const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)?.[1];
      const headers = { 'X-PDA-Token': tok, 'X-Phuglee-User': 'admin', 'X-Phuglee-Plan': 'pro' };
      const check = await fetchUrl('https://phuglee-production.up.railway.app/analyzer/api/purge-location', {
        method: 'POST',
        headers,
        body: JSON.stringify({ city: 'Cheyenne', state: 'WY' })
      });
      if (check.status === 404) {
        console.log('endpoint not deployed yet, waiting...');
      } else if (check.status === 200) {
        const j = JSON.parse(check.text);
        console.log('final purge check', j);
        if (j.ok && j.removedRecords === 0 && j.removedResults === 0) {
          // verify index
          const idx = await fetchUrl('https://phuglee-production.up.railway.app/analyzer/api/import-address-index', { headers });
          const ix = JSON.parse(idx.text);
          const list = Array.isArray(ix.addresses) ? ix.addresses : [];
          const chey = list.filter((a) => /cheyenne/i.test(String(a)) && /\b(wy|wyoming)\b/i.test(String(a)));
          console.log('final index cheyenne-wy', chey.length);
          if (chey.length === 0) {
            console.log('SUCCESS');
            // also local
            try {
              await purgeAt('http://127.0.0.1:3000', 'local');
            } catch (e) {
              console.warn('local purge skipped', e.message);
            }
            process.exit(0);
          }
        }
      } else {
        console.log('unexpected', check.status, check.text.slice(0, 200));
      }
    } catch (err) {
      console.log('wait', err.message);
    }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.error('TIMEOUT');
  process.exit(1);
})();
