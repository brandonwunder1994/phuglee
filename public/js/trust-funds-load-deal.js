(function (root) {
  'use strict';

  function headers() {
    const h = { Accept: 'application/json' };
    try {
      const user = (window.PhugleeSession && window.PhugleeSession.getSessionUser
        && window.PhugleeSession.getSessionUser())
        || sessionStorage.getItem('phuglee_session')
        || '';
      if (user) h['X-Phuglee-User'] = user;
      if (user === 'admin' || user === 'brad') h['X-Phuglee-Plan'] = 'max';
    } catch (_) { /* ignore */ }
    return h;
  }

  async function listDeals() {
    const res = await fetch('/api/leads/admin/contracts?board=pipeline', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load deals');
    return data.deals || [];
  }

  async function getDeal(dealId) {
    const res = await fetch('/api/leads/admin/contracts/' + encodeURIComponent(dealId), {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load deal');
    return data.deal || data;
  }

  function parseAddress(deal) {
    let city = deal.city || '';
    let state = deal.state || '';
    let zip = deal.zip || deal.postal || '';
    let street = deal.address || '';
    const m = String(street).match(/^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?$/);
    if (m) {
      street = m[1].trim();
      if (!city) city = m[2].trim();
      if (!state) state = m[3].trim().toUpperCase();
      if (!zip && m[4]) zip = m[4];
    }
    return { street, city, state, zip, address: deal.address || street };
  }

  function mapDealToModel(deal) {
    if (!deal) return null;
    const loc = parseAddress(deal);
    const scan = deal.rehabScan || deal.scan || {};
    const profile = deal.profile || deal.propertyProfile || {};
    return {
      address: loc.address,
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
      utilitiesNearby: null,
      dealId: deal.dealId || null
    };
  }

  const api = { listDeals, getDeal, mapDealToModel, parseAddress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TrustFundsLoadDeal = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
