'use strict';

const RAILWAY_GQL = 'https://backboard.railway.com/graphql/v2';

/**
 * Railway Project Cost rates (match dashboard "Project Cost" table).
 * CPU / Memory / Volume / Backup metrics from the usage API are *minutely*
 * aggregates (sum of per-minute readings), not hours.
 */
const RATES = {
  /** $ per vCPU / minute */
  CPU_USAGE: Number(process.env.RAILWAY_USD_PER_VCPU_MINUTE) || 0.000463,
  /** $ per GB / minute RAM */
  MEMORY_USAGE_GB: Number(process.env.RAILWAY_USD_PER_GB_MINUTE) || 0.000231,
  /** $ per GB egress (Hobby is $0.05/GB) */
  NETWORK_TX_GB: Number(process.env.RAILWAY_USD_PER_GB_EGRESS) || 0.05,
  /** $ per GB / minute volume */
  DISK_USAGE_GB: Number(process.env.RAILWAY_USD_PER_GB_DISK_MINUTE) || 0.00000347,
  /** $ per GB / minute backup */
  BACKUP_USAGE_GB: Number(process.env.RAILWAY_USD_PER_GB_BACKUP_MINUTE) || 0.00000347
};

function getToken() {
  return String(process.env.RAILWAY_API_TOKEN || '').trim();
}

async function gql(headers, query, variables = {}) {
  const res = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.errors?.[0]?.message || `Railway HTTP ${res.status}`);
    err.code = 'RAILWAY_HTTP';
    err.status = res.status;
    throw err;
  }
  if (json.errors?.length) {
    const err = new Error(json.errors[0].message || 'Railway GraphQL error');
    err.code = 'RAILWAY_GQL';
    err.details = json.errors;
    throw err;
  }
  return json.data;
}

function moneyFromUsage(rows) {
  let total = 0;
  const breakdown = {};
  for (const row of rows || []) {
    const m = row.measurement;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    const rate = RATES[m];
    if (rate == null) continue;
    const usd = value * rate;
    breakdown[m] = {
      value,
      rate,
      usd: Number(usd.toFixed(4))
    };
    total += usd;
  }
  return { totalUsd: Number(total.toFixed(2)), breakdown };
}

/**
 * Project tokens use Project-Access-Token and expose resource usage (not invoice $).
 * @param {string} token
 * @param {{ from?: string, to?: string }} [range] calendar YYYY-MM-DD bounds (UTC)
 */
async function fetchViaProjectToken(token, range = {}) {
  const headers = { 'Project-Access-Token': token };
  const meta = await gql(headers, 'query { projectToken { projectId environmentId } }');
  const projectId = meta?.projectToken?.projectId;
  if (!projectId) {
    const err = new Error('Project token did not return a projectId');
    err.code = 'RAILWAY_NO_PROJECT';
    throw err;
  }

  let projectName = null;
  try {
    const p = await gql(
      headers,
      `query($id: String!) { project(id: $id) { id name } }`,
      { id: projectId }
    );
    projectName = p?.project?.name || null;
  } catch (_) {
    /* optional */
  }

  const from = range.from ? String(range.from).slice(0, 10) : null;
  const to = range.to ? String(range.to).slice(0, 10) : null;
  const useRange = !!(from && to);

  let usageData;
  if (useRange) {
    usageData = await gql(
      headers,
      `query($id: String!, $start: DateTime!, $end: DateTime!) {
        usage(
          projectId: $id
          startDate: $start
          endDate: $end
          measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB, BACKUP_USAGE_GB]
        ) {
          measurement
          value
        }
      }`,
      {
        id: projectId,
        start: `${from}T00:00:00.000Z`,
        end: `${to}T23:59:59.999Z`
      }
    );
  } else {
    usageData = await gql(
      headers,
      `query($id: String!) {
        usage(
          projectId: $id
          measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB, BACKUP_USAGE_GB]
        ) {
          measurement
          value
        }
      }`,
      { id: projectId }
    );
  }

  const { totalUsd, breakdown } = moneyFromUsage(usageData?.usage || []);

  return {
    ok: true,
    source: 'current_usage',
    tokenType: 'project',
    workspaceId: null,
    projectId,
    projectName,
    periodFrom: from,
    periodTo: to,
    currentPeriodUsd: totalUsd,
    latestInvoiceId: null,
    rawNextInvoiceCurrentTotal: null,
    usageBreakdown: breakdown,
    note: useRange
      ? `Calendar-month Project Cost (${from} → ${to}), same rates as Railway Usage → Project Cost.`
      : 'Current Railway billing-period Project Cost (same math as dashboard).'
  };
}

