(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.imageryUrls = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function imageryUrlsFactory() {
  function streetViewUnavailableForRecord(result) {
    if (!result) return false;
    if (result.skippedStreetView === true) return true;
    if (result.viewMeta?.targeting === 'not_found') return true;
    if (result.qualityFlags?.includes('no_streetview')) return true;
    return false;
  }

  function recordUsedSatelliteOnly(result) {
    if (!result) return false;
    if (streetViewUnavailableForRecord(result)) return true;
    if (result.usedSatellite && !result.viewMeta) return true;
    return false;
  }

  function pickCachedUrls(result, getCachedImageryUrls) {
    const cached = getCachedImageryUrls(result);
    const preferSatellite = recordUsedSatelliteOnly(result);
    const streetView = streetViewUnavailableForRecord(result) ? null : cached.streetView;
    return {
      streetView,
      satellite: cached.satellite,
      fromCache: !!(streetView || cached.satellite),
      preferSatellite
    };
  }

  function resolvePropertyImageUrls(result, deps) {
    const {
      hasImageryKey,
      getCachedImageryUrls,
      buildStreetViewThumbUrl,
      buildSatelliteThumbUrl,
      apiKey,
      streetViewSize,
      satelliteSize
    } = deps;

    if (!hasImageryKey() || !result?.address) {
      return { streetView: null, satellite: null, fromCache: false, preferSatellite: false };
    }

    const cached = pickCachedUrls(result, getCachedImageryUrls);
    if (cached.fromCache) {
      return cached;
    }

    const viewMeta = result.viewMeta || null;
    const preferSatellite = cached.preferSatellite;
    const satellite = buildSatelliteThumbUrl(result.address, apiKey, satelliteSize, viewMeta);
    const streetView = streetViewUnavailableForRecord(result)
      ? null
      : buildStreetViewThumbUrl(result.address, apiKey, streetViewSize, viewMeta);

    return { streetView, satellite, fromCache: false, preferSatellite };
  }

  /**
   * Review mode: street view when available; satellite only as fallback.
   * Must use hasImageryKey() — proxy mode has empty client apiKey but server maps key.
   */
  function resolveReviewImageUrls(result, deps) {
    const resolved = resolvePropertyImageUrls(result, deps);
    if (resolved.preferSatellite) {
      return {
        streetView: null,
        satellite: resolved.satellite || resolved.streetView,
        fromCache: resolved.fromCache
      };
    }
    const streetView = resolved.streetView;
    return {
      streetView,
      satellite: streetView ? null : resolved.satellite,
      fromCache: resolved.fromCache
    };
  }

  return {
    streetViewUnavailableForRecord,
    recordUsedSatelliteOnly,
    resolvePropertyImageUrls,
    resolveReviewImageUrls
  };
});