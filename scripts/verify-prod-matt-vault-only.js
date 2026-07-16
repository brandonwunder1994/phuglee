'use strict';
const https = require('https');
const BASE = 'phuglee-production.up.railway.app';

function req(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = Object.assign({ Accept: 'text/html' }, opts.headers || {});
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(opts.body);
    }
    const r = https.request({ hostname: BASE, path, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location || null,
        cookie: (res.headers['set-cookie'] || [])[0] || null,
        body: b
      }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

(async () => {
  const rolesJs = await req('GET', '/js/auth-guard.js');
  const hasMatt = rolesJs.body.includes("VAULT_ONLY_USER = 'matt'");

  const login = await req('POST', '/api/auth/login', {
    body: JSON.stringify({ username: 'matt', password: 'wholesale' }),
    headers: { Accept: 'application/json' }
  });
  let loginBody = {};
  try { loginBody = JSON.parse(login.body); } catch (_) {}

  if (!login.cookie) {
    console.log(JSON.stringify({
      hasMatt,
      loginStatus: login.status,
      loginBody,
      raw: login.body.slice(0, 400)
    }, null, 2));
    process.exit(1);
  }

  const cookie = login.cookie.split(';')[0];
  const h = { Cookie: cookie };
  const vault = await req('GET', '/vault', { headers: h });
  const landVault = await req('GET', '/land-vault', { headers: h });
  const filter = await req('GET', '/filter', { headers: h });
  const command = await req('GET', '/command', { headers: h });
  const analyzer = await req('GET', '/analyzer/', { headers: h });
  const admin = await req('POST', '/api/leads/admin/contracts/from-vault', {
    body: '{}',
    headers: Object.assign({}, h, { Accept: 'application/json' })
  });

  const out = {
    hasMattInAuthGuard: hasMatt,
    login: loginBody,
    vault: { status: vault.status },
    landVault: { status: landVault.status },
    filter: { status: filter.status, location: filter.location },
    command: { status: command.status, location: command.location },
    analyzer: { status: analyzer.status, location: analyzer.location },
    adminFromVault: { status: admin.status, body: admin.body.slice(0, 120) }
  };
  console.log(JSON.stringify(out, null, 2));

  const ok = loginBody.ok === true
    && loginBody.username === 'matt'
    && loginBody.plan === 'max'
    && vault.status === 200
    && landVault.status === 200
    && filter.status === 302
    && filter.location === '/vault'
    && command.status === 302
    && command.location === '/vault'
    && analyzer.status === 302
    && analyzer.location === '/vault'
    && admin.status === 403
    && hasMatt;

  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
