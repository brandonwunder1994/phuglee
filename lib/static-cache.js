const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_STATIC = 'public, max-age=86400';
/* Versioned CSS/JS (?v=) — short revalidate so deploys are visible without 24h wait */
const CACHE_VERSIONED = 'public, max-age=120, must-revalidate';
const CACHE_NONE = 'no-store, no-cache, must-revalidate';

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
  return CACHE_NONE;
}

module.exports = {
  CACHE_IMMUTABLE,
  CACHE_STATIC,
  CACHE_VERSIONED,
  CACHE_NONE,
  cacheControlForExt
};