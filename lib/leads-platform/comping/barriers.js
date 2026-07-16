/**
 * OSM Overpass road-barrier check — subject→comp path vs major highways.
 * Degrades to soft-fail when Overpass is unavailable (caller passes barrierUnavailable).
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT_MS = 3000;
const BBOX_PAD = 0.001;

const HIGHWAY_FILTER = '^(motorway|trunk|primary|motorway_link|trunk_link|primary_link)$';

/** @type {Map<string, { crossed: boolean, degraded: boolean, detail: string }>} */
const pairCache = new Map();

function clearBarrierCache() {
  pairCache.clear();
}

function pairKey(subject, candidate) {
  const sLat = Number(subject.lat);
  const sLng = Number(subject.lng);
  const cLat = Number(candidate.lat);
  const cLng = Number(candidate.lng);
  return `${sLat},${sLng}|${cLat},${cLng}`;
}

function boundingBox(subject, candidate) {
  const lats = [Number(subject.lat), Number(candidate.lat)];
  const lngs = [Number(subject.lng), Number(candidate.lng)];
  return {
    south: Math.min(...lats) - BBOX_PAD,
    west: Math.min(...lngs) - BBOX_PAD,
    north: Math.max(...lats) + BBOX_PAD,
    east: Math.max(...lngs) + BBOX_PAD,
  };
}

function buildOverpassQuery(bbox) {
  const { south, west, north, east } = bbox;
  return `[out:json][timeout:3];
(
  way["highway"~"${HIGHWAY_FILTER}"](${south},${west},${north},${east});
);
out geom;`;
}

function crossProduct(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = crossProduct(d1x, d1y, d2x, d2y);
  if (Math.abs(denom) < 1e-12) return false;

  const t = crossProduct(p3.x - p1.x, p3.y - p1.y, d2x, d2y) / denom;
  const u = crossProduct(p3.x - p1.x, p3.y - p1.y, d1x, d1y) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function toPoint(lat, lng) {
  return { x: lng, y: lat };
}

function pathCrossesWay(subject, candidate, geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return false;
  const a = toPoint(Number(subject.lat), Number(subject.lng));
  const b = toPoint(Number(candidate.lat), Number(candidate.lng));
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const g1 = geometry[i];
    const g2 = geometry[i + 1];
    const c = toPoint(Number(g1.lat), Number(g1.lon));
    const d = toPoint(Number(g2.lat), Number(g2.lon));
    if (segmentsIntersect(a, b, c, d)) return true;
  }
  return false;
}

function parseOverpassResponse(data, subject, candidate) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const highway = el.tags?.highway || 'highway';
    if (pathCrossesWay(subject, candidate, el.geometry)) {
      return {
        crossed: true,
        degraded: false,
        detail: `Major road/barrier crossed (${highway})`,
      };
    }
  }
  return {
    crossed: false,
    degraded: false,
    detail: 'No barrier detected',
  };
}

function degradedResult(detail = 'Barrier check unavailable — Overpass failed') {
  return { crossed: false, degraded: true, detail };
}

async function fetchOverpass(query, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkRoadBarrier(subject, candidate, opts = {}) {
  const sLat = Number(subject?.lat);
  const sLng = Number(subject?.lng);
  const cLat = Number(candidate?.lat);
  const cLng = Number(candidate?.lng);
  if (![sLat, sLng, cLat, cLng].every(Number.isFinite)) {
    return degradedResult('Barrier check unavailable — missing coordinates');
  }

  const key = pairKey(subject, candidate);
  if (pairCache.has(key)) {
    return pairCache.get(key);
  }

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    const result = degradedResult('Barrier check unavailable — fetch not supported');
    pairCache.set(key, result);
    return result;
  }

  try {
    const query = buildOverpassQuery(boundingBox(subject, candidate));
    const data = await fetchOverpass(query, fetchImpl);
    const result = parseOverpassResponse(data, subject, candidate);
    pairCache.set(key, result);
    return result;
  } catch {
    const result = degradedResult();
    pairCache.set(key, result);
    return result;
  }
}

module.exports = {
  checkRoadBarrier,
  clearBarrierCache,
  // exported for unit tests
  _internals: {
    boundingBox,
    buildOverpassQuery,
    pathCrossesWay,
    parseOverpassResponse,
  },
};