/**
 * Account / workspace tokens use Bearer and can read subscription invoice totals.
 */
async function fetchViaAccountOrWorkspaceToken(token) {
  const headers = { Authorization: `Bearer ${token}` };
  let workspaceId = String(process.env.RAILWAY_WORKSPACE_ID || '').trim();

  if (!workspaceId) {
    try {
      const me = await gql(
        headers,
        `query { me { workspaces { id name } } }`
      );
      const list = me?.me?.workspaces || [];
      if (list.length) workspaceId = list[0].id;
    } catch (_) {
      /* workspace token may not support me */
    }
  }

  if (!workspaceId) {
    const err = new Error(
      'Set RAILWAY_WORKSPACE_ID for this token, or use an account token that can list workspaces'
    );
    err.code = 'RAILWAY_NO_WORKSPACE';
    throw err;
  }

  const data = await gql(
    headers,
    `query($workspaceId: String!) {
      workspace(workspaceId: $workspaceId) {
        id
        name
        customer {
          subscriptions {
            latestInvoiceId
            nextInvoiceCurrentTotal
          }
        }
      }
    }`,
    { workspaceId }
  );

  const subs = data?.workspace?.customer?.subscriptions;
  const sub = Array.isArray(subs) ? subs[0] : subs;
  const rawTotal = sub?.nextInvoiceCurrentTotal;
  let currentPeriodUsd = null;
  if (rawTotal != null && Number.isFinite(Number(rawTotal))) {
    const n = Number(rawTotal);
    // Invoice totals are typically integer cents
    currentPeriodUsd = Number.isInteger(n) && n >= 100 ? Number((n / 100).toFixed(2)) : Number(n.toFixed(2));
  }

  return {
    ok: true,
    source: 'live_invoice',
    tokenType: 'account_or_workspace',
    workspaceId,
    projectId: null,
    projectName: data?.workspace?.name || null,
    currentPeriodUsd,
    latestInvoiceId: sub?.latestInvoiceId || null,
    rawNextInvoiceCurrentTotal: rawTotal ?? null,
    usageBreakdown: null,
    note: null
  };
}

/**
 * @param {{ from?: string, to?: string }} [range]
 * @returns {Promise<object>}
 */
async function fetchRailwaySpend(range = {}) {
  const token = getToken();
  if (!token) {
    return {
      ok: false,
      source: 'live',
      workspaceId: null,
      currentPeriodUsd: null,
      latestInvoiceId: null,
      error: 'RAILWAY_API_TOKEN is not set',
      code: 'RAILWAY_NOT_CONFIGURED'
    };
  }

  // Prefer project-token path when the UUID works as Project-Access-Token
  try {
    return await fetchViaProjectToken(token, range);
  } catch (projectErr) {
    try {
      return await fetchViaAccountOrWorkspaceToken(token);
    } catch (accountErr) {
      return {
        ok: false,
        source: 'live',
        workspaceId: null,
        currentPeriodUsd: null,
        latestInvoiceId: null,
        error:
          accountErr.message ||
          projectErr.message ||
          'Railway spend unavailable',
        code: accountErr.code || projectErr.code || 'RAILWAY_ERROR',
        detail: {
          projectToken: projectErr.message,
          accountToken: accountErr.message
        }
      };
    }
  }
}

module.exports = {
  getToken,
  fetchRailwaySpend,
  RATES
};
