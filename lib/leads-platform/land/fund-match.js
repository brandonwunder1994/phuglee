'use strict';

const { readCatalog } = require('../../buyers/store');

function str(v) {
  return String(v == null ? '' : v).trim();
}

function lower(v) {
  return str(v).toLowerCase();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isLandBuyBox(box = {}) {
  if (box.landOnly) return true;
  const assets = Array.isArray(box.assetTypes) ? box.assetTypes.map(lower) : [];
  return assets.includes('land') || assets.includes('teardown');
}

function isLandFund(fund = {}) {
  const clusters = Array.isArray(fund.strategyClusters) ? fund.strategyClusters.map(lower) : [];
  if (clusters.includes('land')) return true;
  return (fund.buyBoxes || []).some(isLandBuyBox);
}

function leadAcres(lead = {}) {
  if (lead.acres != null) return num(lead.acres);
  const pd = lead.propertyDetails || {};
  if (pd.acres != null) return num(pd.acres);
  if (pd.lotAcres != null) return num(pd.lotAcres);
  return null;
}

function leadFloodFail(lead = {}) {
  const screen = lead.landScreen || {};
  if (screen.checks?.flood?.status === 'fail') return true;
  if (screen.checks?.flood?.status === 'pass') return false;
  const tags = (lead.signalTags || []).map(lower);
  if (tags.some((t) => t.includes('flood'))) return true;
  return null;
}

function scoreBuyBox(lead, fund, box) {
  let score = 0;
  const reasons = [];
  const gaps = [];

  const leadState = str(lead.state).toUpperCase().slice(0, 2);
  const boxStates = (box.states || []).map((s) => str(s).toUpperCase().slice(0, 2)).filter(Boolean);
  if (boxStates.length) {
    if (leadState && boxStates.includes(leadState)) {
      score += 25;
      reasons.push(`State ${leadState}`);
    } else if (leadState) {
      return null;
    } else {
      gaps.push('state unknown');
    }
  }

  const zip = str(lead.zip);
  const prefixes = (box.zipPrefixes || []).map(str).filter(Boolean);
  if (prefixes.length) {
    if (zip && prefixes.some((p) => zip.startsWith(p))) {
      score += 30;
      reasons.push(`Zip ${zip}`);
    } else if (zip) {
      score -= 10;
      gaps.push('zip outside buy box');
    } else {
      gaps.push('zip unknown');
    }
  }

  const markets = (box.markets || []).map(lower).filter(Boolean);
  const city = lower(lead.city);
  if (markets.length) {
    if (city && markets.some((m) => city.includes(m) || m.includes(city))) {
      score += 20;
      reasons.push(`Market ${lead.city}`);
    } else if (city) {
      gaps.push('city not in named markets');
    } else {
      gaps.push('city unknown');
    }
  }

  const acres = leadAcres(lead);
  const minA = num(box.minAcres);
  const maxA = num(box.maxAcres);
  if (minA != null || maxA != null) {
    if (acres == null) {
      gaps.push('acres unknown');
      score += 5;
    } else if ((minA == null || acres >= minA) && (maxA == null || acres <= maxA)) {
      score += 20;
      reasons.push(`${acres} ac in range`);
    } else {
      return null;
    }
  }

  if (box.noFlood) {
    const floodFail = leadFloodFail(lead);
    if (floodFail === true) return null;
    if (floodFail === false) {
      score += 10;
      reasons.push('Outside flood');
    } else {
      gaps.push('flood unknown');
    }
  }

  const maxPurchase = num(box.maxPurchase);
  const ask = num(lead.askPrice || lead.askingPrice || lead.estEquity);
  if (maxPurchase != null && ask != null) {
    if (ask <= maxPurchase) {
      score += 10;
      reasons.push(`Ask ≤ $${maxPurchase.toLocaleString()}`);
    } else {
      gaps.push('ask above max purchase');
      score -= 5;
    }
  }

  if (isLandBuyBox(box)) {
    score += 5;
    reasons.push('Land buy box');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (score < 15 && gaps.length && !reasons.length) return null;

  return {
    fundId: fund.id,
    fundName: fund.name || fund.id,
    buyBoxId: box.id || '',
    score,
    oneLiner: fund.oneLiner || '',
    reasons,
    gaps
  };
}

function matchLandFunds(lead = {}, catalog = null) {
  const cat = catalog || readCatalog();
  const funds = Array.isArray(cat.funds) ? cat.funds : [];
  const matches = [];

  for (const fund of funds) {
    if (!isLandFund(fund)) continue;
    const boxes = (fund.buyBoxes || []).filter(isLandBuyBox);
    if (!boxes.length) continue;
    let best = null;
    for (const box of boxes) {
      const hit = scoreBuyBox(lead, fund, box);
      if (!hit) continue;
      if (!best || hit.score > best.score) best = hit;
    }
    if (best) matches.push(best);
  }

  return matches.sort((a, b) => b.score - a.score || a.fundName.localeCompare(b.fundName));
}

module.exports = {
  matchLandFunds,
  isLandFund,
  isLandBuyBox,
  leadAcres
};
