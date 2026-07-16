(function (root) {
  'use strict';

  function line(label, value) {
    if (value == null || value === '') return null;
    return label + ': ' + value;
  }

  function buildPitch(fund, row, deal) {
    const box = row && row.bestBox;
    const hits = (row && row.hits) || [];
    const blockers = (row && row.blockers) || [];
    const addr = [deal && deal.address, deal && deal.city, deal && deal.state, deal && deal.zip]
      .filter(Boolean)
      .join(', ') || '[address]';

    const parts = [
      (fund.name || 'Fund') + ' — why this fits',
      line('Market', [deal && deal.city, deal && deal.state].filter(Boolean).join(', ')),
      line('Box', box && box.boxLabel),
      line('Fit', row ? (row.tier + ' · ' + row.score + '%') : null),
      hits.length ? 'Hits: ' + hits.map((h) => h.reason).slice(0, 6).join('; ') : null,
      blockers.length ? 'Blockers to confirm: ' + blockers.map((b) => b.reason).slice(0, 4).join('; ') : null,
      'Deal: ' + addr,
      fund.oneLiner ? 'One-liner: ' + fund.oneLiner : null
    ].filter(Boolean);

    return parts.join('\n');
  }

  function buildCompareSummary(rows) {
    const lines = ['Buyers compare'];
    for (const row of rows || []) {
      const f = row.fund || {};
      lines.push('');
      lines.push(f.name + ' — ' + row.tier + ' ' + row.score + '%');
      if (row.bestBox) lines.push('Box: ' + row.bestBox.boxLabel);
      const markets = ((f.buyBoxes || [])[0] || {}).markets || [];
      if (markets.length) lines.push('Markets: ' + markets.slice(0, 8).join(', '));
      if (row.blockers && row.blockers.length) {
        lines.push('Blockers: ' + row.blockers.map((b) => b.reason).join('; '));
      }
      if (f.pitchNotes) lines.push('Notes: ' + f.pitchNotes);
    }
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  const api = { buildPitch, buildCompareSummary, copyText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuyersPitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
