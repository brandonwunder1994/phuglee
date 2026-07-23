'use strict';

/**
 * Giphy search/trending for internal team chat GIF picker.
 * Discord-like: rating=r (most permissive Giphy allows — crude/meme-friendly).
 * Tenor public API was shut down mid-2026; Giphy is the viable replacement.
 */

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

function apiKey() {
  return String(process.env.GIPHY_API_KEY || process.env.GIPHY_KEY || '').trim();
}

function isConfigured() {
  return Boolean(apiKey());
}

function mapItem(item) {
  if (!item || typeof item !== 'object') return null;
  const images = item.images || {};
  // Send: animated mid-size for chat bubbles (full motion).
  const send =
    images.fixed_width
    || images.downsized_medium
    || images.fixed_height
    || images.downsized
    || images.original;
  // Grid: animated small preview (like Giphy site) — not still frames.
  const preview =
    images.fixed_height_small
    || images.fixed_width_small
    || images.preview_gif
    || images.fixed_height
    || images.fixed_width
    || send;
  const pickUrl = (media) => String(media?.url || media?.webp || '').trim();
  const url = pickUrl(send);
  if (!url) return null;
  return {
    id: String(item.id || '').trim(),
    title: String(item.title || item.slug || '').trim().slice(0, 160),
    url,
    previewUrl: pickUrl(preview) || url,
    width: Number(preview?.width || send?.width) || 0,
    height: Number(preview?.height || send?.height) || 0,
    provider: 'giphy'
  };
}

async function giphyGet(pathname, params = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error('GIPHY_API_KEY is not configured');
    err.code = 'GIPHY_NOT_CONFIGURED';
    throw err;
  }
  const qs = new URLSearchParams({
    api_key: key,
    // R = maximum edginess Giphy exposes (includes crude / adult-humor memes).
    // Omit would also return all ratings; r is explicit for Discord-like desk chat.
    rating: 'r',
    lang: 'en',
    ...params
  });
  const url = `${GIPHY_BASE}${pathname}?${qs.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.meta?.msg || json?.message || `Giphy HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = 'GIPHY_ERROR';
    err.status = res.status;
    throw err;
  }
  const data = Array.isArray(json.data) ? json.data : [];
  const results = data.map(mapItem).filter(Boolean);
  return {
    results,
    pagination: {
      total: Number(json.pagination?.total_count) || results.length,
      count: Number(json.pagination?.count) || results.length,
      offset: Number(json.pagination?.offset) || 0
    }
  };
}

async function searchGifs(q, { limit = 30, offset = 0 } = {}) {
  const query = String(q || '').trim().slice(0, 50);
  if (!query) {
    return trendingGifs({ limit, offset });
  }
  return giphyGet('/search', {
    q: query,
    limit: String(Math.min(50, Math.max(1, Number(limit) || 30))),
    offset: String(Math.max(0, Number(offset) || 0))
  });
}

async function trendingGifs({ limit = 30, offset = 0 } = {}) {
  return giphyGet('/trending', {
    limit: String(Math.min(50, Math.max(1, Number(limit) || 30))),
    offset: String(Math.max(0, Number(offset) || 0))
  });
}

module.exports = {
  isConfigured,
  searchGifs,
  trendingGifs,
  mapItem
};
