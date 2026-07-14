'use strict';

const { readRateCard } = require('./rate-card');
const { fetchRailwaySpend } = require('./railway-client');
const { readMapsGeminiUsage } = require('./analyzer-usage');
const { listCharges, periodBounds, load: loadGhlStore } = require('./ghl-import-store');
const { billingLinks } = require('./billing-links');

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
  const ghlFamily = ghlUsage.byFamily || {};
  const ghlLedgerUsageUsd = money(ghlFamily.usage?.totalUsd || 0);
  const ghlTaxUsd = money(ghlFamily.tax?.totalUsd || 0);
  const ghlTopupUsd = money(ghlFamily.topup?.totalUsd || ghlUsage.topupUsd || 0);
  // Spend imports: wallet usage + sales tax (top-ups are funding, not operating cost).
  const ghlImportedUsageUsd = money(ghlLedgerUsageUsd + ghlTaxUsd);
  const ghlImportedSubscriptionUsd = money(
    (ghlUsage.byCategory.find((c) => c.category === 'subscription') || { totalUsd: 0 }).totalUsd
  );

  const mapsUsd = analyzer.ok ? money(analyzer.maps?.estimatedUsd) : 0;
  const railwayUsd = railway.ok && railway.currentPeriodUsd != null ? money(railway.currentPeriodUsd) : 0;
  const signnowUsd = money(rateCard.signnowPlanMonthlyUsd);
  const ghlPlanUsd = money(rateCard.ghlPlanMonthlyUsd);
  const geminiUsd = 0;
  const geminiCalls = analyzer.ok ? Number(analyzer.gemini?.usedMonth) || 0 : 0;
  const portals = billingLinks({ railwayProjectId: railway.projectId || null });

  const creditGranted =
    rateCard.gcpPromoCreditGrantedUsd != null ? money(rateCard.gcpPromoCreditGrantedUsd) : null;
  const creditRemaining =
    rateCard.gcpPromoCreditRemainingUsd != null ? money(rateCard.gcpPromoCreditRemainingUsd) : null;
  const googleCloudCredit = {
    // Google Cloud Billing promotional credits — not available via a simple API.
    source: 'manual',
    note:
      'Google does not publish a live promo-credit balance API. Paste Granted / Remaining from Cloud Console → Billing → Credits. This credit pays Maps and other GCP SKUs; it does not pay Gemini API / AI Studio.',
    grantedUsd: creditGranted,
    remainingUsd: creditRemaining,
    usedUsd:
      creditGranted != null && creditRemaining != null
        ? money(Math.max(0, creditGranted - creditRemaining))
        : null,
    mapsBurnUsdThisMonth: mapsUsd,
    billing: portals.maps
  };

  // Maps estimate is credit burn while promo remaining covers it — keep $0 cash on the card.
  const mapsCashUsd =
    creditRemaining != null && creditRemaining > 0 ? 0 : mapsUsd;
  const mapsCoveredByCredit = creditRemaining != null && creditRemaining > 0;

  const services = {
    railway: {
      id: 'railway',
      label: 'Railway',
      provider: 'Railway',
      status: railway.ok ? 'live' : 'error',
      amountUsd: railwayUsd,
      detail: railway.ok
        ? `${label} usage${railway.projectName ? ` · ${railway.projectName}` : ''}`
        : railway.error || 'Unavailable',
      code: railway.code || null,
      billing: portals.railway,
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
      provider: 'Go High Level',
      status: 'hybrid',
      amountUsd: money(ghlPlanUsd + ghlImportedUsageUsd),
      planUsd: ghlPlanUsd,
      planName: rateCard.ghlPlanName,
      importedUsageUsd: ghlImportedUsageUsd,
      importedSubscriptionUsd: ghlImportedSubscriptionUsd,
      ledgerUsageUsd: ghlLedgerUsageUsd,
      taxUsd: ghlTaxUsd,
      topupUsd: ghlTopupUsd,
      byFamily: ghlFamily,
      detail:
        `${label} · ${rateCard.ghlPlanName} $${ghlPlanUsd.toFixed(2)}` +
        ` + $${ghlLedgerUsageUsd.toFixed(2)} usage` +
        ` + $${ghlTaxUsd.toFixed(2)} tax` +
        (ghlTopupUsd ? ` · $${ghlTopupUsd.toFixed(2)} top-ups (funding, not spend)` : ''),
      byCategory: ghlUsage.byCategory,
      chargeCount: ghlUsage.charges.length,
      billing: portals.ghl
    },
    signnow: {
      id: 'signnow',
      label: 'SignNow',
      provider: 'SignNow',
      status: 'fixed',
      amountUsd: signnowUsd,
      planName: rateCard.signnowPlanName,
      detail: `${label} · ${rateCard.signnowPlanName} plan (fixed)`,
      billing: portals.signnow
    },
    maps: {
      id: 'maps',
      label: 'Google Maps',
      provider: 'Google Cloud',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: mapsCashUsd,
      usageUsd: mapsUsd,
      coveredByCredit: mapsCoveredByCredit,
      detail: analyzer.ok
        ? mapsCoveredByCredit
          ? `${label} · ~$${mapsUsd.toFixed(2)} Maps usage burning Cloud promo credit · ${analyzer.maps?.okCalls || 0} calls · cash $0 while credit remains`
          : `${label} · Google Cloud Maps · ${analyzer.maps?.okCalls || 0} calls · ~$${mapsUsd.toFixed(2)} est.`
        : analyzer.error || 'Ledger unavailable',
      billing: portals.maps,
      meta: analyzer.ok ? { ...analyzer.maps, credit: googleCloudCredit } : { credit: googleCloudCredit }
    },
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      provider: 'Google AI Studio (not Cloud credit)',
      status: analyzer.ok ? 'live' : 'error',
      amountUsd: geminiUsd,
      detail: analyzer.ok
        ? `${label} · ${geminiCalls} calls · separate from Google Cloud promo credits (AI Studio free tier / Gemini API billing)`
        : analyzer.error || 'Ledger unavailable',
      billing: portals.gemini,
      meta: analyzer.ok ? analyzer.gemini : null
    }
  };

  const monthTotalUsd = money(
    railwayUsd + ghlPlanUsd + ghlImportedUsageUsd + signnowUsd + mapsCashUsd + geminiUsd
  );

  const ghlStore = loadGhlStore();

  const stackRows = [
    {
      id: 'railway',
      label: 'Railway hosting',
      blurb: 'App server, volume, and network',
      amountUsd: railwayUsd,
      billing: portals.railway
    },
    {
      id: 'ghl-plan',
      label: 'GHL subscription',
      blurb: rateCard.ghlPlanName || 'Plan fee',
      amountUsd: ghlPlanUsd,
      billing: portals.ghl
    },
    {
      id: 'ghl-usage',
      label: 'GHL wallet usage',
      blurb: 'SMS, phone, email, numbers from transaction CSV',
      amountUsd: ghlLedgerUsageUsd,
      billing: portals.ghl
    },
    {
      id: 'ghl-tax',
      label: 'GHL sales tax',
      blurb: 'Wallet sales-tax invoices',
      amountUsd: ghlTaxUsd,
      billing: portals.ghl
    },
    {
      id: 'signnow',
      label: 'SignNow',
      blurb: rateCard.signnowPlanName || 'eSign plan',
      amountUsd: signnowUsd,
      billing: portals.signnow
    },
    {
      id: 'maps',
      label: mapsCoveredByCredit
        ? 'Google Maps (Cloud credit burn)'
        : 'Google Maps (Google Cloud)',
      blurb: mapsCoveredByCredit
        ? `~$${mapsUsd.toFixed(2)} usage this month · cash $0 while promo credit remains`
        : 'Maps Platform — Street View / Static / geocode',
      amountUsd: mapsCashUsd,
      billing: portals.maps
    },
    {
      id: 'gemini',
      label: 'Google Gemini (AI Studio)',
      blurb: analyzer.ok
        ? `${geminiCalls} calls this month · not paid from Cloud promo credit`
        : 'AI classify / photo labels — separate Gemini / AI Studio billing',
      amountUsd: geminiUsd,
      billing: portals.gemini
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
    ghlFamily: {
      usage: ghlFamily.usage || { kind: 'usage', count: 0, totalUsd: 0 },
      tax: ghlFamily.tax || { kind: 'tax', count: 0, totalUsd: 0 },
      topup: {
        ...(ghlFamily.topup || { kind: 'topup', count: 0, totalUsd: 0 }),
        isFunding: true,
        note: 'Card / cash into the wallet — not operating spend'
      }
    },
    ghlImportedTotalUsd: money(ghlUsage.totalUsd),
    ghlTopupUsd,
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
    googleCloudCredit,
    ghlWatermark: ghlStore.watermark,
    ghlWalletBalance: ghlStore.walletBalance || null,
    ghlFamily: teamBrief.ghlFamily,
    analyzerNote: analyzer.note || null
  };
}

module.exports = {
  buildOperatingCostsSnapshot,
  periodLabel
};
