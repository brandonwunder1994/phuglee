/**
 * Server-only RealEstateAPI client — PropertyDetail, PropertyComps, PropertySearch.
 * Never use estimatedValue / AVM as ARV; mapping exposes sold prices only.
 */

const DEFAULT_BASE = 'https://api.realestateapi.com';

async function post(base, key, path, body, fetchImpl) {
  const res = await fetchImpl(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || json.statusMessage || `REAPI ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function normalizePropertyType(raw) {
  const t = String(raw || 'sfr').toLowerCase();
  if (t === 'sfr' || t === 'single family' || t === 'single_family') return 'sfr';
  return t;
}

function mapReapiComp(raw) {
  const price = Number(raw.lastSaleAmount ?? raw.price) || 0;
  const distanceRaw = raw.distance ?? raw.distanceMi;
  return {
    id: raw.id || raw.propertyId || raw.reapiId,
    price,
    unusable: price <= 0,
    soldDate: raw.lastSaleDate || raw.soldDate || raw.closeDate,
    sqft: Number(raw.squareFeet ?? raw.sqft) || 0,
    beds: Number(raw.bedrooms ?? raw.beds) || 0,
    baths: Number(raw.bathrooms ?? raw.baths) || 0,
    lat: Number(raw.latitude ?? raw.lat) || null,
    lng: Number(raw.longitude ?? raw.lng) || null,
    address: raw.address || raw.fullAddress || raw.streetAddress,
    distanceMi: distanceRaw != null ? Number(distanceRaw) : null,
    cashBuyer: Boolean(raw.cashBuyer || raw.lastSaleCashBuyer),
    priorSaleDate: raw.priorSaleDate || raw.previousSaleDate,
    yearBuilt: Number(raw.yearBuilt) || 0,
    propertyType: normalizePropertyType(raw.propertyType || raw.landUse),
    garage: Number(raw.garage ?? raw.garageSpaces) || 0,
    lotSqft: Number(raw.lotSquareFeet ?? raw.lotSqft) || 0,
    soldViaMls: Boolean(raw.soldViaMls || raw.mlsSold),
    mlsHasPhotos: Boolean(raw.mlsHasPhotos),
    distressed: Boolean(raw.distressed || raw.asIs),
    source: 'reapi',
  };
}

function mapReapiCompsResponse(response) {
  const list = response?.comps
    ?? response?.data?.comps
    ?? (Array.isArray(response?.data) ? response.data : []);
  if (!Array.isArray(list)) return [];
  return list.map(mapReapiComp);
}

function mapReapiDetail(response) {
  const raw = response?.data ?? response?.property ?? response ?? {};
  return {
    id: raw.id || raw.propertyId,
    sqft: Number(raw.squareFeet ?? raw.sqft) || 0,
    beds: Number(raw.bedrooms ?? raw.beds) || 0,
    baths: Number(raw.bathrooms ?? raw.baths) || 0,
    yearBuilt: Number(raw.yearBuilt) || 0,
    lat: Number(raw.latitude ?? raw.lat) || null,
    lng: Number(raw.longitude ?? raw.lng) || null,
    garage: Number(raw.garage ?? raw.garageSpaces) || 0,
    propertyType: normalizePropertyType(raw.propertyType || raw.landUse),
    estimatedValue: Number(raw.estimatedValue ?? raw.avm) || null,
    newConstructionCeiling: Number(raw.newConstructionValue ?? raw.newConstructionCeiling) || null,
    address: raw.address || raw.fullAddress,
  };
}

function createReapiClient({ apiKey, baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) {
    throw new Error('REALESTATE_API_KEY is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required');
  }

  return {
    async propertyDetail(body) {
      const json = await post(baseUrl, apiKey, '/v2/PropertyDetail', body, fetchImpl);
      return mapReapiDetail(json);
    },

    async propertyComps(body) {
      try {
        return await post(baseUrl, apiKey, '/v3/PropertyComps', body, fetchImpl);
      } catch (err) {
        if (err.status === 404 || err.status === 400 || err.status === 405) {
          return post(baseUrl, apiKey, '/v2/PropertyComps', body, fetchImpl);
        }
        throw err;
      }
    },

    async propertySearch(body) {
      return post(baseUrl, apiKey, '/v2/PropertySearch', body, fetchImpl);
    },
  };
}

module.exports = {
  createReapiClient,
  mapReapiComp,
  mapReapiCompsResponse,
  mapReapiDetail,
};
