const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_STATIC = 'public, max-age=86400';
const CACHE_NONE = 'no-store, no-cache, must-revalidate';

function cacheControlForExt(ext) {
  const normalized = String(ext || '').toLowerCase();
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff2', '.mp4', '.webm'].includes(normalized)) {
    return CACHE_IMMUTABLE;
  }
  if (['.css', '.js'].includes(normalized)) {
    return CACHE_STATIC;
  }
  return CACHE_NONE;
}

module.exports = {
  CACHE_IMMUTABLE,
  CACHE_STATIC,
  CACHE_NONE,
  cacheControlForExt
};