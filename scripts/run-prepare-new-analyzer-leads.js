#!/usr/bin/env node
'use strict';
/**
 * Call production (or local) prepare-new-analyzer-leads after deploy.
 * Production requires a login cookie (header identity is disabled) — otherwise
 * prepare hits `_anonymous` while the operator is on `admin`.
 *
 * Usage: node scripts/run-prepare-new-analyzer-leads.js
 *        node scripts/run-prepare-new-analyzer-leads.js --local   (default)
 *        node scripts/run-prepare-new-analyzer-leads.js --prod    (Railway — explicit)
 * Env:   PHUGLEE_PASS or PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD (admin password)
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { resolveScriptTarget } = require('./script-target');

const { base: BASE, isProd, label: TARGET_LABEL } = resolveScriptTarget(process.argv);
const LOCAL = !isProd;

function loadDotEnvPassword() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return '';
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD\s*=\s*(.+)$/m);
    return m ? String(m[1]).trim().replace(/^["']|["']$/g, '') : '';
  } catch (_) {
    return '';
  }
}

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
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
            setCookie: res.headers['set-cookie'] || []
          })
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

function cookieHeader(setCookies) {
  return (setCookies || [])
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ');
}

(async () => {
  console.log(`[prepare] Targeting ${TARGET_LABEL} (${BASE}). Pass --prod for Railway.`);
  const html = await fetchUrl(`${BASE}/analyzer/`);
  const m = html.text.match(/__PDA_AUTH_TOKEN__\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('No PDA auth token');

  const pass =
    process.env.PHUGLEE_PASS ||
    process.env.PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD ||
    loadDotEnvPassword();
  let cookies = '';
  if (pass) {
    const login = await fetchUrl(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: 'admin', password: pass })
    });
    if (login.status < 200 || login.status >= 300) {
      throw new Error(`Admin login failed: ${login.status} ${login.text.slice(0, 200)}`);
    }
    cookies = cookieHeader(login.setCookie);
    console.log('[prepare] logged in as admin');
  } else {
    console.warn('[prepare] WARNING: no admin password — may prepare _anonymous on production');
  }

  const headers = {
    'X-PDA-Token': m[1],
    'X-Phuglee-User': 'admin',
    'X-Phuglee-Plan': 'pro',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(cookies ? { Cookie: cookies } : {})
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
  try {
    const j = JSON.parse(res.text);
    if (j.storageKey && j.storageKey !== 'admin') {
      console.warn('[prepare] WARNING: prepared scope is', j.storageKey, '— expected admin');
    }
  } catch (_) {}
})().catch((e) => {
  console.error('[prepare] FATAL', e.message || e);
  process.exit(1);
});
