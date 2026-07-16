'use strict';
/**
 * Extended prod Comping QA — confirmReplace, block-pass kill, multi-lead,
 * land out-of-scope, preserve-ARV signal, invalid inputs.
 * Env: PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD (or PHUGLEE_PASS)
 */
const https = require('https');
const http = require('http');

const BASE = String(process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';
const ND = new Set(['AK', 'ID', 'KS', 'LA', 'MS', 'MO', 'MT', 'NM', 'ND', 'TX', 'UT', 'WY']);

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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie: (res.headers['set-cookie'] || [])[0] || null,
          body: Buffer.concat(chunks).toString('utf8')
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
  return setCookie ? String(setCookie).split(';')[0] : '';
}

function leadFrom(body) {
  const j = parseJson(body) || {};
  return j.lead || j;
}

async function main() {
  const out = { base: BASE, checks: [], findings: [] };
  const fail = (name, detail) => {
    out.checks.push({ name, ok: false, detail });
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  };
  const pass = (name, detail) => out.checks.push({ name, ok: true, detail });
  const finding = (severity, detail) => out.findings.push({ severity, detail });

  if (!PASS) fail('auth-env', 'Missing admin password');

  const health = await fetchUrl(`${BASE}/api/health`);
  if (health.status !== 200) fail('health', health.status);
  pass('health', 200);

  const login = await fetchUrl(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: { username: 'admin', password: PASS }
  });
  const loginBody = parseJson(login.body) || {};
  const cookie = cookieHeader(login.cookie);
  if (!loginBody.ok || !cookie) fail('login', loginBody);
  pass('login', { plan: loginBody.plan });
  const h = { Cookie: cookie, Accept: 'application/json' };

  const list = await fetchUrl(`${BASE}/api/leads?limit=120`, { headers: h });
  const listBody = parseJson(list.body) || {};
  const leads = Array.isArray(listBody.leads) ? listBody.leads
    : Array.isArray(listBody.items) ? listBody.items : [];
  if (!leads.length) fail('list-leads', { keys: Object.keys(listBody) });

  const houses = leads.filter((l) => l && l.leadType !== 'land' && l.leadId);
  const land = leads.find((l) => l && l.leadType === 'land' && l.leadId);
  const tx = houses.find((l) => String(l.state || '').toUpperCase() === 'TX');
  const disclosureMany = houses.filter((l) => {
    const st = String(l.state || '').toUpperCase();
    return st && !ND.has(st);
  }).slice(0, 4);
  const alreadyComped = houses.find((l) => l.compedAt && Number(l.estARV) > 0);

  pass('catalog-sample', {
    total: leads.length,
    houses: houses.length,
    landId: land ? land.leadId : null,
    txId: tx ? tx.leadId : null,
    disclosureIds: disclosureMany.map((l) => l.leadId),
    alreadyCompedId: alreadyComped ? alreadyComped.leadId : null
  });

  // --- Land out of scope ---
  if (land) {
    const landComp = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(land.leadId)}/comp`, {
      method: 'POST', headers: h, body: {}
    });
    const landBody = parseJson(landComp.body) || {};
    if (landComp.status !== 400 || landBody.code !== 'LAND_OUT_OF_SCOPE') {
      fail('land-out-of-scope', { status: landComp.status, body: landBody });
    }
    pass('land-out-of-scope', { leadId: land.leadId });
  } else {
    pass('land-out-of-scope-skipped', 'No land lead in first page');
  }

  // --- Block-pass kill + invalid ---
  const bpLead = tx || disclosureMany[0] || houses[0];
  if (!bpLead) fail('block-pass-lead', 'No house lead');
  const kill = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(bpLead.leadId)}/comp/block-pass`, {
    method: 'POST', headers: h, body: { pass: 'kill' }
  });
  const killBody = parseJson(kill.body) || {};
  if (kill.status !== 200 || killBody.compBlockPass !== 'kill') {
    fail('block-pass-kill', { status: kill.status, body: killBody });
  }
  pass('block-pass-kill', { leadId: bpLead.leadId });

  const badPass = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(bpLead.leadId)}/comp/block-pass`, {
    method: 'POST', headers: h, body: { pass: 'maybe' }
  });
  if (badPass.status !== 400) fail('block-pass-invalid', { status: badPass.status, body: badPass.body.slice(0, 200) });
  pass('block-pass-invalid', 400);

  // --- confirmReplace without mutating ---
  if (alreadyComped) {
    const before = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(alreadyComped.leadId)}`, { headers: h });
    const beforeLead = leadFrom(before.body);
    const arvBefore = beforeLead.estARV;
    const compedAtBefore = beforeLead.compedAt;

    const cr = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(alreadyComped.leadId)}/comp`, {
      method: 'POST', headers: h, body: {}
    });
    const crBody = parseJson(cr.body) || {};
    if (cr.status !== 200 || !crBody.confirmReplace) {
      fail('confirmReplace', { status: cr.status, body: crBody });
    }
    const after = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(alreadyComped.leadId)}`, { headers: h });
    const afterLead = leadFrom(after.body);
    if (afterLead.estARV !== arvBefore || afterLead.compedAt !== compedAtBefore) {
      fail('confirmReplace-no-mutate', {
        arvBefore, arvAfter: afterLead.estARV,
        compedAtBefore, compedAtAfter: afterLead.compedAt
      });
    }
    pass('confirmReplace', {
      leadId: alreadyComped.leadId,
      arv: arvBefore,
      state: alreadyComped.state
    });
  } else {
    pass('confirmReplace-skipped', 'No already-comped house in sample');
  }

  // --- TX needsManual ---
  if (tx) {
    const txComp = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp`, {
      method: 'POST', headers: h, body: tx.compedAt ? { replace: true } : {}
    });
    const txBody = parseJson(txComp.body) || {};
    if (txComp.status !== 200 || !(txBody.needsManual || txBody.confirmReplace)) {
      fail('tx-path', { status: txComp.status, body: txBody });
    }
    pass('tx-path', {
      leadId: tx.leadId,
      needsManual: !!txBody.needsManual,
      confirmReplace: !!txBody.confirmReplace
    });
  }

  // --- Multi disclosure Comp (up to 3) ---
  const disclosureResults = [];
  for (const lead of disclosureMany.slice(0, 3)) {
    const detail = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(lead.leadId)}`, { headers: h });
    const full = leadFrom(detail.body);
    const arvBefore = full.estARV;
    const wasComped = Boolean(full.compedAt && Number(full.estARV) > 0);

    const res = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(lead.leadId)}/comp`, {
      method: 'POST',
      headers: h,
      body: full.compedAt ? { replace: true } : {}
    });
    const body = parseJson(res.body) || {};
    const row = {
      leadId: lead.leadId,
      state: lead.state,
      status: res.status,
      ok: body.ok,
      confidence: body.report && body.report.confidence,
      arv: body.lead && body.lead.estARV,
      arvBefore,
      arvPreserved: body.report && body.report.arvPreserved,
      includedCount: body.report && body.report.includedCount,
      error: body.error || null,
      code: body.code || null
    };
    disclosureResults.push(row);

    if (res.status === 503 && body.code === 'REAPI_NOT_CONFIGURED') {
      fail('reapi-configured', body);
    }
    if (res.status === 500) {
      fail('disclosure-500', row);
    }
    // Suspicious ARV under $20k for a house Comp — flag, don't hard-fail (could be true thin market)
    if (body.ok && body.report && body.report.confidence !== 'blocked'
      && Number(body.lead && body.lead.estARV) > 0
      && Number(body.lead.estARV) < 20000) {
      finding('warn', {
        type: 'suspicious-low-arv',
        ...row
      });
    }
    // Preserve: if was comped and new run blocked, ARV must remain
    if (wasComped && body.report && body.report.confidence === 'blocked') {
      if (Number(body.lead && body.lead.estARV) !== Number(arvBefore)) {
        fail('preserve-arv-on-blocked', { ...row, expected: arvBefore });
      }
      if (!body.report.arvPreserved) {
        finding('warn', { type: 'blocked-without-arvPreserved-flag', ...row });
      } else {
        pass('preserve-arv-on-blocked', { leadId: lead.leadId, arv: arvBefore });
      }
    }
  }
  pass('disclosure-batch', { count: disclosureResults.length, results: disclosureResults });

  // --- Invalid manual ---
  if (tx) {
    const badManual = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(tx.leadId)}/comp/manual`, {
      method: 'POST',
      headers: h,
      body: { arv: -1, comps: [] }
    });
    const badManualBody = parseJson(badManual.body) || {};
    if (badManual.status !== 400) {
      fail('manual-invalid', { status: badManual.status, body: badManualBody });
    }
    pass('manual-invalid', { code: badManualBody.code || null, status: 400 });
  }

  // --- GET comp summary ---
  if (alreadyComped || disclosureResults[0]) {
    const id = (alreadyComped || disclosureMany[0]).leadId;
    const sum = await fetchUrl(`${BASE}/api/leads/${encodeURIComponent(id)}/comp`, { headers: h });
    const sumBody = parseJson(sum.body) || {};
    if (sum.status !== 200 || !sumBody.ok) fail('get-comp', { status: sum.status, body: sumBody });
    pass('get-comp', { leadId: id, keys: Object.keys(sumBody) });
  }

  const allOk = out.checks.every((c) => c.ok);
  console.log(JSON.stringify(out, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
