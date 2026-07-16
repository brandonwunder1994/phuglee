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

/** REAPI often nests { street, city, state, zip, address: "full..." }. Always return a string. */
function formatReapiAddress(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object') {
    if (typeof raw.address === 'string' && raw.address.trim()) return raw.address.trim();
    if (typeof raw.fullAddress === 'string' && raw.fullAddress.trim()) return raw.fullAddress.trim();
    if (raw.address && typeof raw.address === 'object') return formatReapiAddress(raw.address);
    const joined = [raw.street, raw.city, raw.state, raw.zip].filter(Boolean).join(', ');
    if (joined) return joined;
  }
  return String(raw);
}

function extractSalePrice(raw) {
  const nested = raw && raw.lastSale
    ? (raw.lastSale.amount ?? raw.lastSale.price ?? raw.lastSale.saleAmount)
    : null;
  const n = Number(raw.lastSaleAmount ?? nested ?? raw.price ?? raw.salePrice);
  return Number.isFinite(n) ? n : 0;
}

function mapReapiComp(raw) {
  const price = extractSalePrice(raw);
  const distanceRaw = raw.distance ?? raw.distanceMi;
  return {
    id: raw.id || raw.propertyId || raw.reapiId,
    price,
    unusable: price <= 0,
    soldDate: raw.lastSaleDate || raw.lastSale?.saleDate || raw.soldDate || raw.closeDate,
    sqft: Number(raw.squareFeet ?? raw.sqft) || 0,
    beds: Number(raw.bedrooms ?? raw.beds) || 0,
    baths: Number(raw.bathrooms ?? raw.baths) || 0,
    lat: Number(raw.latitude ?? raw.lat) || null,
    lng: Number(raw.longitude ?? raw.lng) || null,
    address: formatReapiAddress(raw.address || raw.fullAddress || raw.streetAddress || raw),
    distanceMi: distanceRaw != null ? Number(distanceRaw) : null,
    cashBuyer: Boolean(raw.cashBuyer || raw.lastSaleCashBuyer),
    priorSaleDate: raw.priorSaleDate || raw.previousSaleDate,
    yearBuilt: Number(raw.yearBuilt) || 0,
    propertyType: normalizePropertyType(raw.propertyType || raw.landUse),
    garage: Number(raw.garage ?? raw.garageSpaces) || 0,
    lotSqft: Number(raw.lotSquareFeet ?? raw.lotSqft) || 0,
    acres: Number(raw.lotAcres ?? raw.acres) || null,
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

function pickNum(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickText(...vals) {
  for (const v of vals) {
    const s = String(v == null ? '' : v).trim();
    if (s) return s;
  }
  return '';
}

function formatFlood(raw) {
  const zoneType = pickText(raw.floodZoneType);
  const desc = pickText(raw.floodZoneDescription);
  if (zoneType && desc) return `${zoneType} — ${desc}`;
  if (zoneType) return zoneType;
  if (desc) return desc;
  if (raw.floodZone === true) return 'Yes';
  if (raw.floodZone === false) return 'No';
  return pickText(raw.flood, raw.floodplain);
}

/**
 * Map PropertyDetail — REAPI nests lot/address/utilities under lotInfo + propertyInfo.
 */
function mapReapiDetail(response) {
  const raw = response?.data ?? response?.property ?? response ?? {};
  const lot = raw.lotInfo && typeof raw.lotInfo === 'object' ? raw.lotInfo : {};
  const info = raw.propertyInfo && typeof raw.propertyInfo === 'object' ? raw.propertyInfo : {};
  const addr = (info.address && typeof info.address === 'object')
    ? info.address
    : (raw.address && typeof raw.address === 'object' ? raw.address : {});

  const lotSqft = pickNum(lot.lotSquareFeet, raw.lotSquareFeet, raw.lotSqft, info.lotSquareFeet) || 0;
  let acres = pickNum(lot.lotAcres, raw.lotAcres, raw.acres, info.lotAcres);
  if ((acres == null || acres <= 0) && lotSqft > 0) acres = lotSqft / 43560;

  const lat = pickNum(info.latitude, raw.latitude, raw.lat, addr.latitude);
  const lng = pickNum(info.longitude, raw.longitude, raw.lng, addr.longitude);

  const addressLabel = pickText(
    typeof raw.address === 'string' ? raw.address : '',
    addr.label,
    addr.address,
    raw.fullAddress,
    raw.streetAddress
  );

  return {
    id: raw.id || raw.propertyId || info.id,
    sqft: pickNum(info.livingSquareFeet, info.buildingSquareFeet, raw.squareFeet, raw.sqft) || 0,
    beds: pickNum(info.bedrooms, raw.bedrooms, raw.beds) || 0,
    baths: pickNum(info.bathrooms, raw.bathrooms, raw.baths) || 0,
    yearBuilt: pickNum(info.yearBuilt, raw.yearBuilt) || 0,
    lat: lat != null ? lat : null,
    lng: lng != null ? lng : null,
    garage: pickNum(info.garageSpaces, raw.garage, raw.garageSpaces) || 0,
    propertyType: normalizePropertyType(
      info.propertyType || raw.propertyType || lot.landUse || lot.propertyUse || raw.landUse
    ),
    estimatedValue: pickNum(raw.estimatedValue, raw.avm),
    newConstructionCeiling: pickNum(raw.newConstructionValue, raw.newConstructionCeiling),
    address: addressLabel,
    lotSqft,
    acres: acres != null && acres > 0 ? acres : null,
    zoning: pickText(lot.zoning, raw.zoning, raw.zoningCode, info.zoning),
    landUse: pickText(lot.landUse, lot.propertyUse, raw.landUse, info.landUse),
    county: pickText(addr.county, info.county, raw.county),
    apn: pickText(lot.apn, lot.apnUnformatted, raw.apn, info.apn),
    water: pickText(info.utilitiesWaterSource, raw.utilitiesWaterSource, raw.water),
    sewer: pickText(info.utilitiesSewageUsage, raw.utilitiesSewageUsage, raw.sewer),
    flood: formatFlood(raw),
    lotWidthFeet: pickNum(lot.lotWidthFeet, raw.lotWidthFeet),
    lotDepthFeet: pickNum(lot.lotDepthFeet, raw.lotDepthFeet),
    fips: pickText(addr.fips, info.fips, raw.fips)
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
  formatReapiAddress,
  extractSalePrice,
};
