(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.exportSchema = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function exportSchemaFactory() {
  const DIAL_READY_COLUMNS = Object.freeze([
    'Cache Date',
    'Street Address',
    'City',
    'State',
    'Zip Code',
    'Street View Image URL',
    'Google Maps Street View Link',
    'Lead Type',
    'Lead Category',
    'Property Type',
    'Contact Name',
    'Phone',
    'Email'
  ]);

  function formatCacheDate(cachedAt) {
    if (cachedAt == null || cachedAt === '') return '';
    const n = Number(cachedAt);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function absoluteUrl(url, origin = '') {
    if (!url || typeof url !== 'string') return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/') && origin) {
      return `${String(origin).replace(/\/$/, '')}${url}`;
    }
    return url;
  }

  function buildGoogleMapsStreetViewLink(record) {
    if (!record) return '';
    const vm = record.viewMeta || {};
    if (vm.panoId) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&pano_id=${encodeURIComponent(vm.panoId)}`;
    }
    const lat = vm.panoLat ?? vm.targetLat;
    const lng = vm.panoLng ?? vm.targetLng;
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    }
    const parts = [record.street, record.city, record.state, record.postal].filter(Boolean);
    const address = parts.join(', ') || record.address || '';
    if (!address) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  function propertyTypeLabel(category) {
    if (category === 'vacant_lot') return 'Land/Lot';
    if (category === 'blurred') return 'Blocked';
    if (category === 'unavailable') return 'Unavailable';
    return 'Home';
  }

  function exportLeadCategoryLabel(tier) {
    const t = String(tier || '').toLowerCase().replace(/[^a-z_]/g, '');
    if (t === 'distressed') return 'Distressed';
    if (t === 'well_maintained') return 'Well Maintained';
    if (t === 'vacant') return 'Vacant';
    if (t === 'blurred') return 'Blocked';
    if (t === 'unavailable') return 'Unavailable';
    return '';
  }

  function contactName(record) {
    const first = String(record?.firstName || '').trim();
    const last = String(record?.lastName || '').trim();
    return [first, last].filter(Boolean).join(' ');
  }

  function buildDialReadyRow(record, deps = {}) {
    const resolveImagery = deps.resolveImageryForResult || ((r) => r);
    const getUrls = deps.getCachedImageryUrls || (() => ({ streetView: null }));
    const leadTypeLabelFn = deps.leadTypeLabel || ((id) => String(id || ''));
    const resultLeadTypeFn = deps.resultLeadType || ((r) => r?.leadType);
    const resultLeadTierFn = deps.resultLeadTier || (() => '');
    const resultCategoryFn = deps.resultCategory || (() => 'property');
    const origin = deps.origin || '';

    const r = resolveImagery(record);
    const urls = getUrls(r);
    const imagery = r?.imagery;
    // Prefer streetView cache timestamp; fall back to satellite when SV not cached.
    const cachedAt = imagery?.streetView?.cachedAt ?? imagery?.satellite?.cachedAt ?? null;
    const cat = resultCategoryFn(r);
    const tier = resultLeadTierFn(r);

    return {
      'Cache Date': formatCacheDate(cachedAt),
      'Street Address': r.street || '',
      City: r.city || '',
      State: r.state || '',
      'Zip Code': r.postal || '',
      'Street View Image URL': absoluteUrl(urls.streetView, origin),
      'Google Maps Street View Link': buildGoogleMapsStreetViewLink(r),
      'Lead Type': leadTypeLabelFn(resultLeadTypeFn(r)),
      'Lead Category': exportLeadCategoryLabel(tier),
      'Property Type': propertyTypeLabel(cat),
      'Contact Name': contactName(r),
      Phone: r.phone || '',
      Email: r.email || ''
    };
  }

  function buildDialReadyRows(records, deps = {}) {
    return (records || []).map((r) => buildDialReadyRow(r, deps));
  }

  return {
    DIAL_READY_COLUMNS,
    formatCacheDate,
    absoluteUrl,
    buildGoogleMapsStreetViewLink,
    propertyTypeLabel,
    exportLeadCategoryLabel,
    contactName,
    buildDialReadyRow,
    buildDialReadyRows
  };
});