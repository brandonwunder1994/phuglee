'use strict';

/**
 * Production smoke for Land Desk after Railway deploy.
 * Usage: node scripts/verify-prod-land-vault.js
 */
const https = require('https');
const BASE = process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app';

function req(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const headers = Object.assign({ Accept: '*/*' }, opts.headers || {});
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(opts.body);
    }
    const r = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: b
      }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const health = await req('GET', '/api/health');
  assert(health.status === 200, `health status ${health.status}`);

  const html = await req('GET', '/land-vault');
  assert(html.status === 200 || html.status === 302, `land-vault status ${html.status}`);
  // Auth may redirect; still check asset URLs from HTML when 200, else fetch assets directly
  const htmlBody = html.body || '';
  const jsMatch = htmlBody.match(/\/js\/land-vault-app\.js\?v=([^"']+)/);
  const cssMatch = htmlBody.match(/\/css\/land-vault\.css\?v=([^"']+)/);
  const jsVer = jsMatch ? jsMatch[1] : '7';
  const cssVer = cssMatch ? cssMatch[1] : '8';

  const js = await req('GET', `/js/land-vault-app.js?v=${jsVer}`);
  assert(js.status === 200, `land-vault-app.js status ${js.status}`);
  assert(js.body.includes('download-builder-packet'), 'missing download-builder-packet');
  assert(js.body.includes('LAND_SIGNAL_CHIPS') || js.body.includes('Tax delinquent'), 'missing land signal chips');
  assert(js.body.includes('format=pdf'), 'missing format=pdf PDF download');
  assert(js.body.includes('save-disposition') || js.body.includes('land-disposition'), 'missing disposition workflow');
  assert(js.body.includes('land-vault-map') || js.body.includes('viewMode'), 'missing map view');
  assert(js.body.includes('vault-thumb--empty'), 'missing empty-thumb fast path');
  assert(!/thumbHtml[\s\S]{0,400}liveSvUrlForLead\(lead\)/.test(js.body), 'list thumbs must not auto-fetch street view');
  assert(js.body.includes('promote') || js.body.includes('copy-tax-dirt') || js.body.includes('builder-packet'), 'missing polish symbols');
  assert(js.body.includes('needsScreen') || js.body.includes('fundShaped') || js.body.includes('landQueue'), 'missing KPI queue wiring');

  const css = await req('GET', `/css/land-vault.css?v=${cssVer}`);
  assert(css.status === 200, `land-vault.css status ${css.status}`);
  assert(css.body.includes('land-vault-teardown-badge') || css.body.includes('land-vault-packet'), 'missing polish CSS');

  const vaultHtml = await req('GET', '/vault');
  const vaultJs = await req('GET', '/js/vault-app.js?v=26');
  // vault-app version may differ on prod; try to discover from HTML
  let vaultJsBody = vaultJs.body;
  if (vaultJs.status !== 200 && vaultHtml.body) {
    const m = vaultHtml.body.match(/\/js\/vault-app\.js\?v=([^"']+)/);
    if (m) {
      const v = await req('GET', `/js/vault-app.js?v=${m[1]}`);
      vaultJsBody = v.body;
      assert(v.status === 200, `vault-app.js status ${v.status}`);
    }
  } else if (vaultJs.status === 200) {
    // ok
  } else if (vaultHtml.body) {
    const m = vaultHtml.body.match(/\/js\/vault-app\.js\?v=([^"']+)/);
    assert(m, 'could not find vault-app.js version');
    const v = await req('GET', `/js/vault-app.js?v=${m[1]}`);
    vaultJsBody = v.body;
    assert(v.status === 200, `vault-app.js status ${v.status}`);
  }
  assert(vaultJsBody.includes('promote-to-land') || vaultJsBody.includes('vault-promote-land'), 'missing teardown promote UI');

  // Config route exists: land-vault page asset
  const landPage = await req('GET', '/land-vault.html');
  // May 404 if only routed via PHUGLEE_ROUTES — try /land-vault again for body markers
  const pageProbe = html.status === 200 ? htmlBody : (await req('GET', `/js/land-vault-app.js?v=${jsVer}`)).body;
  assert(pageProbe.includes('land-vault') || pageProbe.includes('Land Desk') || pageProbe.includes('builder-packet'), 'land desk markers missing');

  console.log(JSON.stringify({
    ok: true,
    base: BASE,
    health: health.status,
    landVaultPage: html.status,
    landJs: { status: js.status, ver: jsVer, hasBuilderPacket: js.body.includes('download-builder-packet') },
    landCss: { status: css.status, ver: cssVer },
    vaultPromote: vaultJsBody.includes('promote-to-land') || vaultJsBody.includes('vault-promote-land'),
    commitHint: js.body.includes('download-builder-packet') ? 'polish symbols present' : null
  }, null, 2));
})().catch((err) => {
  console.error('VERIFY FAIL:', err.message);
  process.exit(1);
});
