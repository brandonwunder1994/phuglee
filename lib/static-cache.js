const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_STATIC = 'public, max-age=86400';
/* Versioned CSS/JS (?v=) — short revalidate so deploys are visible without 24h wait */
const CACHE_VERSIONED = 'public, max-age=120, must-revalidate';
/* State boundaries change rarely — long cache helps Command/Home maps */
const CACHE_GEOJSON = 'public, max-age=604800';
/* Public /data/*.json (coverage bootstrap etc.) — short revalidate, not no-store */
const CACHE_DATA_JSON = 'public, max-age=300, must-revalidate';
const CACHE_NONE = 'no-store, no-cache, must-revalidate';

function pathOnly(urlPath) {
  const raw = String(urlPath || '');
  const q = raw.indexOf('?');
  const noQuery = q >= 0 ? raw.slice(0, q) : raw;
  // req.url is typically path-only; tolerate accidental full URLs
  try {
    if (/^https?:\/\//i.test(noQuery)) {
      return new URL(noQuery).pathname;
    }
  } catch (_) {}
  return noQuery;
}

function cacheControlForExt(ext, urlPath) {
  const normalized = String(ext || '').toLowerCase();
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff2', '.mp4', '.webm'].includes(normalized)) {
    return CACHE_IMMUTABLE;
  }
  if (['.css', '.js'].includes(normalized)) {
    // Query version present → short cache so Railway deploys punch through browsers
    if (urlPath && /[?&]v=/.test(String(urlPath))) {
      return CACHE_VERSIONED;
    }
    return CACHE_STATIC;
  }
  if (normalized === '.geojson') {
    return CACHE_GEOJSON;
  }
  if (normalized === '.json') {
    const p = pathOnly(urlPath);
    if (p === '/data' || p.indexOf('/data/') === 0) {
      return CACHE_DATA_JSON;
    }
    return CACHE_NONE;
  }
  return CACHE_NONE;
}

module.exports = {
  CACHE_IMMUTABLE,
  CACHE_STATIC,
  CACHE_VERSIONED,
  CACHE_GEOJSON,
  CACHE_DATA_JSON,
  CACHE_NONE,
  cacheControlForExt
};
