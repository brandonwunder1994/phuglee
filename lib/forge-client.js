'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const config = require('./config');
const runtime = require('./runtime');

let registryCache = null;

function cityHasCompletedPdf(city) {
  const pdf = city.pdf || {};
  return pdf.status === 'completed' && !!pdf.user_filled_path;
}

function includeInCityTracker(city) {
  if (cityHasCompletedPdf(city)) return true;
  const pathway = city.pathway || 'online';
  if (pathway === 'email_pdf') return false;
  if (pathway === 'online' || pathway === 'hybrid' || pathway === 'email_only') return true;
  return !!city.portal_url;
}

function loadBundledRegistry() {
  if (registryCache) return registryCache;
  const registryPath = path.join(config.FORGE_PATH, 'data', 'portal-registry.json');
  const raw = fs.readFileSync(registryPath, 'utf8');
  registryCache = JSON.parse(raw);
  return registryCache;
}

function bundledCitySummaries() {
  const registry = loadBundledRegistry();
  return (registry.cities || [])
    .filter(includeInCityTracker)
    .map((city) => ({
      id: city.id,
      city: city.city,
      state: city.state
    }));
}

function bundledCityDetail(cityId) {
  const registry = loadBundledRegistry();
  const city = (registry.cities || []).find((row) => row.id === cityId);
  if (!city || !includeInCityTracker(city)) return null;
  return {
    id: city.id,
    city: city.city,
    state: city.state,
    bridge_datasets: city.bridge_datasets || []
  };
}

function resolveForgeTarget(pathname) {
  const remote = runtime.remoteForgeUrl();
  if (remote) {
    const base = remote.replace(/\/$/, '');
    return new URL(`${base}${pathname}`);
  }
  return new URL(`http://${config.loopbackHost(config.FORGE_HOST)}:${config.FORGE_PORT}${pathname}`);
}

function requestForge(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const target = resolveForgeTarget(pathname);
    const payload = body == null ? null : JSON.stringify(body);
    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              }
            : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (err) {
            reject(err);
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = data.error || `Form Forge request failed (${res.statusCode})`;
            const err = new Error(message);
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function canUseBundledFallback() {
  return (
    runtime.isVercel()
    || process.env.FORGE_BUNDLED_FALLBACK === '1'
    || process.env.NODE_ENV === 'production'
  );
}

function bundledRegistryExists() {
  try {
    const registryPath = path.join(config.FORGE_PATH, 'data', 'portal-registry.json');
    return fs.existsSync(registryPath);
  } catch (_) {
    return false;
  }
}

async function fetchForgeJson(pathname) {
  try {
    const data = await requestForge('GET', pathname);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return {
        ...data,
        registryStale: false,
        bundledFallback: false
      };
    }
    return data;
  } catch (err) {
    if (!canUseBundledFallback() || !bundledRegistryExists()) throw err;

    if (pathname === '/api/portal/cities/summary') {
      const items = bundledCitySummaries();
      return {
        total: items.length,
        items,
        registryStale: true,
        bundledFallback: true
      };
    }

    const cityMatch = pathname.match(/^\/api\/portal\/city\/([^/]+)$/);
    if (cityMatch) {
      const city = bundledCityDetail(decodeURIComponent(cityMatch[1]));
      if (!city) {
        const notFound = new Error('not found');
        notFound.statusCode = 404;
        throw notFound;
      }
      return {
        ...city,
        registryStale: true,
        bundledFallback: true
      };
    }

    throw err;
  }
}

async function postForgeJson(pathname, payload) {
  return requestForge('POST', pathname, payload);
}

module.exports = {
  fetchForgeJson,
  postForgeJson,
  bundledCitySummaries,
  bundledCityDetail,
  includeInCityTracker
};