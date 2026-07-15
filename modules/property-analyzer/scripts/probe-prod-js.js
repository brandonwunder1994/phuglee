#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const BASE = 'https://phuglee-production.up.railway.app';
const PASS = process.env.PHUGLEE_PASS || process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD || '';

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASS, plan: 'max' })
  });
  const cookie = (login.headers.getSetCookie?.().find((c) => c.startsWith('phuglee_session=')) || '').split(';')[0];
  const html = await (await fetch(`${BASE}/analyzer/`, { headers: { Cookie: cookie }, cache: 'no-store' })).text();
  const allScripts = [...html.matchAll(/src=["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => /imagery|session|state\.js/.test(s));
  console.log(JSON.stringify({
    htmlLen: html.length,
    title: (html.match(/<title>[^<]+/i) || [])[0],
    allScripts,
    hasReviewQueues: html.includes('review-queues'),
    snippet: html.includes('imagery.js') ? html.slice(html.indexOf('imagery.js') - 40, html.indexOf('imagery.js') + 80) : 'no imagery.js in html'
  }, null, 2));

  const candidates = [
    ...allScripts,
    '/js/imagery.js?v=20260715-review-queues',
    '/analyzer/js/imagery.js?v=20260715-review-queues',
    '/modules/property-analyzer/public/js/imagery.js'
  ];
  for (const t of candidates) {
    const url = t.startsWith('http') ? t : `${BASE}${t.startsWith('/') ? '' : '/'}${t}`;
    const r = await fetch(url, { headers: { Cookie: cookie }, cache: 'no-store' });
    const body = await r.text();
    console.log(JSON.stringify({
      url,
      status: r.status,
      len: body.length,
      hasDiscard: body.includes('discardStaleReviewProgress'),
      head: body.slice(0, 120).replace(/\s+/g, ' ')
    }));
  }
})();
