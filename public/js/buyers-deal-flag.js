/**
 * Cross-reference UC / pipeline deals against Buyers catalog buy boxes.
 * Browser + Node (tests).
 */
(function (root) {
  'use strict';

  const API_URL = '/api/buyers';
  const CATALOG_URL = '/data/buyers/catalog.json';
  let catalogPromise = null;
  let cachedFunds = null;

  function extractFunds(data) {
    if (!data) return [];
    if (Array.isArray(data.funds)) return data.funds;
    if (Array.isArray(data.buyers)) return data.buyers;
    if (data.catalog) return extractFunds(data.catalog);
    return [];
  }

  function loadCatalog(fetchImpl) {
    if (cachedFunds) return Promise.resolve(cachedFunds);
    if (catalogPromise) return catalogPromise;
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.resolve([]);

    catalogPromise = fetchFn(API_URL, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('api ' + res.status);
        return res.json();
      })
      .then((data) => {
        const funds = extractFunds(data);
        if (!funds.length) throw new Error('empty api catalog');
        cachedFunds = funds;
        return cachedFunds;
      })
      .catch(() => fetchFn(CATALOG_URL, { cache: 'no-store', credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error('catalog ' + res.status);
          return res.json();
        })
        .then((data) => {
          cachedFunds = extractFunds(data);
          return cachedFunds;
        }))
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
      try { return require('./buyers-match.js'); } catch (_) { /* browser path */ }
    }
    return root.BuyersMatch || root.TrustFundsMatch || null;
  }

  function evaluateDeal(deal, funds, matchApi) {
    const api = matchApi || getMatchApi();
    const empty = {
      hit: false,
      tier: null,
      score: 0,
      funds: [],
      label: '',
      href: deal && deal.dealId ? `/buyers?deal=${encodeURIComponent(deal.dealId)}` : '/buyers'
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
      ? `Buyer fit: ${names}`
      : `Possible buyer fit: ${names}`;

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
      return Object.assign({}, d, {
        buyerMatch: flag,
        trustFundMatch: flag // legacy alias for UC board
      });
    });
  }

  async function flagDeal(deal, opts) {
    const [out] = await flagDeals([deal], opts);
    return out ? out.buyerMatch : evaluateDeal(deal, [], null);
  }

  const api = {
    loadCatalog,
    mapDeal,
    evaluateDeal,
    flagDeal,
    flagDeals,
    CATALOG_URL,
    API_URL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuyersDealFlag = api;
  root.TrustFundsDealFlag = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
