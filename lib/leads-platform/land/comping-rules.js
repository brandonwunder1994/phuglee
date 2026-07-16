'use strict';

/**
 * Land Comping Rules — lot comps, not renovated house ARV.
 * Hard fail → exclude from FMV cluster.
 */

const MS_DAY = 86400000;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function acresFromLotSqft(lotSqft) {
  const sq = num(lotSqft, 0);
  return sq > 0 ? sq / 43560 : null;
}

function isLandLikeType(propertyType) {
  const t = String(propertyType || '').toLowerCase();
  if (!t) return null;
  if (/land|lot|vacant|acreage|unimproved/.test(t)) return true;
  if (/sfr|single|condo|town|mobile|multi|duplex|apartment/.test(t)) return false;
  return null;
}

function monthsSince(soldDate) {
  const ts = Date.parse(soldDate || '');
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / (MS_DAY * 30.4375);
}

/**
 * @returns {{ status: 'pass'|'soft'|'fail', id: string, detail?: string }}
 */
function rule(id, status, detail) {
  return { id, status, detail: detail || '' };
}

function scoreLandComp(subject = {}, candidate = {}, opts = {}) {
  const rules = [];
  let hardFail = false;

  const price = num(candidate.price ?? candidate.soldPrice, 0);
  if (price <= 0) {
    rules.push(rule('priced_sold', 'fail', 'No usable sold price'));
    hardFail = true;
  } else {
    rules.push(rule('priced_sold', 'pass'));
  }

  const dist = candidate.distanceMi != null ? num(candidate.distanceMi) : null;
  if (dist == null) {
    rules.push(rule('distance', 'soft', 'Distance unknown'));
  } else if (dist > 1.0) {
    rules.push(rule('distance', 'fail', `${dist.toFixed(2)} mi > 1.0`));
    hardFail = true;
  } else if (dist > 0.5) {
    rules.push(rule('distance', 'soft', `${dist.toFixed(2)} mi (prefer ≤0.5)`));
  } else {
    rules.push(rule('distance', 'pass', `${dist.toFixed(2)} mi`));
  }

  const subLot = num(subject.lotSqft, 0) || (num(subject.acres, 0) > 0 ? num(subject.acres) * 43560 : 0);
  const candLot = num(candidate.lotSqft, 0)
    || (num(candidate.acres, 0) > 0 ? num(candidate.acres) * 43560 : 0);
  if (subLot > 0 && candLot > 0) {
    const ratio = candLot / subLot;
    if (ratio < 0.6 || ratio > 1.4) {
      rules.push(rule('lot_size', 'fail', `Lot size ratio ${ratio.toFixed(2)} outside 0.6–1.4`));
      hardFail = true;
    } else if (ratio < 0.8 || ratio > 1.2) {
      rules.push(rule('lot_size', 'soft', `Lot size ratio ${ratio.toFixed(2)}`));
    } else {
      rules.push(rule('lot_size', 'pass', `Lot size ratio ${ratio.toFixed(2)}`));
    }
  } else {
    rules.push(rule('lot_size', 'soft', 'Lot size incomplete'));
  }

  const months = monthsSince(candidate.soldDate);
  if (months == null) {
    rules.push(rule('recency', 'soft', 'Sale date unknown'));
  } else if (months > 24) {
    rules.push(rule('recency', 'fail', `${months.toFixed(0)} mo > 24`));
    hardFail = true;
  } else if (months > 12) {
    rules.push(rule('recency', 'soft', `${months.toFixed(0)} mo`));
  } else {
    rules.push(rule('recency', 'pass', `${months.toFixed(0)} mo`));
  }

  const landLike = isLandLikeType(candidate.propertyType);
  const candSqft = num(candidate.sqft, 0);
  if (landLike === true || (candSqft > 0 && candSqft < 200 && candLot > 0)) {
    rules.push(rule('land_use', 'pass', 'Land / vacant-like'));
  } else if (landLike === false && candSqft >= 800) {
    rules.push(rule('land_use', 'fail', 'Looks like a house sale, not a lot'));
    hardFail = true;
  } else {
    rules.push(rule('land_use', 'soft', 'Land use uncertain'));
  }

  const included = !hardFail;
  return {
    candidate,
    rules,
    included,
    status: hardFail ? 'fail' : (rules.some((r) => r.status === 'soft') ? 'soft' : 'pass')
  };
}

module.exports = {
  scoreLandComp,
  isLandLikeType,
  acresFromLotSqft,
  monthsSince
};
