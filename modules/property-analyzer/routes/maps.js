const https = require('https');
const fs = require('fs');

const SV_SIZE = '640x480';
const SV_FOV = 65;
const SV_RADIUS = 50;
const SAT_SIZE = '640x640';
const SAT_ZOOM = 20;
const MAPS_MAX_CONCURRENT = 12;
const GEOCODE_CACHE_MAX = 50000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_CACHE_MAX = 4000;
const IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let serverMapsKey = '';
let mapsActive = 0;
const mapsWaiters = [];
const geocodeCache = new Map();
const imageResponseCache = new Map();

function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function normalizeMapsKey(key) {
  let k = String(key || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  const aiZa = k.match(/AIza[A-Za-z0-9_-]{20,}/);
  if (aiZa) return aiZa[0];
  return k.replace(/\s+/g, '');
}

function loadServerMapsKey(MAPS_KEY_FILE) {
  if (process.env.MAPS_API_KEY) {
    serverMapsKey = normalizeMapsKey(process.env.MAPS_API_KEY);
    return serverMapsKey;
  }
  try {
    if (fs.existsSync(MAPS_KEY_FILE)) {
      serverMapsKey = normalizeMapsKey(fs.readFileSync(MAPS_KEY_FILE, 'utf8'));
    }
  } catch (_) {}
  return serverMapsKey;
}

function setServerMapsKey(key, MAPS_KEY_FILE) {
  const k = normalizeMapsKey(key);
  serverMapsKey = k;
  imageResponseCache.clear();
  try {
    if (k) fs.writeFileSync(MAPS_KEY_FILE, k, 'utf8');
    else if (fs.existsSync(MAPS_KEY_FILE)) fs.unlinkSync(MAPS_KEY_FILE);
  } catch (err) {
    console.warn('[Maps key] Could not persist maps-api-key.txt:', err.message);
  }
  return k;
}

function resolveMapsKey(queryKey) {
  const fromQuery = normalizeMapsKey(queryKey);
  if (fromQuery) return fromQuery;
  if (serverMapsKey) return serverMapsKey;
  return '';
}

function mapsKeyStatus(MAPS_KEY_FILE) {
  const k = serverMapsKey || loadServerMapsKey(MAPS_KEY_FILE);
  return {
    hasServerKey: !!k,
    keyTail: k.length >= 6 ? k.slice(-6) : null,
    keyLen: k.length || 0
  };
}

function getMapsQueueState() {
  return { active: mapsActive, waiting: mapsWaiters.length, maxConcurrent: MAPS_MAX_CONCURRENT };
}

function imageCacheGet(key) {
  const entry = imageResponseCache.get(key);
  if (!entry || Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
    imageResponseCache.delete(key);
    return null;
  }
  return entry;
}

function imageCacheSet(key, body, mimeType) {
  if (imageResponseCache.size >= IMAGE_CACHE_MAX) {
    const oldest = imageResponseCache.keys().next().value;
    imageResponseCache.delete(oldest);
  }
  imageResponseCache.set(key, { body, mimeType, at: Date.now() });
}

function parseImageSize(raw, fallback) {
  const s = String(raw || '').trim();
  return /^\d+x\d+$/.test(s) ? s : fallback;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    }).on('error', reject);
  });
}

function acquireMapsSlot() {
  return new Promise((resolve) => {
    if (mapsActive < MAPS_MAX_CONCURRENT) {
      mapsActive++;
      resolve();
    } else {
      mapsWaiters.push(resolve);
    }
  });
}

function releaseMapsSlot() {
  mapsActive = Math.max(0, mapsActive - 1);
  if (mapsWaiters.length && mapsActive < MAPS_MAX_CONCURRENT) {
    mapsActive++;
    const next = mapsWaiters.shift();
    next();
  }
}

async function httpsGetQueued(url) {
  await acquireMapsSlot();
  try {
    return await httpsGet(url);
  } finally {
    releaseMapsSlot();
  }
}

async function httpsGetWithRetry(url, { attempts = 3, baseDelayMs = 800 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await httpsGetQueued(url);
      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt < attempts - 1) {
          await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1) + Math.floor(Math.random() * 400)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Maps request failed');
}

