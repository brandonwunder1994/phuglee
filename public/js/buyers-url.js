(function (root) {
  'use strict';

  const FLAG_KEYS = [
    'brick', 'garage', 'offMarket', 'leaseback', 'waterfront',
    'buildable', 'roadAccess', 'utilitiesNearby'
  ];

  function encFlag(v) {
    if (v === true) return '1';
    if (v === false) return '0';
    return '';
  }

  function decFlag(v) {
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return null;
  }

  function serialize(state) {
    const deal = state.deal || {};
    const params = new URLSearchParams();
    const map = {
      city: deal.city,
      state: deal.state,
      zip: deal.zip,
      asset: deal.assetType,
      sqft: deal.sqft,
      beds: deal.beds,
      baths: deal.baths,
      year: deal.yearBuilt,
      asking: deal.asking,
      arv: deal.arv,
      rehab: deal.rehab,
      acres: deal.acres,
      condition: deal.condition,
      address: deal.address
    };
    Object.keys(map).forEach((k) => {
      if (map[k] != null && map[k] !== '') params.set(k, String(map[k]));
    });
    FLAG_KEYS.forEach((k) => {
      const e = encFlag(deal[k]);
      if (e !== '') params.set(k, e);
    });
    if (state.cluster) params.set('cluster', state.cluster);
    if (state.tierFilter) params.set('tier', state.tierFilter);
    if (state.stateFilter) params.set('mapState', state.stateFilter);
    if (state.openId) params.set('open', state.openId);
    if (state.dealId) params.set('deal', state.dealId);
    if (state.compareIds && state.compareIds.length) {
      params.set('compare', state.compareIds.join(','));
    }
    if (state.showMisses) params.set('misses', '1');
    return params;
  }

  function parse(search) {
    const params = new URLSearchParams(search || '');
    const deal = {
      city: params.get('city') || '',
      state: params.get('state') || '',
      zip: params.get('zip') || '',
      assetType: params.get('asset') || '',
      sqft: params.get('sqft') || '',
      beds: params.get('beds') || '',
      baths: params.get('baths') || '',
      yearBuilt: params.get('year') || '',
      asking: params.get('asking') || '',
      arv: params.get('arv') || '',
      rehab: params.get('rehab') || '',
      acres: params.get('acres') || '',
      condition: params.get('condition') || '',
      address: params.get('address') || ''
    };
    FLAG_KEYS.forEach((k) => {
      deal[k] = params.has(k) ? decFlag(params.get(k)) : null;
    });
    const compare = (params.get('compare') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return {
      deal,
      cluster: params.get('cluster') || '',
      tierFilter: params.get('tier') || '',
      stateFilter: params.get('mapState') || '',
      openId: params.get('open') || null,
      dealId: params.get('deal') || null,
      compareIds: compare,
      showMisses: params.get('misses') === '1'
    };
  }

  function applyToUrl(state, replace) {
    const params = serialize(state);
    const qs = params.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    return url;
  }

  const api = { serialize, parse, applyToUrl, FLAG_KEYS, encFlag, decFlag };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuyersUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
