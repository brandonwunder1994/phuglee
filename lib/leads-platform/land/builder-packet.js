'use strict';

/**
 * Builder packet — one-pager text for land disposition (screen + LAO + funds).
 * Copy / download only — not a PSA generator.
 */

function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function fmtMoney(v) {
  const n = money(v);
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

function fmtAcres(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Math.round(n * 100) / 100} ac`;
}

function leadAcres(lead = {}) {
  const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
    ? lead.propertyDetails
    : {};
  if (pd.acres != null && Number.isFinite(Number(pd.acres)) && Number(pd.acres) > 0) {
    return Number(pd.acres);
  }
  if (pd.lotSqft != null && Number.isFinite(Number(pd.lotSqft)) && Number(pd.lotSqft) > 0) {
    return Number(pd.lotSqft) / 43560;
  }
  return null;
}

function leadZoning(lead = {}) {
  const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
    ? lead.propertyDetails
    : {};
  return String(pd.zoning || pd.zoningCode || pd.landUse || '').trim() || '';
}

function checkLine(id, label, check = {}) {
  const status = String(check.status || 'unknown').toUpperCase();
  const note = String(check.note || '').trim();
  return note ? `${label}: ${status} — ${note}` : `${label}: ${status}`;
}

function buildBuilderPacket(lead = {}, opts = {}) {
  const note = String(opts.note || '').trim();
  const screen = lead.landScreen && typeof lead.landScreen === 'object' ? lead.landScreen : {};
  const checks = screen.checks && typeof screen.checks === 'object' ? screen.checks : {};
  const uw = lead.landUnderwriting && typeof lead.landUnderwriting === 'object'
    ? lead.landUnderwriting
    : {};
  const funds = Array.isArray(lead.fundMatches) ? lead.fundMatches : [];
  const address = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const acres = leadAcres(lead);
  const zoning = leadZoning(lead);
  const verdict = String(screen.verdict || 'pending').toUpperCase();
  const recommended = String(screen.recommendedVerdict || '').toUpperCase();

  const lines = [
    'PHUGLEE — BUILDER PACKET (Land Desk)',
    '====================================',
    '',
    'SUBJECT',
    `  Address: ${address || '—'}`,
    `  Owner: ${lead.ownerName || '—'}`,
    `  Phones: ${(Array.isArray(lead.phones) && lead.phones.length) ? lead.phones.join(', ') : '—'}`,
    `  Acres: ${fmtAcres(acres)}`,
    `  Zoning: ${zoning || '—'}`,
    `  Asset: ${lead.assetClass === 'teardown' ? 'Teardown' : 'Vacant lot'}`,
    `  Signals: ${(Array.isArray(lead.signalTags) && lead.signalTags.length) ? lead.signalTags.join(', ') : '—'}`,
    '',
    'SCREEN',
    `  Verdict: ${verdict}${recommended && recommended !== verdict ? ` (recommended ${recommended})` : ''}`,
    `  Demand / builders nearby: ${String(screen.demandBuilders || 'unknown').toUpperCase()}`,
    checkLine('infill', '  Infill', checks.infill),
    checkLine('utilities', '  Utilities', checks.utilities),
    checkLine('pavedAccess', '  Paved access', checks.pavedAccess),
    checkLine('cleared', '  Cleared', checks.cleared),
    checkLine('flat', '  Flat', checks.flat),
    checkLine('flood', '  Flood', checks.flood),
    checkLine('zoning', '  Zoning check', checks.zoning),
    screen.verdictNote ? `  Note: ${screen.verdictNote}` : null,
    '',
    'LAO / OFFER MATH',
    `  Land FMV: ${fmtMoney(uw.landFmv)}`,
    `  Site costs: ${fmtMoney(uw.siteCosts)}`,
    `  Investor gap: ${fmtMoney(uw.investorGap != null ? uw.investorGap : 5000)}`,
    `  Assignment fee: ${fmtMoney(uw.assignmentFee)}`,
    `  Buyer ceiling: ${fmtMoney(uw.buyerCeiling)}`,
    `  Contract target: ${fmtMoney(uw.contractTarget)}`,
    `  LAO: ${fmtMoney(uw.lao)}`,
    uw.sanityWarning ? `  Sanity: ${uw.sanityWarning}` : null,
    '',
    'FUND / BUYER MATCH',
    ...(funds.length
      ? funds.slice(0, 8).map((f, i) => {
        const name = f.fundName || f.fundId || `Fund ${i + 1}`;
        const score = f.score != null ? ` · score ${f.score}` : '';
        const reasons = Array.isArray(f.reasons) && f.reasons.length
          ? ` — ${f.reasons.slice(0, 3).join('; ')}`
          : '';
        return `  ${i + 1}. ${name}${score}${reasons}`;
      })
      : ['  (none matched yet — run Fund match on Land Desk)']),
    '',
    note ? `OPERATOR NOTES\n  ${note}` : null,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Lead ID: ${lead.leadId || '—'}`,
    '',
    'Not a PSA. Numbers are underwriting notes for builder outreach.'
  ].filter((line) => line != null);

  const text = lines.join('\n');
  const slug = String(lead.address || lead.leadId || 'lot')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'lot';
  return {
    text,
    filename: `builder-packet-${slug}.txt`,
    acres,
    zoning
  };
}

module.exports = {
  leadAcres,
  leadZoning,
  buildBuilderPacket
};
