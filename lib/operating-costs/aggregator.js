'use strict';

const { readRateCard } = require('./rate-card');
const { fetchRailwaySpend } = require('./railway-client');
const { readMapsGeminiUsage } = require('./analyzer-usage');
const { listCharges, periodBounds, load: loadGhlStore } = require('./ghl-import-store');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Number(x.toFixed(2));
}

/**
 * Build full Operating Costs snapshot for a billing period (YYYY-MM).
 */
async function buildOperatingCostsSnapshot(periodArg) {
  const { period, from, to } = periodBounds(periodArg);
  const rateCard = readRateCard();
  const [railway, analyzer] = await Promise.all([fetchRailwaySpend(), Promise.resolve(readMapsGeminiUsage())]);

  const ghlUsage = listCharges({ from, to });
  // Fixed GHL subscription is a rate-card line (not double-count if import also has subscription rows).
  // When imported category 'subscription' exists for the period, prefer imported sum for that bucket
  // and still show rate-card as the planned fixed line separately.
  const ghlImportedUsageUsd = money(
    ghlUsage.byCategory
      .filter((c) => c.category !== 'subscription')
      .reduce((s, c) => s + c.totalUsd, 0)
  );
  const ghlImportedSubscriptionUsd = money(
    (ghlUsage.byCategory.find((c) => c.category === 'subscription') || { totalUsd: 0 }).totalUsd
  );

  const mapsUsd = analyzer.ok ? money(analyzer.maps?.estimatedUsd) : 0;
  const railwayUsd = railway.ok && railway.currentPeriodUsd != null ? money(railway.currentPeriodUsd) : 0;
  const signnowUsd = money(rateCard.signnowPlanMonthlyUsd);
  const ghlPlanUsd = money(rateCard.ghlPlanMonthlyUsd);

  // Month total: Railway (live period) + GHL plan + GHL imported non-sub usage + SignNow + Maps.
  // Gemini has no reliable $ on free tier — show usage only, $0 unless we add a rate later.
  const geminiUsd = 0;

  const services = {
    railway: {
      id: 'railway',
      label: 'Railway',
      status: railway.ok ? (railway.source === 'usage_estimate' ? 'estimated' : 'live') : 'error',
      amountUsd: railwayUsd,
      detail: railway.ok
        ? railway.source === 'usage_estimate'
          ? `Est. from usage${railway.projectName ? ` · ${railway.projectName}` : ''}${railway.note ? ' · project token' : ''}`
          : `Current billing period (live)${railway.latestInvoiceId ? ` · invoice ${railway.latestInvoiceId}` : ''}`
        : railway.error || 'Unavailable',
      code: railway.code || null,
      meta: {
        workspaceId: railway.workspaceId,
        projectId: railway.projectId,
        projectName: railway.projectName,
        source: railway.source,
        tokenType: railway.tokenType,
        latestInvoiceId: railway.latestInvoiceId,
        rawNextInvoiceCurrentTotal: railway.rawNextInvoiceCurrentTotal,
        usageBreakdown: railway.usageBreakdown || null,
        note: railway.note || null
      }
    },
    ghl: {
      id: 'ghl',
      label: 'Go High Level',
      status: 'hybrid',
      amountUsd: money(ghlPlanUsd + ghlImportedUsageUsd),
      planUsd: ghlPlanUsd,
      planName: rateCard.ghlPlanName,
      importedUsageUsd: ghlImportedUsageUsd,
      importedSubscriptionUsd: ghlImportedSubscriptionUsd,
      detail: `${rateCard.ghlPlanName} plan $${ghlPlanUsd.toFixed(2)} + $${ghlImportedUsageUsd.toFixed(2)} usage (import)`,
      byCategory: ghlUsage.byCategory,
      chargeCount: ghlUsage.charges.length
    },
    signnow: {
      id: 'signnow',
      label: 'SignNow',
      status: 'fixed',
      amountUsd: signnowUsd,
      planName: rateCard.signnowPlanName,
      detail: `${rateCard.signnowPlanName} plan (fixed monthly)`
    },
    maps: {
      id: 'maps',
      label: 'Google Maps',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: mapsUsd,
      detail: analyzer.ok
        ? `${analyzer.maps?.okCalls || 0} billed-est calls this month · ~$${mapsUsd.toFixed(2)}`
        : analyzer.error || 'Ledger unavailable',
      meta: analyzer.ok ? analyzer.maps : null
    },
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: geminiUsd,
      detail: analyzer.ok
        ? `${analyzer.gemini?.usedToday || 0} calls today (est. free-tier; $ tracked as $0)`
        : analyzer.error || 'Ledger unavailable',
      meta: analyzer.ok ? analyzer.gemini : null
    }
  };

  const monthTotalUsd = money(
    railwayUsd + ghlPlanUsd + ghlImportedUsageUsd + signnowUsd + mapsUsd + geminiUsd
  );

  const ghlStore = loadGhlStore();

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    period: { id: period, from, to },
    monthTotalUsd,
    services,
    rateCard,
    ghlWatermark: ghlStore.watermark,
    analyzerNote: analyzer.note || null
  };
}

module.exports = {
  buildOperatingCostsSnapshot
};
