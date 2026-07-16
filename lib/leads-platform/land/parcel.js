'use strict';

/**
 * Parcel field helpers for Land Desk (display + packet + index).
 */

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v) {
  const s = String(v || '').trim();
  return s || '';
}

function leadAcres(lead = {}) {
  const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
    ? lead.propertyDetails
    : {};
  const acres = num(pd.acres);
  if (acres != null && acres > 0) return acres;
  const lotSqft = num(pd.lotSqft);
  if (lotSqft != null && lotSqft > 0) return lotSqft / 43560;
  return null;
}

function extractParcelFields(lead = {}) {
  const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
    ? lead.propertyDetails
    : {};
  const acres = leadAcres(lead);
  const lotSqft = num(pd.lotSqft);
  return {
    acres: acres != null ? Math.round(acres * 1000) / 1000 : null,
    lotSqft: lotSqft != null && lotSqft > 0 ? Math.round(lotSqft) : null,
    zoning: text(pd.zoning || pd.zoningCode),
    landUse: text(pd.landUse || pd.useCode || pd.use),
    county: text(pd.county),
    apn: text(pd.apn || pd.parcelId || lead.parcel),
    water: text(pd.water || pd.waterService),
    sewer: text(pd.sewer || pd.sewerService),
    utilities: text(pd.utilities),
    flood: text(pd.flood || pd.floodZone || pd.floodplain),
    frontage: text(pd.frontage || pd.roadFrontage),
    topography: text(pd.topography || pd.topo)
  };
}

function mergeParcelIntoLead(lead, patch = {}) {
  const next = { ...lead };
  const pd = {
    ...(lead.propertyDetails && typeof lead.propertyDetails === 'object' ? lead.propertyDetails : {})
  };
  const setText = (key, val) => {
    if (val == null) return;
    const s = String(val).trim();
    if (s) pd[key] = s;
    else delete pd[key];
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'acres')) {
    const a = num(patch.acres);
    if (a != null && a > 0) pd.acres = a;
    else delete pd.acres;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'lotSqft')) {
    const s = num(patch.lotSqft);
    if (s != null && s > 0) pd.lotSqft = s;
    else delete pd.lotSqft;
  }
  const maybe = (key, alias) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
    setText(key, patch[key]);
    if (alias) setText(alias, patch[key]);
  };
  maybe('zoning', 'zoningCode');
  maybe('landUse');
  maybe('county');
  maybe('apn');
  maybe('water');
  maybe('sewer');
  maybe('utilities');
  maybe('flood', 'floodZone');
  maybe('frontage');
  maybe('topography');
  next.propertyDetails = pd;
  if (Object.prototype.hasOwnProperty.call(patch, 'apn')) {
    const apn = String(patch.apn || '').trim();
    if (apn) next.parcel = apn;
  }
  return next;
}

module.exports = {
  leadAcres,
  extractParcelFields,
  mergeParcelIntoLead
};
