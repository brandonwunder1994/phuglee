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

function periodLabel(periodId) {
  const m = String(periodId || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(periodId || '');
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  const name = months[Number(m[2]) - 1] || m[2];
  return `${name} ${m[1]}`;
}

/**
 * Build full Operating Costs snapshot for a calendar month (YYYY-MM).
 * All usage-based lines are scoped to that month so you can compare months.
 */
async function buildOperatingCostsSnapshot(periodArg) {
  const { period, from, to } = periodBounds(periodArg);
  const label = periodLabel(period);
  const rateCard = readRateCard();
  const [railway, analyzer] = await Promise.all([
    fetchRailwaySpend({ from, to }),
    Promise.resolve(readMapsGeminiUsage(period))
  ]);

  const ghlUsage = listCharges({ from, to });
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
  const geminiUsd = 0;

  const services = {
    railway: {
      id: 'railway',
      label: 'Railway',
      status: railway.ok ? 'live' : 'error',
      amountUsd: railwayUsd,
      detail: railway.ok
        ? `${label} usage${railway.projectName ? ` · ${railway.projectName}` : ''}`
        : railway.error || 'Unavailable',
      code: railway.code || null,
      meta: {
        workspaceId: railway.workspaceId,
        projectId: railway.projectId,
        projectName: railway.projectName,
        source: railway.source,
        tokenType: railway.tokenType,
        periodFrom: railway.periodFrom || from,
        periodTo: railway.periodTo || to,
        latestInvoiceId: railway.latestInvoiceId,
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
      detail: `${label} · ${rateCard.ghlPlanName} $${ghlPlanUsd.toFixed(2)} + $${ghlImportedUsageUsd.toFixed(2)} usage (import)`,
      byCategory: ghlUsage.byCategory,
      chargeCount: ghlUsage.charges.length
    },
    signnow: {
      id: 'signnow',
      label: 'SignNow',
      status: 'fixed',
      amountUsd: signnowUsd,
      planName: rateCard.signnowPlanName,
      detail: `${label} · ${rateCard.signnowPlanName} plan (fixed)`
    },
    maps: {
      id: 'maps',
      label: 'Google Maps',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: mapsUsd,
      detail: analyzer.ok
        ? `${label} · ${analyzer.maps?.okCalls || 0} billed-est calls · ~$${mapsUsd.toFixed(2)}`
        : analyzer.error || 'Ledger unavailable',
      meta: analyzer.ok ? analyzer.maps : null
    },
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: geminiUsd,
      detail: analyzer.ok
        ? `${label} · ${analyzer.gemini?.usedMonth || 0} calls (est. free-tier; $ tracked as $0)`
        : analyzer.error || 'Ledger unavailable',
      meta: analyzer.ok ? analyzer.gemini : null
    }
  };

  const monthTotalUsd = money(
    railwayUsd + ghlPlanUsd + ghlImportedUsageUsd + signnowUsd + mapsUsd + geminiUsd
  );

  const ghlStore = loadGhlStore();

  const stackRows = [
    {
      id: 'railway',
      label: 'Railway hosting',
      blurb: 'App server, volume, and network',
      amountUsd: railwayUsd
    },
    {
      id: 'ghl-plan',
      label: 'GHL subscription',
      blurb: rateCard.ghlPlanName || 'Plan fee',
      amountUsd: ghlPlanUsd
    },
    {
      id: 'ghl-usage',
      label: 'GHL usage (imported)',
      blurb: 'SMS, phone, email, AI, numbers from exports',
      amountUsd: ghlImportedUsageUsd
    },
    {
      id: 'signnow',
      label: 'SignNow',
      blurb: rateCard.signnowPlanName || 'eSign plan',
      amountUsd: signnowUsd
    },
    {
      id: 'maps',
      label: 'Google Maps',
      blurb: 'Street View / Static / geocode (app ledger)',
      amountUsd: mapsUsd
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      blurb: analyzer.ok
        ? `${analyzer.gemini?.usedMonth || 0} calls this month (tracked $0 on free tier)`
        : 'AI classify / photo labels',
      amountUsd: geminiUsd
    }
  ]
    .map((row) => ({
      ...row,
      amountUsd: money(row.amountUsd),
      sharePct:
        monthTotalUsd > 0 ? Number(((row.amountUsd / monthTotalUsd) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd);

  const teamBrief = {
    title: `${label} spend brief`,
    subtitle: 'Use this in team meetings — what we pay for and why',
    monthTotalUsd,
    stack: stackRows,
    ghlBuckets: (ghlUsage.byCategory || []).map((c) => ({
      ...c,
      label: c.label || c.category,
      sharePct:
        ghlUsage.totalUsd > 0
          ? Number(((c.totalUsd / ghlUsage.totalUsd) * 100).toFixed(1))
          : 0
    })),
    ghlKinds: ghlUsage.byKind || [],
    ghlImportedTotalUsd: money(ghlUsage.totalUsd),
    ghlChargeCount: ghlUsage.charges.length
  };

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    period: { id: period, from, to, label },
    monthTotalUsd,
    services,
    teamBrief,
    rateCard,
    ghlWatermark: ghlStore.watermark,
    analyzerNote: analyzer.note || null
  };
}

module.exports = {
  buildOperatingCostsSnapshot,
  periodLabel
};
