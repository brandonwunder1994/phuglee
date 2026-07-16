/**
 * Cross-reference UC / pipeline deals against Trust Fund buy boxes.
 * Browser + Node (tests).
 */
(function (root) {
  'use strict';

  const CATALOG_URL = '/data/fund-buyers/catalog.json';
  let catalogPromise = null;
  let cachedFunds = null;

  function loadCatalog(fetchImpl) {
    if (cachedFunds) return Promise.resolve(cachedFunds);
    if (catalogPromise) return catalogPromise;
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.resolve([]);
    catalogPromise = fetchFn(CATALOG_URL, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('catalog ' + res.status);
        return res.json();
      })
      .then((data) => {
        cachedFunds = data.funds || [];
        return cachedFunds;
      })
      .catch(() => {
        catalogPromise = null;
        return [];
      });
    return catalogPromise;
  }

  function parseAddressParts(deal) {
    let city = String(deal.city || '').trim();
    let state = String(deal.state || '').trim();
    let zip = String(deal.zip || deal.postalCode || '').trim();
    let street = String(deal.address || '').trim();
    const m = street.match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?$/);
    if (m) {
      street = m[1].trim();
      if (!city) city = m[2].trim();
      if (!state) state = m[3].trim().toUpperCase();
      if (!zip && m[4]) zip = m[4];
    }
    return { street, city, state, zip };
  }

  /**
   * Map a contract-tracker deal into matcher deal model.
   * Defaults asset to sfh (UC desk is house-first); leaves flags unknown.
   */
  function mapDeal(deal) {
    if (!deal) return null;
    const loc = parseAddressParts(deal);
    const scan = deal.rehabScan || deal.scan || {};
    const profile = deal.profile || deal.propertyProfile || {};
    return {
      address: deal.address || loc.street,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      assetType: deal.assetType || deal.propertyType || 'sfh',
      sqft: scan.livingSqft || profile.livingSqft || deal.sqft || '',
      beds: profile.beds || deal.beds || '',
      baths: profile.baths || deal.baths || '',
      yearBuilt: profile.yearBuilt || deal.yearBuilt || '',
      asking: deal.purchasePrice || deal.contractPrice || deal.asking || '',
      arv: deal.arv || deal.estARV || profile.arv || '',
      rehab: deal.rehabEstimate || deal.repairs || '',
      acres: deal.acres || profile.acres || '',
      condition: '',
      brick: null,
      garage: null,
      offMarket: null,
      leaseback: null,
      waterfront: null,
      buildable: null,
      roadAccess: null,
      utilitiesNearby: null
    };
  }

  function getMatchApi() {
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./trust-funds-match.js'); } catch (_) { /* browser path */ }
    }
    return root.TrustFundsMatch || null;
  }

  /**
   * @returns {{ hit: boolean, tier: string|null, score: number, funds: Array, label: string, href: string }}
   */
  function evaluateDeal(deal, funds, matchApi) {
    const api = matchApi || getMatchApi();
    const empty = {
      hit: false,
      tier: null,
      score: 0,
      funds: [],
      label: '',
      href: deal && deal.dealId ? `/trust-funds?deal=${encodeURIComponent(deal.dealId)}` : '/trust-funds'
    };
    if (!api || !deal || !funds || !funds.length) return empty;

    const model = mapDeal(deal);
    if (!api.dealHasInputs(model)) return empty;

    const ranked = api.rankFunds(funds, model, {});
    const fits = ranked.filter((r) => r.tier === api.TIER_STRONG || r.tier === api.TIER_PARTIAL);
    if (!fits.length) return empty;

    const strong = fits.filter((r) => r.tier === api.TIER_STRONG);
    const top = (strong.length ? strong : fits).slice(0, 3);
    const bestTier = strong.length ? 'strong' : 'partial';
    const names = top.map((r) => r.fund.name.replace(/\s+Fund$/i, '')).join(', ');
    const label = strong.length
      ? `Trust fund fit: ${names}`
      : `Possible trust fund fit: ${names}`;

    return {
      hit: true,
      tier: bestTier,
      score: top[0].score,
      funds: top.map((r) => ({
        id: r.fundId,
        name: r.fund.name,
        tier: r.tier,
        score: r.score,
        boxLabel: r.bestBox && r.bestBox.boxLabel
      })),
      label,
      href: empty.href
    };
  }

  async function flagDeals(deals, opts) {
    const list = Array.isArray(deals) ? deals : [];
    const funds = await loadCatalog(opts && opts.fetch);
    const api = getMatchApi();
    return list.map((d) => {
      const flag = evaluateDeal(d, funds, api);
      return Object.assign({}, d, { trustFundMatch: flag });
    });
  }

  async function flagDeal(deal, opts) {
    const [out] = await flagDeals([deal], opts);
    return out ? out.trustFundMatch : evaluateDeal(deal, [], null);
  }

  const api = {
    loadCatalog,
    mapDeal,
    evaluateDeal,
    flagDeal,
    flagDeals,
    CATALOG_URL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.TrustFundsDealFlag = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