function computeHeading(fromLat, fromLng, toLat, toLng) {
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function geocodeUrl(address, key) {
  return `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
}

function streetViewMetaUrl(location, key, opts = {}) {
  const params = new URLSearchParams({
    location,
    radius: String(opts.radius ?? SV_RADIUS),
    key
  });
  if (opts.source) params.set('source', opts.source);
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
}

function buildSatelliteImageUrl(lat, lng, key, size = SAT_SIZE) {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(SAT_ZOOM),
    size,
    maptype: 'satellite',
    key
  });
  params.append('markers', `color:red|size:mid|${lat},${lng}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function buildStreetViewImageUrl(location, key, opts = {}) {
  const params = new URLSearchParams({
    size: opts.size || SV_SIZE,
    location,
    key,
    return_error_code: 'true',
    radius: String(opts.radius ?? SV_RADIUS),
    fov: String(opts.fov || SV_FOV),
    pitch: String(opts.pitch != null ? opts.pitch : 0)
  });
  if (opts.source) params.set('source', opts.source);
  if (opts.heading != null) params.set('heading', String(opts.heading));
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

function buildStreetViewImageUrlFromPano(panoId, key, opts = {}) {
  const params = new URLSearchParams({
    size: opts.size || SV_SIZE,
    pano: panoId,
    key,
    return_error_code: 'true',
    fov: String(opts.fov || SV_FOV),
    pitch: String(opts.pitch != null ? opts.pitch : 0)
  });
  if (opts.heading != null) params.set('heading', String(opts.heading));
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

function buildStreetViewThumbUrl(address, key, size, query) {
  const fov = Number(query.get('fov')) || SV_FOV;
  const headingRaw = query.get('heading');
  const heading = headingRaw != null && headingRaw !== '' ? Number(headingRaw) : null;
  const pano = query.get('pano');
  const panoLat = query.get('panoLat');
  const panoLng = query.get('panoLng');
  const opts = { size, fov, heading };

  if (pano) return buildStreetViewImageUrlFromPano(pano, key, opts);
  if (panoLat && panoLng) {
    return buildStreetViewImageUrl(`${panoLat},${panoLng}`, key, opts);
  }
  return buildStreetViewImageUrl(address, key, opts);
}

function streetViewThumbCacheKey(address, size, query) {
  return [
    'svfast',
    address.toLowerCase(),
    size,
    query.get('pano') || '',
    query.get('panoLat') || '',
    query.get('panoLng') || '',
    query.get('heading') || '',
    query.get('fov') || ''
  ].join('|');
}

async function fetchProxiedGoogleImage(imageUrl, cacheKey) {
  const cached = imageCacheGet(cacheKey);
  if (cached) return { ok: true, body: cached.body, mimeType: cached.mimeType };

  const img = await httpsGetWithRetry(imageUrl);
  if (img.status !== 200) {
    return { ok: false, status: img.status, error: `Image HTTP ${img.status}` };
  }
  const mimeType = img.headers['content-type'] || 'image/jpeg';
  imageCacheSet(cacheKey, img.body, mimeType);
  return { ok: true, body: img.body, mimeType };
}

function sendImageResponse(res, body, mimeType) {
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=86400'
  });
  res.end(body);
}

function sendImageError(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(message || 'Image unavailable');
}

async function fetchStreetViewMetadata(location, key, opts = {}) {
  const metaRes = await httpsGetWithRetry(streetViewMetaUrl(location, key, opts));
  return JSON.parse(metaRes.body.toString());
}

function buildStreetViewLookupStrategies(address, geocoded) {
  const seen = new Set();
  const strategies = [];
  const add = (location, source, label) => {
    const loc = String(location || '').trim();
    if (!loc) return;
    const key = `${loc}|${source || 'default'}`;
    if (seen.has(key)) return;
    seen.add(key);
    strategies.push({ location: loc, source: source || null, label });
  };

  add(address, null, 'address');
  if (geocoded?.formatted && geocoded.formatted !== address) {
    add(geocoded.formatted, null, 'formatted_address');
  }
  if (geocoded) {
    add(`${geocoded.lat},${geocoded.lng}`, null, 'geocode_coords');
  }
  add(address, 'outdoor', 'address_outdoor');
  return strategies;
}

async function lookupStreetViewMetadata(address, geocoded, key) {
  const strategies = buildStreetViewLookupStrategies(address, geocoded);
  let lastMeta = { status: 'ZERO_RESULTS' };

  for (const strat of strategies) {
    const metaData = await fetchStreetViewMetadata(strat.location, key, { source: strat.source });
    lastMeta = metaData;
    if (metaData.status === 'OK' && metaData.location) {
      return { metaData, strategy: strat };
    }
    if (metaData.status === 'REQUEST_DENIED' || metaData.status === 'OVER_QUERY_LIMIT') {
      return { metaData, strategy: strat, fatal: true };
    }
  }

  return { metaData: lastMeta, strategy: null };
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function imageAgeYears(imageDate) {
  if (!imageDate) return null;
  const m = String(imageDate).match(/(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  return new Date().getFullYear() - year;
}

function buildQualityFlags(view, metaData) {
  const flags = [];
  if (!view?.geocoded) flags.push('geocode_failed');
  if (view?.targeting !== 'geocode_heading') flags.push('approximate_aim');
  if (view?.partialMatch) flags.push('partial_address_match');
  if (view?.locationType && view.locationType !== 'ROOFTOP') flags.push('approximate_geocode');
  if (view?.distanceMeters != null && view.distanceMeters > 35) flags.push('camera_far_from_parcel');
  const age = imageAgeYears(metaData?.date || view?.imageDate);
  if (age != null && age >= 4) flags.push('stale_streetview');
  return flags;
}

function buildStreetViewView(metaData, geocoded, strategy) {
  const panoLat = metaData.location.lat;
  const panoLng = metaData.location.lng;
  let heading = null;
  let distanceMeters = null;
  if (geocoded) {
    heading = Math.round(computeHeading(panoLat, panoLng, geocoded.lat, geocoded.lng) * 10) / 10;
    distanceMeters = Math.round(haversineMeters(panoLat, panoLng, geocoded.lat, geocoded.lng));
  }

  const view = {
    geocoded: !!geocoded,
    targeting: geocoded && heading != null ? 'geocode_heading' : (strategy?.label || 'address_default'),
    lookupStrategy: strategy?.label || null,
    heading,
    fov: SV_FOV,
    targetLat: geocoded?.lat ?? null,
    targetLng: geocoded?.lng ?? null,
    panoLat,
    panoLng,
    panoId: metaData.pano_id || null,
    distanceMeters,
    imageDate: metaData.date || null,
    locationType: geocoded?.locationType ?? null,
    partialMatch: geocoded?.partialMatch ?? false,
    formattedAddress: geocoded?.formatted ?? null
  };
  view.qualityFlags = buildQualityFlags(view, metaData);
  return view;
}

async function fetchStreetViewImageCandidates(metaData, view, address, geocoded, key, strategy) {
  const panoId = metaData.pano_id;
  const locationCandidates = [];
  const seen = new Set();
  const addLoc = (loc) => {
    const v = String(loc || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    locationCandidates.push(v);
  };

  addLoc(address);
  if (geocoded?.formatted) addLoc(geocoded.formatted);
  if (geocoded) addLoc(`${geocoded.lat},${geocoded.lng}`);
  if (strategy?.location) addLoc(strategy.location);

  const attempts = [];
  if (panoId && view.heading != null) {
    attempts.push({
      url: buildStreetViewImageUrlFromPano(panoId, key, { heading: view.heading, fov: SV_FOV }),
      label: 'pano_heading'
    });
  }
  if (panoId) {
    attempts.push({
      url: buildStreetViewImageUrlFromPano(panoId, key, { fov: SV_FOV }),
      label: 'pano_auto'
    });
  }
  for (const loc of locationCandidates) {
    if (view.heading != null) {
      attempts.push({
        url: buildStreetViewImageUrl(loc, key, { heading: view.heading, fov: SV_FOV, source: strategy?.source || null }),
        label: `location_heading_${loc.slice(0, 24)}`
      });
    }
    attempts.push({
      url: buildStreetViewImageUrl(loc, key, { source: strategy?.source || null }),
      label: `location_auto_${loc.slice(0, 24)}`
    });
  }

  const deduped = [];
  const urlSeen = new Set();
  for (const attempt of attempts) {
    if (urlSeen.has(attempt.url)) continue;
    urlSeen.add(attempt.url);
    deduped.push(attempt);
  }

  for (const attempt of deduped) {
    const img = await httpsGetWithRetry(attempt.url);
    if (img.status === 200) {
      return { ok: true, img, imageStrategy: attempt.label };
    }
  }

  return { ok: false, lastStatus: 404 };
}

function pickGeocodeResult(results) {
  if (!results?.length) return null;
  const rooftop = results.find(r => r.geometry?.location_type === 'ROOFTOP');
  const range = results.find(r => r.geometry?.location_type === 'RANGE_INTERPOLATED');
  const chosen = rooftop || range || results[0];
  const loc = chosen.geometry.location;
  return {
    lat: loc.lat,
    lng: loc.lng,
    formatted: chosen.formatted_address,
    locationType: chosen.geometry.location_type || 'UNKNOWN',
    partialMatch: !!chosen.partial_match
  };
}

function geocodeCacheGet(address) {
  const cacheKey = address.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (!cached || Date.now() - cached.ts > GEOCODE_CACHE_TTL_MS) return null;
  return cached.data;
}

function geocodeCacheSet(address, data) {
  const cacheKey = address.trim().toLowerCase();
  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest) geocodeCache.delete(oldest);
  }
  geocodeCache.set(cacheKey, { data, ts: Date.now() });
}

async function geocodeAddress(address, key) {
  const cached = geocodeCacheGet(address);
  if (cached) return cached;
  try {
    const res = await httpsGetWithRetry(geocodeUrl(address, key));
    const data = JSON.parse(res.body.toString());
    if (data.status === 'OK') {
      const result = pickGeocodeResult(data.results);
      if (result) geocodeCacheSet(address, result);
      return result;
    }
  } catch (_) { /* fall back to address string */ }
  return null;
}

function streetViewHint(metaData, imgStatus) {
  if (imgStatus !== 403 && metaData?.status !== 'REQUEST_DENIED') return '';
  const err = (metaData?.error_message || '').toLowerCase();
  if (err.includes('invalid') && err.includes('api key')) {
    return 'This key is invalid or from the wrong project. Create a NEW key in Google Cloud Console (Credentials) and paste it here — then click "Clear saved keys" first so the old one is gone.';
  }
  if (err.includes('referrer') || err.includes('browser') || err.includes('http')) {
    return 'Application restrictions = NONE. "HTTP referrers (websites)" always causes 403 because this tool fetches images from your PC, not a website.';
  }
  if (err.includes('ip address') || err.includes('ip ')) {
    return 'Application restrictions = NONE, or add your PC\'s public IP. Easiest fix: set Application restrictions to "None".';
  }
  if (err.includes('billing') || err.includes('payment')) {
    return 'Enable billing on this Google Cloud project: console.cloud.google.com/billing';
  }
  if (err.includes('not authorized') || err.includes('enable') || err.includes('activated') || err.includes('api has not been used')) {
    return 'Enable "Street View Static API" in API Library, then finish Maps setup at console.cloud.google.com/google/maps-apis/start';
  }
  if (err.includes('api key is not authorized') || err.includes('restrict')) {
    return 'API restrictions: either "Don\'t restrict key" OR include "Street View Static API" in the allowed list.';
  }
  return 'Checklist: (1) Application restrictions = None (2) Enable Street View Static API (3) Billing on (4) Finish Maps onboarding at console.cloud.google.com/google/maps-apis/start (5) Paste NEW key and click "Clear saved keys"';
}

function createMapsHelpers(imageryCache) {
  async function resolveSatellite(address, key, opts = {}) {
    const geocoded = await geocodeAddress(address, key);
    if (!geocoded) {
      return { ok: false, error: 'Could not geocode address for satellite view', geocoded: null };
    }
    const size = parseImageSize(opts.size, SAT_SIZE);
    const imageUrl = buildSatelliteImageUrl(geocoded.lat, geocoded.lng, key, size);
    const img = await httpsGetWithRetry(imageUrl);
    if (img.status !== 200) {
      return {
        ok: false,
        error: img.status === 403
          ? 'Static Maps API denied — enable Static Maps API on this key'
          : `Satellite HTTP ${img.status}`,
        geocoded,
        imageStatus: img.status,
        hint: img.status === 403
          ? 'Enable "Maps Static API" in Google Cloud API Library (same key as Street View).'
          : ''
      };
    }
    const mimeType = img.headers['content-type'] || 'image/png';
    const cached = imageryCache.saveImageryBuffer(address, 'satellite', img.body, mimeType, {
      viewMeta: {
        targetLat: geocoded.lat,
        targetLng: geocoded.lng,
        formattedAddress: geocoded.formatted
      },
      source: 'google_fetch'
    });

    return {
      ok: true,
      imageUrl,
      body: img.body,
      base64: img.body.toString('base64'),
      mimeType,
      geocoded: {
        lat: geocoded.lat,
        lng: geocoded.lng,
        formatted: geocoded.formatted,
        locationType: geocoded.locationType,
        partialMatch: geocoded.partialMatch
      },
      cachedUrl: cached.ok ? cached.url : null,
      imagery: imageryCache.buildImageryRecord(address)
    };
  }

  async function fetchStreetViewPayload(address, key) {
    const geocoded = await geocodeAddress(address, key);
    const lookup = await lookupStreetViewMetadata(address, geocoded, key);
    const { metaData, strategy, fatal } = lookup;

    if (metaData.status === 'REQUEST_DENIED' || metaData.status === 'OVER_QUERY_LIMIT' || fatal) {
      const hint = streetViewHint(metaData, metaData.status === 'OVER_QUERY_LIMIT' ? 429 : 403);
      const googleErr = metaData.error_message || metaData.status;
      return {
        ok: false,
        error: metaData.status === 'OVER_QUERY_LIMIT'
          ? 'Street View rate limit — slow down workers and retry'
          : `Street View HTTP 403: ${googleErr}`,
        hint,
        googleError: googleErr,
        metaStatus: metaData.status,
        view: { geocoded: !!geocoded, targeting: 'denied', lookupStrategy: strategy?.label || null },
        unavailable: false
      };
    }

    if (metaData.status !== 'OK' || !metaData.location) {
      console.error(`[Street View] NOT FOUND ${address?.slice(0, 60)} — tried ${buildStreetViewLookupStrategies(address, geocoded).length} lookup strategies`);
      imageryCache.markImageryUnavailable(address, 'streetview', 'No Street View panorama for this address');
      return {
        ok: false,
        error: 'No Street View photo for this address',
        hint: 'Google has no panorama within 50m of this address after multiple lookup methods.',
        googleError: null,
        metaStatus: metaData.status,
        view: { geocoded: !!geocoded, targeting: 'not_found' },
        unavailable: true,
        imagery: imageryCache.buildImageryRecord(address)
      };
    }

    const view = buildStreetViewView(metaData, geocoded, strategy);
    const imageResult = await fetchStreetViewImageCandidates(metaData, view, address, geocoded, key, strategy);

    if (!imageResult.ok) {
      const hint = streetViewHint(metaData, 404);
      console.error(`[Street View] IMAGE FAIL ${address?.slice(0, 60)} — metadata OK but image 404 (pano=${metaData.pano_id || 'none'})`);
      return {
        ok: false,
        error: 'Street View metadata found but image fetch failed — retry',
        hint,
        googleError: null,
        metaStatus: metaData.status,
        view,
        unavailable: false
      };
    }

    view.imageStrategy = imageResult.imageStrategy;
    console.log(`[Street View] OK ${address?.slice(0, 60)} — ${strategy?.label || 'unknown'} / ${imageResult.imageStrategy}${view.distanceMeters != null ? ` (${view.distanceMeters}m)` : ''}`);

    const mimeType = imageResult.img.headers['content-type'] || 'image/jpeg';
    const cached = imageryCache.saveImageryBuffer(address, 'streetview', imageResult.img.body, mimeType, {
      viewMeta: view,
      source: 'google_fetch'
    });

    return {
      ok: true,
      base64: imageResult.img.body.toString('base64'),
      mimeType,
      view,
      meta: metaData,
      cachedUrl: cached.ok ? cached.url : null,
      imagery: imageryCache.buildImageryRecord(address)
    };
  }

  async function fetchStreetViewFromViewMeta(address, key, viewMeta) {
    if (!address || !key || !viewMeta) return null;
    const size = SV_SIZE;
    const params = new URLSearchParams({ address, size, fast: '1' });
    if (viewMeta.panoId) params.set('pano', viewMeta.panoId);
    if (viewMeta.panoLat != null) params.set('panoLat', String(viewMeta.panoLat));
    if (viewMeta.panoLng != null) params.set('panoLng', String(viewMeta.panoLng));
    if (viewMeta.heading != null) params.set('heading', String(viewMeta.heading));
    if (viewMeta.fov != null) params.set('fov', String(viewMeta.fov));
    const cacheKey = streetViewThumbCacheKey(address, size, params);
    const imageUrl = buildStreetViewThumbUrl(address, key, size, params);
    const proxied = await fetchProxiedGoogleImage(imageUrl, cacheKey);
    if (!proxied.ok) {
      return {
        ok: false,
        unavailable: proxied.status === 404,
        error: proxied.error || 'Street View image fetch failed'
      };
    }
    const cached = imageryCache.saveImageryBuffer(address, 'streetview', proxied.body, proxied.mimeType, {
      viewMeta,
      source: 'viewmeta_fast'
    });
    return {
      ok: true,
      cachedUrl: cached.ok ? cached.url : null,
      imagery: imageryCache.buildImageryRecord(address)
    };
  }

  return { resolveSatellite, fetchStreetViewPayload, fetchStreetViewFromViewMeta };
}

function register(ctx) {
  const { router, sendJson, imageryCache, apiStats } = ctx;
  const helpers = createMapsHelpers(imageryCache);

  ctx.resolveMapsKey = resolveMapsKey;
  ctx.resolveSatellite = helpers.resolveSatellite;
  ctx.fetchStreetViewPayload = helpers.fetchStreetViewPayload;
  ctx.fetchStreetViewFromViewMeta = helpers.fetchStreetViewFromViewMeta;
  ctx.parseImageSize = parseImageSize;
  ctx.sendImageResponse = sendImageResponse;
  ctx.sendImageError = sendImageError;

  router.get('/api/test-streetview', async (req, res, url) => {
    const address = url.searchParams.get('address') || '1600 Amphitheatre Parkway, Mountain View, CA 94043';
    const key = resolveMapsKey(url.searchParams.get('key'));
    if (!key) {
      sendJson(res, 400, { ok: false, error: 'Missing Street View API key — paste it in Settings or save maps-api-key.txt next to server.js' });
      return true;
    }

    const sv = await helpers.fetchStreetViewPayload(address, key);

    sendJson(res, 200, {
      ok: sv.ok,
      meta: sv.meta || null,
      imageStatus: sv.ok ? 200 : (sv.unavailable ? 404 : 502),
      hint: sv.hint || null,
      googleError: sv.googleError || null,
      view: sv.view || null,
      lookupStrategy: sv.view?.lookupStrategy || null,
      imageStrategy: sv.view?.imageStrategy || null,
      testAddress: address,
      error: sv.ok ? null : sv.error
    });
    return true;
  });

  router.get('/api/sv-image', async (req, res, url) => {
    const address = url.searchParams.get('address');
    const key = resolveMapsKey(url.searchParams.get('key'));
    const size = parseImageSize(url.searchParams.get('size'), SV_SIZE);
    if (!address || !key) {
      sendJson(res, 400, { ok: false, error: 'Missing address or Maps API key' });
      return true;
    }

    const cachedFile = imageryCache.readCachedByAddress(address, 'streetview');
    if (cachedFile) {
      sendImageResponse(res, cachedFile.body, cachedFile.mimeType);
      return true;
    }

    const fast = url.searchParams.get('fast') === '1'
      || url.searchParams.has('pano')
      || url.searchParams.has('panoLat')
      || url.searchParams.has('heading');
    if (fast) {
      const cacheKey = streetViewThumbCacheKey(address, size, url.searchParams);
      const cached = imageCacheGet(cacheKey);
      if (cached) {
        sendImageResponse(res, cached.body, cached.mimeType);
        return true;
      }
      const imageUrl = buildStreetViewThumbUrl(address, key, size, url.searchParams);
      const proxied = await fetchProxiedGoogleImage(imageUrl, cacheKey);
      if (!proxied.ok) {
        sendImageError(res, proxied.status === 403 ? 403 : 404, proxied.error);
        return true;
      }
      sendImageResponse(res, proxied.body, proxied.mimeType);
      return true;
    }

    const cacheKey = `sv:${address.toLowerCase()}|${size}`;
    const cached = imageCacheGet(cacheKey);
    if (cached) {
      sendImageResponse(res, cached.body, cached.mimeType);
      return true;
    }

    const sv = await helpers.fetchStreetViewPayload(address, key);
    if (!sv.ok) {
      sendImageError(res, sv.unavailable ? 404 : 502, sv.error);
      return true;
    }
    const body = Buffer.from(sv.base64, 'base64');
    const mimeType = sv.mimeType || 'image/jpeg';
    imageCacheSet(cacheKey, body, mimeType);
    sendImageResponse(res, body, mimeType);
    return true;
  });

  router.get('/api/satellite-image', async (req, res, url) => {
    const address = url.searchParams.get('address');
    const key = resolveMapsKey(url.searchParams.get('key'));
    const size = parseImageSize(url.searchParams.get('size'), SAT_SIZE);
    if (!address || !key) {
      sendJson(res, 400, { ok: false, error: 'Missing address or Maps API key' });
      return true;
    }

    const cachedSatFile = imageryCache.readCachedByAddress(address, 'satellite');
    if (cachedSatFile) {
      sendImageResponse(res, cachedSatFile.body, cachedSatFile.mimeType);
      return true;
    }

    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    if (lat && lng) {
      const cacheKey = `satfast:${lat},${lng}|${size}`;
      const cached = imageCacheGet(cacheKey);
      if (cached) {
        sendImageResponse(res, cached.body, cached.mimeType);
        return true;
      }
      const imageUrl = buildSatelliteImageUrl(Number(lat), Number(lng), key, size);
      const proxied = await fetchProxiedGoogleImage(imageUrl, cacheKey);
      if (!proxied.ok) {
        sendImageError(res, proxied.status === 403 ? 403 : 404, proxied.error);
        return true;
      }
      sendImageResponse(res, proxied.body, proxied.mimeType);
      return true;
    }

    const cacheKey = `sat:${address.toLowerCase()}|${size}`;
    const cached = imageCacheGet(cacheKey);
    if (cached) {
      sendImageResponse(res, cached.body, cached.mimeType);
      return true;
    }

    const result = await helpers.resolveSatellite(address, key, { size });
    if (!result.ok) {
      sendImageError(res, result.imageStatus === 403 ? 403 : 404, result.error);
      return true;
    }
    imageCacheSet(cacheKey, result.body, result.mimeType);
    sendImageResponse(res, result.body, result.mimeType);
    return true;
  });

  router.get('/api/satellite-base64', async (req, res, url) => {
    const address = url.searchParams.get('address');
    const key = resolveMapsKey(url.searchParams.get('key'));
    if (!address || !key) {
      sendJson(res, 400, { ok: false, error: 'Missing address or Maps API key' });
      return true;
    }

    const result = await helpers.resolveSatellite(address, key);
    if (!result.ok) {
      sendJson(res, 200, {
        ok: false,
        error: result.error,
        hint: result.hint || null,
        geocoded: result.geocoded || null
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      base64: result.base64,
      mimeType: result.mimeType,
      geocoded: result.geocoded
    });
    return true;
  });

  router.get('/api/sv-base64', async (req, res, url) => {
    const address = url.searchParams.get('address');
    const key = resolveMapsKey(url.searchParams.get('key'));
    if (!address || !key) {
      sendJson(res, 400, { ok: false, error: 'Missing address or Maps API key' });
      return true;
    }

    const sv = await helpers.fetchStreetViewPayload(address, key);
    if (!sv.ok) {
      apiStats.streetViewFail++;
      console.error(`[Street View] FAIL ${address?.slice(0, 60)} — ${sv.error}`);
    } else {
      apiStats.streetViewOk++;
    }
    sendJson(res, 200, sv);
    return true;
  });

  router.get('/api/property-imagery', async (req, res, url) => {
    const address = url.searchParams.get('address');
    const key = resolveMapsKey(url.searchParams.get('key'));
    if (!address || !key) {
      sendJson(res, 400, { ok: false, error: 'Missing address or Maps API key' });
      return true;
    }

    const [satSettled, svSettled] = await Promise.allSettled([
      helpers.resolveSatellite(address, key),
      helpers.fetchStreetViewPayload(address, key)
    ]);

    let satellite = null;
    if (satSettled.status === 'fulfilled') {
      const result = satSettled.value;
      if (result.ok) {
        satellite = {
          ok: true,
          base64: result.base64,
          mimeType: result.mimeType,
          geocoded: result.geocoded
        };
      } else {
        satellite = { ok: false, error: result.error, hint: result.hint || null, geocoded: result.geocoded || null };
      }
    } else {
      satellite = { ok: false, error: satSettled.reason?.message || 'Satellite failed' };
    }

    let streetView = null;
    if (svSettled.status === 'fulfilled') {
      streetView = svSettled.value;
    } else {
      streetView = { ok: false, error: svSettled.reason?.message || 'Street View failed' };
    }

    sendJson(res, 200, { ok: true, satellite, streetView });
    return true;
  });
}

module.exports = {
  register,
  loadServerMapsKey,
  mapsKeyStatus,
  getMapsQueueState,
  MAPS_MAX_CONCURRENT
};