/**
 * Ask-price + freshness helpers for Buyers desk.
 * Browser + Node (tests).
 */
(function (root) {
  'use strict';

  const STALE_DAYS = 90;

  const SPEED_RANK = {
    hours: 5,
    fast: 4,
    weekly: 3,
    normal: 2,
    process: 1
  };

  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function money(n) {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.round(n);
  }

  function formatMoney(n) {
    const m = money(n);
    if (m == null) return null;
    return '$' + m.toLocaleString('en-US');
  }

  function parsePctFromNotes(text) {
    const s = String(text || '');
    const m = s.match(/(\d{2,3})\s*%?\s*[–\-to]+\s*(\d{2,3})\s*%/);
    if (m) {
      return { min: Number(m[1]) / 100, max: Number(m[2]) / 100 };
    }
    const one = s.match(/~?\s*(\d{2,3})\s*%\s*of\s*ARV/i);
    if (one) {
      const p = Number(one[1]) / 100;
      return { min: p, max: p };
    }
    return null;
  }

  function exitBand(buyer) {
    if (!buyer) return null;
    let min = num(buyer.exitPctArvMin);
    let max = num(buyer.exitPctArvMax);
    if (min == null && max == null) {
      const parsed = parsePctFromNotes(buyer.pitchNotes);
      if (parsed) {
        min = parsed.min;
        max = parsed.max;
      }
    }
    if (min == null && max == null) return null;
    if (min == null) min = max;
    if (max == null) max = min;
    if (min > 1) min /= 100;
    if (max > 1) max /= 100;
    return { min, max, mid: (min + max) / 2 };
  }

  /**
   * Suggest ask to this buyer: mid exit% × ARV − rehab (when formula is arv_pct_minus_rehab).
   */
  function suggestAsk(buyer, deal) {
    const band = exitBand(buyer);
    const arv = num(deal && deal.arv);
    const rehab = num(deal && deal.rehab) || 0;
    const asking = num(deal && deal.asking);
    if (!band || arv == null || arv <= 0) {
      return {
        ok: false,
        low: null,
        mid: null,
        high: null,
        label: null,
        vsAsking: null,
        vsMao: null
      };
    }
    const formula = buyer.exitFormula || 'arv_pct_minus_rehab';
    let low;
    let mid;
    let high;
    if (formula === 'arv_pct_minus_rehab') {
      low = money(arv * band.min - rehab);
      mid = money(arv * band.mid - rehab);
      high = money(arv * band.max - rehab);
    } else {
      low = money(arv * band.min);
      mid = money(arv * band.mid);
      high = money(arv * band.max);
    }
    const pctLabel = Math.round(band.min * 100) + '–' + Math.round(band.max * 100) + '% ARV − rehab';
    let vsAsking = null;
    if (asking != null && mid != null) {
      vsAsking = mid - asking;
    }
    return {
      ok: true,
      low,
      mid,
      high,
      pctMin: band.min,
      pctMax: band.max,
      label: formatMoney(mid) + ' ask (' + pctLabel + ')',
      rangeLabel: formatMoney(low) + '–' + formatMoney(high),
      vsAsking,
      vsAskingLabel: vsAsking == null
        ? null
        : (vsAsking >= 0
          ? formatMoney(vsAsking) + ' above contract'
          : formatMoney(Math.abs(vsAsking)) + ' under contract')
    };
  }

  function speedRank(buyer) {
    const s = String((buyer && buyer.personality && buyer.personality.speed) || 'normal').toLowerCase();
    return SPEED_RANK[s] || 2;
  }

  function daysSince(iso) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  }

  function isStale(buyer, days = STALE_DAYS) {
    const d = daysSince(buyer && buyer.updatedAt);
    if (d == null) return false;
    return d > days;
  }

  function staleLabel(buyer) {
    if (!isStale(buyer)) return null;
    const d = daysSince(buyer.updatedAt);
    return 'Criteria may be old (' + d + 'd)';
  }

  const api = {
    STALE_DAYS,
    SPEED_RANK,
    num,
    formatMoney,
    exitBand,
    suggestAsk,
    speedRank,
    daysSince,
    isStale,
    staleLabel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuyersAsk = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
