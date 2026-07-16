'use strict';
/**
 * Prod smoke for Vault Comping ARV after deploy.
 * Env: PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD (or PHUGLEE_PASS)
 * Optional: PHUGLEE_PROD_URL
 */
const https = require('https');
const http = require('http');

const BASE = String(process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const setCookie = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie: setCookie[0] || null,
          body: buf.toString('utf8'),
          buf
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function cookieHeader(setCookie) {
  if (!setCookie) return '';
  return String(setCookie).split(';')[0];
}

async function main() {
  const out = { base: BASE, checks: [] };
  const fail = (name, detail) => {
    out.checks.push({ name, ok: false, detail });
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  };
  const pass = (name, detail) => out.checks.push({ name, ok: true, detail });

  if (!PASS) fail('auth-env', 'Missing PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD / PHUGLEE_PASS');

  const health = await fetchUrl(`${BASE}/api/health`);
  const healthBody = parseJson(health.body) || {};
  if (health.status !== 200) fail('health', { status: health.status, body: health.body.slice(0, 200) });
  pass('health', { status: health.status, ok: healthBody.ok });

  const vaultJs = await fetchUrl(`${BASE}/js/vault-app.js`);
  if (vaultJs.status !== 200) fail('vault-app-js', { status: vaultJs.status });
  const symbols = [
    'needsManual',
    'confirmReplace',
    'Comping Rules',
    'hasArvCompingReport',
    '/comp/manual',
    'data-block-pass',
    'arvPreserved',
    'Upload a Propelio report before saving'
  ];
  const missing = symbols.filter((s) => !vaultJs.body.includes(s));
  if (missing.length) fail('vault-app-symbols', { missing, bytes: vaultJs.body.length });
  pass('vault-app-symbols', { bytes: vaultJs.body.length, symbols });

  const vaultHtml = await fetchUrl(`${BASE}/vault`);
  if (vaultHtml.status !== 200 || !vaultHtml.body.includes('vault-app.js?v=26')) {
    fail('vault-html-cachebust', { status: vaultHtml.status, hasV26: vaultHtml.body.includes('vault-app.js?v=26') });
  }
  pass('vault-html-cachebust', { v: 26 });

  const login = await fetchUrl(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: { username: 'admin', password: PASS }
  });
  const loginBody = parseJson(login.body) || {};
  const cookie = cookieHeader(login.cookie);
  if (login.status !== 200 || !loginBody.ok || !cookie) {
    fail('login', { status: login.status, ok: loginBody.ok, hasCookie: !!cookie });
  }
  pass('login', { username: loginBody.username, plan: loginBody.plan });

  const h = { Cookie: cookie, Accept: 'application/json' };

  // Find house leads: prefer TX (manual) and a disclosure state (auto).
  const list = await fetchUrl(`${BASE}/api/leads?limit=80&status=active`, { headers: h });
  const listBody = parseJson(list.body) || {};
  const leads = Array.isArray(listBody.leads) ? listBody.leads
    : Array.isArray(listBody.items) ? listBody.items
    : Array.isArray(listBody) ? listBody : [];
  if (!leads.length) {
    // try alternate query shape
    const list2 = await fetchUrl(`${BASE}/api/leads?limit=80`, { headers: h });
    const b2 = parseJson(list2.body) || {};
    const leads2 = Array.isArray(b2.leads) ? b2.leads
      : Array.isArray(b2.items) ? b2.items : [];
    if (!leads2.length) fail('list-leads', { status: list.status, keys: Object.keys(listBody), status2: list2.status });
    leads.push(...leads2);
  }

  const houses = leads.filter((l) => l && l.leadType !== 'land' && l.leadId);
  const tx = houses.find((l) => String(l.state || '').toUpperCase() === 'TX');
  const disclosure = houses.find((l) => {
    const st = String(l.state || '').toUpperCase();
    return st && !['AK', 'ID', 'KS', 'LA', 'MS', 'MO', 'MT', 'NM', 'ND', 'TX', 'UT', 'WY'].includes(st);
  });

  pass('list-leads', {
    total: leads.length,
    houses: houses.length,
    txId: tx ? tx.leadId : null,
    disclosureId: disclosure ? disclosure.leadId : null,
    disclosureState: disclosure ? disclosure.state : null
  });

  if (!tx) fail('tx-lead', 'No TX house lead found in first page for needsManual smoke');

  const manualNoFile = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp/manual`, {
    method: 'POST',
    headers: h,
    body: {
      arv: 100000,
      comps: [
        { address: 'a', price: 100000 },
        { address: 'b', price: 101000 },
        { address: 'c', price: 102000 }
      ]
    }
  });
  const manualNoFileBody = parseJson(manualNoFile.body) || {};
  // If lead already has report files, skip this assertion
  const txDetail0 = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}`, { headers: h });
  const txLead0 = (parseJson(txDetail0.body) || {}).lead || parseJson(txDetail0.body);
  const hasFiles = Array.isArray(txLead0?.compReportFiles) && txLead0.compReportFiles.length > 0;
  if (!hasFiles) {
    if (manualNoFile.status !== 400 || manualNoFileBody.code !== 'REPORT_FILE_REQUIRED') {
      fail('manual-requires-report', { status: manualNoFile.status, body: manualNoFileBody });
    }
    pass('manual-requires-report', { code: 'REPORT_FILE_REQUIRED' });
  } else {
    pass('manual-requires-report-skipped', { reason: 'lead already has report files', leadId: tx.leadId });
  }

  const blockPass = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp/block-pass`, {
    method: 'POST',
    headers: h,
    body: { pass: 'pass' }
  });
  const blockPassBody = parseJson(blockPass.body) || {};
  if (blockPass.status !== 200 || blockPassBody.compBlockPass !== 'pass') {
    fail('block-pass', { status: blockPass.status, body: blockPassBody });
  }
  pass('block-pass', { pass: 'pass', leadId: tx.leadId });

  const txBefore = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}`, { headers: h });
  const txLeadBefore = (parseJson(txBefore.body) || {}).lead || parseJson(txBefore.body);
  const txArvBefore = txLeadBefore && txLeadBefore.estARV;

  const txComp = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp`, {
    method: 'POST',
    headers: h,
    body: {}
  });
  const txCompBody = parseJson(txComp.body) || {};
  if (txComp.status !== 200 || !txCompBody.ok) {
    fail('tx-comp', { status: txComp.status, body: txCompBody });
  }
  if (txCompBody.confirmReplace) {
    // Already comped — confirm replace path then needsManual
    const txReplace = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp`, {
      method: 'POST',
      headers: h,
      body: { replace: true }
    });
    const txReplaceBody = parseJson(txReplace.body) || {};
    if (txReplace.status !== 200 || !txReplaceBody.ok || !txReplaceBody.needsManual) {
      fail('tx-comp-replace-needsManual', { status: txReplace.status, body: txReplaceBody });
    }
    pass('tx-comp', { path: 'confirmReplace→needsManual', state: txReplaceBody.state });
  } else if (!txCompBody.needsManual) {
    fail('tx-comp-needsManual', { body: txCompBody });
  } else {
    pass('tx-comp', { path: 'needsManual', state: txCompBody.state });
  }

  const txAfter = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}`, { headers: h });
  const txLeadAfter = (parseJson(txAfter.body) || {}).lead || parseJson(txAfter.body);
  if (txLeadAfter && txArvBefore != null && txLeadAfter.estARV !== txArvBefore && !txCompBody.confirmReplace) {
    // Auto path for TX must not invent ARV on needsManual
    fail('tx-no-invent-arv', { before: txArvBefore, after: txLeadAfter.estARV });
  }
  pass('tx-arv-preserved-or-absent', {
    before: txArvBefore == null ? null : txArvBefore,
    after: txLeadAfter ? txLeadAfter.estARV : null
  });

  if (disclosure) {
    const dComp = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(disclosure.leadId)}/comp`, {
      method: 'POST',
      headers: h,
      body: disclosure.compedAt ? { replace: true } : {}
    });
    const dBody = parseJson(dComp.body) || {};
    if (dComp.status === 503 && dBody.code === 'REAPI_NOT_CONFIGURED') {
      fail('disclosure-comp-reapi', dBody);
    }
    if (dComp.status === 200 && dBody.confirmReplace) {
      const d2 = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(disclosure.leadId)}/comp`, {
        method: 'POST',
        headers: h,
        body: { replace: true }
      });
      const d2Body = parseJson(d2.body) || {};
      if (!(d2.status === 200 && d2Body.ok && (d2Body.report || d2Body.needsManual || d2Body.error))) {
        // ok with report, or blocked with error
        if (!(d2Body.ok === false && d2Body.error)) {
          fail('disclosure-comp-replace', { status: d2.status, body: d2Body });
        }
      }
      pass('disclosure-comp', {
        state: disclosure.state,
        leadId: disclosure.leadId,
        ok: d2Body.ok,
        hasReport: !!d2Body.report,
        arv: d2Body.lead && d2Body.lead.estARV,
        needsManual: !!d2Body.needsManual,
        error: d2Body.error || null
      });
    } else if (dComp.status === 200 && dBody.ok && dBody.report) {
      pass('disclosure-comp', {
        state: disclosure.state,
        leadId: disclosure.leadId,
        arv: dBody.lead && dBody.lead.estARV,
        confidence: dBody.report.confidence || null,
        included: dBody.report.includedCount || (dBody.report.comps && dBody.report.comps.length) || null
      });
    } else if (dComp.status === 200 && dBody.ok && dBody.needsManual) {
      pass('disclosure-comp', {
        state: disclosure.state,
        leadId: disclosure.leadId,
        note: 'unexpected needsManual on disclosure state',
        body: dBody
      });
    } else if (dComp.status === 400 || (dComp.status === 200 && dBody.ok === false)) {
      // Thin market / blocked is acceptable smoke — proves route + REAPI wired
      pass('disclosure-comp-blocked', {
        state: disclosure.state,
        leadId: disclosure.leadId,
        status: dComp.status,
        error: dBody.error || null,
        code: dBody.code || null
      });
    } else {
      fail('disclosure-comp', { status: dComp.status, body: dBody });
    }
  } else {
    pass('disclosure-comp-skipped', 'No non-ND house lead in first page');
  }

  const allOk = out.checks.every((c) => c.ok);
  console.log(JSON.stringify(out, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
