'use strict';
const https = require('https');

function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? Buffer.from(opts.body) : null;
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: {
          ...(opts.headers || {}),
          ...(body ? { 'Content-Length': body.length, 'Content-Type': 'application/json' } : {})
        },
        timeout: 120000
      },
      (res) => {
        const c = [];
        res.on('data', (d) => c.push(d));
        res.on('end', () =>
          resolve({ status: res.statusCode, text: Buffer.concat(c).toString('utf8') })
        );
      }
    );
    r.on('error', reject);
    r.on('timeout', () => {
      r.destroy();
      reject(new Error('timeout'));
    });
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const base = 'https://phuglee-production.up.railway.app';
  let headers = null;

  for (let i = 0; i < 30; i++) {
    try {
      const html = await req(`${base}/analyzer/`);
      const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
      if (!m) {
        console.log('waiting for analyzer token…', i, 'status', html.status);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      headers = {
        'X-PDA-Token': m[1],
        'X-Phuglee-User': 'admin',
        'X-Phuglee-Plan': 'pro',
        Accept: 'application/json'
      };
      const probe = await req(`${base}/analyzer/api/purge-import-source`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ importSource: '__probe__' })
      });
      // 400/200 = endpoint live; 404 = not deployed yet
      if (probe.status === 404) {
        console.log('endpoint not live yet…', i);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      console.log('endpoint ready', probe.status, probe.text.slice(0, 160));
      break;
    } catch (e) {
      console.log('wait error', e.message);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  if (!headers) throw new Error('Could not reach production analyzer');

  const purge = await req(`${base}/analyzer/api/purge-import-source`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      importSource: 'new_analyzer_leads_2026-07-11',
      sourceFileIncludes: 'new analyzer leads',
      recordsOnly: true
    })
  });
  console.log('purge', purge.status, purge.text);

  const verify = await req(`${base}/analyzer/api/session-backup`, { headers });
  const p = JSON.parse(verify.text);
  const s = p.session || p;
  const left = (s.records || []).filter(
    (r) => r.importSource === 'new_analyzer_leads_2026-07-11'
  ).length;
  console.log(
    JSON.stringify(
      {
        records: (s.records || []).length,
        results: (s.results || []).length,
        newLeadsLeft: left
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
