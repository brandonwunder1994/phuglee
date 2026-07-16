'use strict';

/**
 * Filter → Land preferential routing (Land Desk Phase 5).
 * Tag + prefer only — never wipe Filter list files.
 */

const LAND_SCRUB_TAG_IDS = Object.freeze([
  'tax_delinquent',
  'vacant_lot',
  'land_use',
  'code_vacant',
  'auction_tax_sale'
]);

const LAND_SCRUB_LABELS = Object.freeze({
  tax_delinquent: 'Tax delinquent',
  vacant_lot: 'Vacant lot',
  land_use: 'Land use',
  code_vacant: 'Code (vacant)',
  auction_tax_sale: 'Auction/tax sale'
});

/** Fixed Land Vault filter chips (human labels matching signalTags). */
const LAND_VAULT_SIGNAL_CHIPS = Object.freeze([
  LAND_SCRUB_LABELS.tax_delinquent,
  LAND_SCRUB_LABELS.code_vacant,
  LAND_SCRUB_LABELS.auction_tax_sale
]);

const NOD_UPLOAD_TYPES = new Set(['lis_pendens', 'pre_foreclosure']);

const VACANT_LOT_RE = /\b(vacant\s+(lot|land|parcel|property)|empty\s+lot|unimproved\s+(lot|land)|lot\s+only|no\s+(dwelling|structure|building)|bare\s+land)\b/i;
const LAND_USE_RE = /\b(land\s+use|zoning\s*:\s*(vacant|ag|agricultural|residential\s+vacant)|use\s*code\s*[:=]?\s*(vacant|vl|vl\b|lot)|parcel\s+type\s*[:=]?\s*(vacant|land))\b/i;
const CODE_VACANT_RE = /\b(weeds?|overgrown|high\s+grass|brush|debris)\b/i;
const AUCTION_TAX_RE = /\b(tax\s+sale|tax\s+auction|sheriff'?s?\s+sale|delinquent\s+tax\s+sale|auction)\b/i;
const TAX_RE = /\b(tax\s+delinquen|delinquent\s+tax|unpaid\s+tax|tax\s+lien|taxes?\s+owed)\b/i;

function slug(value) {
  return String(value || '').trim().toLowerCase();
}

function rowSearchText(row = {}) {
  return [
    row.streetAddress,
    row.address,
    row.violationIssueType,
    row.descriptionNotes,
    row.category,
    row.distressedSignalTag,
    row.matchedIndicators,
    row.landUse,
    row.propertyType,
    row.parcelType,
    Array.isArray(row.matchedIndicators) ? row.matchedIndicators.join(' ') : ''
  ].filter(Boolean).join(' ');
}

/**
 * Detect land scrub tag ids for a Filter row + upload type.
 * NOD / pre-foreclosure alone never imply vacant_lot.
 */
function detectLandScrubTags({ uploadType, row } = {}) {
  const type = slug(uploadType || row?.uploadType);
  const text = rowSearchText(row);
  const tags = new Set();

  if (type === 'tax_delinquent' || TAX_RE.test(text)) {
    tags.add('tax_delinquent');
  }
  if (AUCTION_TAX_RE.test(text)) {
    tags.add('auction_tax_sale');
    tags.add('tax_delinquent');
  }
  if (VACANT_LOT_RE.test(text) || slug(row?.propertyType) === 'vacant_lot') {
    tags.add('vacant_lot');
  }
  if (LAND_USE_RE.test(text)) {
    tags.add('land_use');
    tags.add('vacant_lot');
  }
  // Code weeds/overgrowth only count as land when parcel also looks vacant
  if (type === 'code_violation' && CODE_VACANT_RE.test(text) && VACANT_LOT_RE.test(text)) {
    tags.add('code_vacant');
    tags.add('vacant_lot');
  } else if (CODE_VACANT_RE.test(text) && tags.has('vacant_lot')) {
    tags.add('code_vacant');
  }

  return LAND_SCRUB_TAG_IDS.filter((id) => tags.has(id));
}

function landScrubLabels(tagIds = []) {
  return (Array.isArray(tagIds) ? tagIds : [])
    .map((id) => LAND_SCRUB_LABELS[id] || null)
    .filter(Boolean);
}

/**
 * Prefer Land Desk path?
 * - Tax delinquent list OR vacant/land-use/code-vacant tags → yes
 * - LP / NOD / pre-foreclosure alone → no (brain: not primary land source)
 */
function preferLandPath({ uploadType, scrubTags, row } = {}) {
  const type = slug(uploadType || row?.uploadType);
  const tags = Array.isArray(scrubTags) && scrubTags.length
    ? scrubTags
    : detectLandScrubTags({ uploadType: type, row });

  if (NOD_UPLOAD_TYPES.has(type)) {
    // Only prefer land if the row itself is clearly vacant / land-use
    return tags.includes('vacant_lot') || tags.includes('land_use');
  }

  if (type === 'tax_delinquent') return true;
  if (tags.includes('vacant_lot') || tags.includes('land_use') || tags.includes('code_vacant')) {
    return true;
  }
  if (tags.includes('auction_tax_sale')) return true;
  return false;
}

function enrichRowLandRoute(row = {}, uploadType = '') {
  const type = uploadType || row.uploadType || '';
  const scrubTags = detectLandScrubTags({ uploadType: type, row });
  const prefer = preferLandPath({ uploadType: type, scrubTags, row });
  return {
    ...row,
    landScrubTags: scrubTags,
    preferLandPath: prefer
  };
}

/**
 * Additive list metadata for Filter save (does not mutate row files).
 */
function summarizeLandRoute(rows = [], uploadType = '') {
  const type = slug(uploadType);
  const tagCounts = Object.fromEntries(LAND_SCRUB_TAG_IDS.map((id) => [id, 0]));
  let landPreferRowCount = 0;
  let housePreferRowCount = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const scrubTags = detectLandScrubTags({ uploadType: type, row });
    for (const id of scrubTags) tagCounts[id] += 1;
    if (preferLandPath({ uploadType: type, scrubTags, row })) landPreferRowCount += 1;
    else housePreferRowCount += 1;
  }

  const preferLand = type === 'tax_delinquent'
    || landPreferRowCount > 0
      && landPreferRowCount >= Math.max(1, Math.ceil((landPreferRowCount + housePreferRowCount) * 0.15));

  // Hard rule: NOD lists never list-prefer land unless vacant rows dominate
  const listPreferLand = NOD_UPLOAD_TYPES.has(type)
    ? (landPreferRowCount > housePreferRowCount)
    : preferLand;

  return {
    preferLand: !!listPreferLand,
    uploadType: type || '',
    scrubTagCounts: tagCounts,
    landPreferRowCount,
    housePreferRowCount,
    suggestedAnalyzeHint: listPreferLand
      ? 'Prefer Land review for vacant / tax-dirt parcels'
      : (NOD_UPLOAD_TYPES.has(type)
        ? 'Pre-foreclosure stays house path unless vacant'
        : null)
  };
}

module.exports = {
  LAND_SCRUB_TAG_IDS,
  LAND_SCRUB_LABELS,
  LAND_VAULT_SIGNAL_CHIPS,
  detectLandScrubTags,
  landScrubLabels,
  preferLandPath,
  enrichRowLandRoute,
  summarizeLandRoute
};
