/**
 * Resolve Street View / satellite URLs for Vault from:
 * 1) Analyzer permanent imagery disk cache (file must exist)
 * 2) Saved viewMeta (panoId/heading) → live /analyzer/api/sv-image proxy
 * 3) Address-only live /analyzer/api/sv-image proxy
 *
 * Vault runs at site root, so Analyzer /api/* paths must be prefixed with /analyzer.
 */

const ANALYZER_API_PREFIX = '/analyzer';
const SV_SIZE = '640x640';
const CACHED_IMAGERY_RE = /\/(?:analyzer\/)?api\/cached-imagery\/(streetview|satellite)\/([a-f0-9]{16}\.(?:jpg|jpeg|png|webp))/i;

let imageryCache;

function getImageryCache() {
  if (!imageryCache) {
    try {
      imageryCache = require('../../modules/property-analyzer/imagery-cache');
    } catch (_) {
      imageryCache = null;
    }
  }
  return imageryCache;
}

/** Rewrite Analyzer-relative /api/... imagery URLs so Vault <img> can load them. */
function vaultImageryUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('/api/')) return `${ANALYZER_API_PREFIX}${u}`;
  return u;
}

function parseCachedImageryUrl(url) {
  const m = String(url || '').match(CACHED_IMAGERY_RE);
  if (!m) return null;
  return { type: m[1].toLowerCase(), filename: m[2].toLowerCase() };
}

function cachedImageryFileExists(url) {
  const parsed = parseCachedImageryUrl(url);
  if (!parsed) return false;
  const cache = getImageryCache();
  if (!cache?.readCachedFile) return false;
  return !!cache.readCachedFile(parsed.type, parsed.filename);
}

function formatLeadAddress(leadLike = {}) {
  const street = String(leadLike.address || leadLike.street || '').trim();
  const city = String(leadLike.city || '').trim();
  const state = String(leadLike.state || '').trim();
  return [street, city, state].filter(Boolean).join(', ');
}

function buildLiveStreetViewProxyUrl(address, viewMeta) {
  const addr = String(address || '').trim();
  if (!addr) return '';

  const q = new URLSearchParams({
    address: addr,
    size: SV_SIZE,
    fast: '1'
  });

  const meta = viewMeta && typeof viewMeta === 'object' ? viewMeta : null;
  if (meta?.panoId) {
    q.set('pano', String(meta.panoId));
    if (meta.heading != null && meta.heading !== '') q.set('heading', String(meta.heading));
    if (meta.fov != null && meta.fov !== '') q.set('fov', String(meta.fov));
    if (meta.panoLat != null && meta.panoLat !== '') q.set('panoLat', String(meta.panoLat));
    if (meta.panoLng != null && meta.panoLng !== '') q.set('panoLng', String(meta.panoLng));
  }

  return `${ANALYZER_API_PREFIX}/api/sv-image?${q.toString()}`;
}

function buildStreetViewProxyUrlFromViewMeta(address, viewMeta) {
  const meta = viewMeta && typeof viewMeta === 'object' ? viewMeta : null;
  if (!meta?.panoId) return '';
  return buildLiveStreetViewProxyUrl(address, meta);
}

/**
 * Keep usable cached URLs; replace dead cached paths with a working disk hit or live proxy.
 */
function ensureUsableStreetViewUrl(url, leadLike = {}, viewMeta = null) {
  const raw = vaultImageryUrl(url);
  if (raw && !parseCachedImageryUrl(raw)) return raw;
  if (raw && cachedImageryFileExists(raw)) return raw;

  const street = String(leadLike.address || leadLike.street || '').trim();
  const full = formatLeadAddress(leadLike) || street;
  const cached = resolveCachedImageryForLead({
    address: street,
    city: leadLike.city,
    state: leadLike.state
  });
  if (cached.streetViewUrl && cachedImageryFileExists(cached.streetViewUrl)) {
    return cached.streetViewUrl;
  }

  return buildStreetViewProxyUrlFromViewMeta(full || street, viewMeta || leadLike.viewMeta)
    || buildLiveStreetViewProxyUrl(full || street, viewMeta || leadLike.viewMeta);
}

function resolveCachedImageryForLead(leadLike = {}) {
  const cache = getImageryCache();
  if (!cache) return { streetViewUrl: '', satelliteUrl: '' };

  const street = String(leadLike.address || leadLike.street || '').trim();
  const city = String(leadLike.city || '').trim();
  const state = String(leadLike.state || '').trim();
  const candidates = [
    street,
    [street, city, state].filter(Boolean).join(', '),
    [street, city].filter(Boolean).join(', ')
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const addr of candidates) {
    const streetViewUrl = vaultImageryUrl(cache.getCachedUrl(addr, 'streetview') || '');
    const satelliteUrl = vaultImageryUrl(cache.getCachedUrl(addr, 'satellite') || '');
    if (streetViewUrl || satelliteUrl) {
      return { streetViewUrl, satelliteUrl };
    }
  }
  return { streetViewUrl: '', satelliteUrl: '' };
}

/**
 * Prefer persisted URL / disk cache (verified on disk), then rebuild from viewMeta / live proxy.
 */
function resolveImageryForAnalyzerResult(r = {}) {
  const address = String(r.street || r.address || '').trim();
  const fullAddress = [address, r.city, r.state].filter(Boolean).join(', ');
  const leadLike = { address, city: r.city, state: r.state, viewMeta: r.viewMeta };

  let streetViewUrl = ensureUsableStreetViewUrl(
    r.imagery?.streetView?.url || r.streetViewUrl || r.streetView || '',
    leadLike,
    r.viewMeta
  );

  let satelliteUrl = vaultImageryUrl(
    r.imagery?.satellite?.url || r.satelliteUrl || r.satellite || ''
  );
  if (satelliteUrl && parseCachedImageryUrl(satelliteUrl) && !cachedImageryFileExists(satelliteUrl)) {
    satelliteUrl = '';
  }

  if (!streetViewUrl || !satelliteUrl) {
    const cached = resolveCachedImageryForLead(leadLike);
    streetViewUrl = streetViewUrl || cached.streetViewUrl || '';
    satelliteUrl = satelliteUrl || cached.satelliteUrl || '';
  }

  if (!streetViewUrl) {
    streetViewUrl = buildStreetViewProxyUrlFromViewMeta(fullAddress || address, r.viewMeta)
      || buildLiveStreetViewProxyUrl(fullAddress || address, r.viewMeta);
  }

  return { streetViewUrl, satelliteUrl };
}

module.exports = {
  ANALYZER_API_PREFIX,
  vaultImageryUrl,
  parseCachedImageryUrl,
  cachedImageryFileExists,
  buildLiveStreetViewProxyUrl,
  buildStreetViewProxyUrlFromViewMeta,
  ensureUsableStreetViewUrl,
  resolveCachedImageryForLead,
  resolveImageryForAnalyzerResult,
  formatLeadAddress
};
