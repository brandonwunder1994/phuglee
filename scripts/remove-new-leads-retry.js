'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const LOCAL = path.join(
  __dirname,
  '..',
  'modules',
  'property-analyzer',
  'users',
  'admin',
  'distressAnalyzerSession_LATEST.json'
);
const IMPORT = 'new_analyzer_leads_2026-07-11';
const PROD = 'https://phuglee-production.up.railway.app';

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
          ...(body ? { 'Content-Length': body.length } : {})
        },
        agent,
        timeout: 600000
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

function strip(session) {
  const records = (session.records || []).filter((r) => {
    if (r?.importSource === IMPORT) return false;
    if (String(r?.sourceFile || '')
      .toLowerCase()
      .includes('new analyzer leads')) {
      return false;
    }
    return true;
  });
  const importBatches = (session.importBatches || []).filter((b) => {
    const src = String(b?.sourceFile || '').toLowerCase();
    const id = String(b?.id || '').toLowerCase();
    if (src.includes('new analyzer leads')) return false;
    if (id.includes('new_analyzer_leads')) return false;
    return true;
  });
  return {
    ...session,
    records,
    results: Array.isArray(session.results) ? session.results : [],
    importBatches,
    fileName: '',
    savedAt: Date.now()
  };
}

(async () => {
  // Local first
  if (fs.existsSync(LOCAL)) {
    const bak = `${LOCAL}.bak-remove-new-leads-${Date.now()}`;
    fs.copyFileSync(LOCAL, bak);
    const local = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
    const before = (local.records || []).length;
    const cleaned = strip(local);
    fs.writeFileSync(LOCAL, JSON.stringify(cleaned));
    console.log('local', {
      before,
      after: cleaned.records.length,
      results: (cleaned.results || []).length,
      bak
    });
  }

  const html = await req(`${PROD}/analyzer/`);
  const tok = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/)[1];
  const headers = {
    'X-PDA-Token': tok,
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  const get = await req(`${PROD}/analyzer/api/session-backup`, { headers });
  if (get.status !== 200) throw new Error(`get ${get.status}`);
  const payload = JSON.parse(get.text);
  const session = payload.session || payload;
  console.log('prod before', {
    records: (session.records || []).length,
    results: (session.results || []).length,
    new: (session.records || []).filter((r) => r.importSource === IMPORT).length
  });

  const cleaned = strip(session);
  console.log('prod after plan', {
    records: cleaned.records.length,
    results: (cleaned.results || []).length,
    new: cleaned.records.filter((r) => r.importSource === IMPORT).length
  });

  const body = JSON.stringify(cleaned);
  console.log('payload MB', (body.length / 1024 / 1024).toFixed(2));
  fs.writeFileSync(path.join(__dirname, '_cleaned-session-prod.json'), body);

  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      console.log('POST attempt', i);
      const post = await req(
        `${PROD}/analyzer/api/session-backup?allowDowngrade=1&forceReplace=1&reason=manual-remove-new-analyzer-leads-queue`,
        { method: 'POST', headers, body }
      );
      console.log('POST', post.status, post.text.slice(0, 300));
      if (post.status >= 200 && post.status < 300) {
        const v = await req(`${PROD}/analyzer/api/session-backup`, { headers });
        const s = JSON.parse(v.text).session || JSON.parse(v.text);
        console.log('verify', {
          records: (s.records || []).length,
          results: (s.results || []).length,
          newLeft: (s.records || []).filter((r) => r.importSource === IMPORT).length
        });
        console.log('DONE');
        process.exit(0);
      }
      lastErr = new Error(`status ${post.status}`);
    } catch (e) {
      lastErr = e;
      console.error('attempt fail', e.message);
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
