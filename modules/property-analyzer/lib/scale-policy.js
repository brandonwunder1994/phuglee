'use strict';

/**
 * Cache-first imagery policy for 100k+ lead sessions (M4-09).
 *
 * 1. Street View imagery: fetch once per address, serve from property_imagery/ forever.
 * 2. Satellite imagery: cache-first on every property/vacant scan (accuracy-first v2026-07).
 * 3. Satellite classification: reuse saved satelliteClassification when imagery is cache-hit on rescan.
 * 4. Re-tier / recalibrate: use saved indicators + satelliteClassification — never re-call Gemini.
 */
const SCALE_POLICY = Object.freeze({
  streetViewFirst: true,
  satelliteOnDemandOnly: false,
  satelliteAlwaysForProperty: true,
  imageryCacheFirst: true,
  reuseSatelliteClassificationOnCacheHit: true,
  retierWithoutVision: true,
  hotFileCacheMax: 800,
  geocodeCacheMax: 50000,
  imageResponseCacheMax: 4000
});

const DEFAULT_ASSUMPTIONS = Object.freeze({
  /** Share of property scans that fetch satellite (accuracy-first: ~100%) */
  satelliteFallbackRate: 1.0,
  /** Share of satellite imagery served from disk cache (not Maps API) */
  satelliteImageryCacheHitRate: 0.6,
  /** Share of rescans that reuse saved satelliteClassification (no Gemini) */
  satelliteClassificationReuseRate: 0.5,
  /** Share of full rescans vs first-time scans in a 1k batch */
  rescanRate: 0.1
});

function shouldReuseSatelliteClassification(priorRecord, satData = {}) {
  if (!SCALE_POLICY.reuseSatelliteClassificationOnCacheHit) return false;
  if (!satData.fromCache) return false;
  const sat = priorRecord?.satelliteClassification;
  if (!sat || !sat.category) return false;
  const conf = Number(sat.confidence);
  if (!Number.isNaN(conf) && conf < 40) return false;
  return true;
}

function estimateApiCallsPer1kLeads(assumptions = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const n = 1000;
  const rescans = Math.round(n * a.rescanRate);
  const firstScans = n - rescans;

  const streetViewCalls = n;
  const satelliteNeeded = Math.round(firstScans * a.satelliteFallbackRate);
  const satelliteMapsCalls = Math.round(satelliteNeeded * (1 - a.satelliteImageryCacheHitRate));

  const geminiStreetCalls = n;
  const geminiSatelliteCalls = Math.round(
    satelliteNeeded * (1 - a.satelliteClassificationReuseRate * a.satelliteImageryCacheHitRate)
  );

  return {
    leads: n,
    assumptions: a,
    maps: {
      streetView: streetViewCalls,
      satellite: satelliteMapsCalls,
      total: streetViewCalls + satelliteMapsCalls
    },
    gemini: {
      street: geminiStreetCalls,
      satellite: geminiSatelliteCalls,
      total: geminiStreetCalls + geminiSatelliteCalls
    },
    totalPaidCalls: streetViewCalls + satelliteMapsCalls + geminiStreetCalls + geminiSatelliteCalls,
    perLead: {
      maps: (streetViewCalls + satelliteMapsCalls) / n,
      gemini: (geminiStreetCalls + geminiSatelliteCalls) / n,
      all: (streetViewCalls + satelliteMapsCalls + geminiStreetCalls + geminiSatelliteCalls) / n
    }
  };
}

function formatCostEstimate(estimate) {
  const e = estimate;
  return [
    `Scale estimate (${e.leads} leads):`,
    `  Maps API: ${e.maps.total} calls (${e.perLead.maps.toFixed(2)}/lead) — SV ${e.maps.streetView}, sat ${e.maps.satellite}`,
    `  Gemini: ${e.gemini.total} calls (${e.perLead.gemini.toFixed(2)}/lead) — street ${e.gemini.street}, sat ${e.gemini.satellite}`,
    `  Total paid: ${e.totalPaidCalls} (${e.perLead.all.toFixed(2)}/lead)`
  ].join('\n');
}

module.exports = {
  SCALE_POLICY,
  DEFAULT_ASSUMPTIONS,
  shouldReuseSatelliteClassification,
  estimateApiCallsPer1kLeads,
  formatCostEstimate
};
