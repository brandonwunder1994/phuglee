#!/usr/bin/env node
/**
 * Production smoke test: Street View + satellite + proxy rewrite integrity.
 * Exit 0 only when all critical checks pass.
 *
 *   node scripts/smoke-analyzer-imagery.js
 *   node scripts/smoke-analyzer-imagery.js https://phuglee-production.up.railway.app
 */
'use strict';

const base = (process.argv[2] || 'https://phuglee-production.up.railway.app').replace(/\/$/, '');

async function getJson(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text, headers: res.headers };
}

async function getText(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

function assert(cond, msg, fails) {
  if (!cond) {
    fails.push(msg);
    console.log(`  FAIL  ${msg}`);
  } else {
    console.log(`  OK    ${msg}`);
  }
}

async function main() {
  const fails = [];
  console.log(`Smoke: ${base}\n`);

  console.log('1) Health');
  {
    const { status, json } = await getJson('/api/health');
    assert(status === 200 && json?.ok, `health 200 ok (got ${status})`, fails);
    assert(json?.modules?.propertyAnalyzer === 'up', `propertyAnalyzer up (got ${json?.modules?.propertyAnalyzer})`, fails);
  }

  console.log('\n2) Analyzer config (Maps + Gemini keys present)');
  {
    const { status, json } = await getJson('/analyzer/api/config');
    assert(status === 200 && json?.ok, `config 200 (got ${status})`, fails);
    assert(json?.hasMapsKey === true, 'hasMapsKey', fails);
    assert(json?.hasGeminiKey === true, 'hasGeminiKey', fails);
  }

  console.log('\n3) JS rewrite integrity (proxyFetchUrl not mangled)');
  {
    const { status, text, headers } = await getText(`/analyzer/js/render.js?v=smoke-${Date.now()}`);
    assert(status === 200 && text.length > 1000, `render.js served (${text.length} bytes)`, fails);
    const bad = (text.match(/proxyFetchurl/g) || []).length;
    const good = (text.match(/proxyFetchUrl/g) || []).length;
    assert(bad === 0, `no proxyFetchurl mangling (count=${bad})`, fails);
    assert(good >= 4, `proxyFetchUrl present (count=${good})`, fails);
    const cc = headers.get('cache-control') || '';
    assert(/no-store|no-cache|max-age=0/i.test(cc), `JS cache-control short/no-store (got "${cc}")`, fails);
  }

  console.log('\n4) Street View base64 (known addresses)');
  const addrs = [
    '1600 Amphitheatre Parkway, Mountain View, CA',
    '350 5th Ave, New York, NY',
    '123 Main St, Cheyenne, WY'
  ];
  let svOk = 0;
  for (const a of addrs) {
    const q = encodeURIComponent(a);
    const { status, json } = await getJson(`/analyzer/api/sv-base64?address=${q}`);
    const ok = status === 200 && json?.ok === true && !!json?.base64;
    if (ok) svOk++;
    assert(ok, `sv-base64 ${a.slice(0, 40)}… ok=${json?.ok} err=${json?.error || ''}`, fails);
  }

  console.log('\n5) Satellite base64');
  {
    const q = encodeURIComponent(addrs[0]);
    const { status, json } = await getJson(`/analyzer/api/satellite-base64?address=${q}`);
    assert(status === 200 && json?.ok === true && !!json?.base64, `satellite-base64 ok`, fails);
  }

  console.log('\n6) Concurrent Street View x8');
  {
    const q = encodeURIComponent(addrs[0]);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        getJson(`/analyzer/api/sv-base64?address=${q}&_=${i}`).then((r) => r.json?.ok === true)
      )
    );
    const n = results.filter(Boolean).length;
    assert(n === 8, `concurrent SV 8/8 (got ${n}/8)`, fails);
  }

  console.log('\n7) Usage ledger (no hard quota active)');
  {
    const { status, json } = await getJson('/analyzer/api/usage');
    assert(status === 200 && json?.ok, `usage 200`, fails);
    assert(json?.hardQuotaActive !== true, `hardQuotaActive not set (got ${json?.hardQuotaActive})`, fails);
    assert(json?.lastHardQuota == null || json?.hardQuotaActive === false, `no active lastHardQuota block`, fails);
  }

  console.log('\n---');
  if (fails.length) {
    console.log(`FAILED ${fails.length} check(s). Do NOT green-light scan.`);
    process.exit(1);
  }
  console.log(`PASSED all checks. SV ok on ${svOk}/${addrs.length} sample addresses.`);
  console.log('Server-side Street View + satellite + rewrite look healthy.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke crashed:', err);
  process.exit(2);
});
