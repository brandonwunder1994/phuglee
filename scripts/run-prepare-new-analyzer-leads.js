#!/usr/bin/env node
'use strict';
/**
 * Call production (or local) prepare-new-analyzer-leads after deploy.
 * Usage: node scripts/run-prepare-new-analyzer-leads.js
 *        node scripts/run-prepare-new-analyzer-leads.js --local
 */
const http = require('http');
const https = require('https');

const LOCAL = process.argv.includes('--local');
const BASE = LOCAL
  ? 'http://127.0.0.1:3000'
  : (process.env.PHUGLEE_PROD_URL || 'https://phuglee-production.up.railway.app');

function fetchUrl(url, { method = 'GET', headers = {}, body = null, timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': payload.length } : {})
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const html = await fetchUrl(`${BASE}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No PDA auth token');
  const headers = {
    'X-PDA-Token': m[1],
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  console.log('[prepare] calling', BASE);
  const res = await fetchUrl(`${BASE}/analyzer/api/prepare-new-analyzer-leads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requeueUnavailable: true })
  });
  console.log(res.status, res.text.slice(0, 2000));
  if (res.status < 200 || res.status >= 300) process.exit(1);

  const sum = await fetchUrl(`${BASE}/analyzer/api/session-summary?lite=1`, { headers });
  console.log('[prepare] summary after', sum.text.slice(0, 700));
})().catch((e) => {
  console.error('[prepare] FATAL', e.message || e);
  process.exit(1);
});
