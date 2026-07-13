const { readPhugleeUser, readPhugleePlan } = require('../phuglee-user');
const {
  queryLeads,
  getLead,
  getMeta,
  getLeadsByIds,
  upsertLead
} = require('./store');
const { readOverlays, toggleFavorite, bulkSetFavorites, upsertNote, savePresets } = require('./user-overlays');
const { publishLead, publishBatch } = require('./publish');
const { ensureAnalyzerSync, getLastSyncStats } = require('./analyzer-sync');
const { normalizeLeadRecord } = require('./schema');

const ADMIN_USERNAME = 'admin';
const MAX_EXPORT_ROWS = 500;
const MAX_EXPORTS_PER_DAY = 5;

const exportCounts = new Map();

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function isMaxAccess(req) {
  const plan = readPhugleePlan(req);
  const user = readPhugleeUser(req);
  return plan === 'max' || user === ADMIN_USERNAME;
}

function isAdmin(req) {
  return readPhugleeUser(req) === ADMIN_USERNAME;
}

function requireAuth(req, res) {
  const user = readPhugleeUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  return user;
}

function requireMax(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!isMaxAccess(req)) {
    sendJson(res, 403, { ok: false, error: 'Max plan required', code: 'PLAN_REQUIRED' });
    return null;
  }
  return user;
}

function parseListQuery(url) {
  const signals = url.searchParams.getAll('signal');
  const sincePreset = url.searchParams.get('since');
  let since = url.searchParams.get('sinceDate') || null;
  if (!since && sincePreset) {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[sincePreset];
    if (days) since = new Date(Date.now() - days * 86400000).toISOString();
  }
  return {
    leadType: url.searchParams.get('leadType') || 'all',
    state: url.searchParams.get('state') || '',
    city: url.searchParams.get('city') || '',
    minScore: url.searchParams.get('minScore'),
    maxScore: url.searchParams.get('maxScore'),
    q: url.searchParams.get('q') || '',
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
    sort: url.searchParams.get('sort') || 'priorityScore',
    sortDir: url.searchParams.get('sortDir') || 'desc',
    signals,
    since,
    favoritesOnly: url.searchParams.get('favoritesOnly') === '1',
    hasPhone: url.searchParams.get('hasPhone') === '1'
  };
}

function leadsToCsv(leads = []) {
  const headers = [
    'Address', 'City', 'State', 'Zip', 'Lead Type', 'Score', 'Top Signal',
    'Owner', 'Phone', 'ARV', 'Repairs', 'Published'
  ];
  const escape = (v) => {
    const text = String(v ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(','),
    ...leads.map((l) => [
      l.address,
      l.city,
      l.state,
      l.zip,
      l.leadType,
      l.priorityScore,
      (l.signalTags && l.signalTags[0]) || '',
      l.ownerName,
      (l.phones && l.phones[0]) || '',
      l.estARV ?? '',
      l.estRepairs ?? '',
      l.publishedAt
    ].map(escape).join(','))
  ];
  return `${lines.join('\n')}\n`;
}

function exportRateKey(user) {
  const day = new Date().toISOString().slice(0, 10);
  return `${user}:${day}`;
}

function checkExportLimit(user) {
  const key = exportRateKey(user);
  const count = exportCounts.get(key) || 0;
  if (count >= MAX_EXPORTS_PER_DAY) {
    const err = new Error('Daily export limit reached');
    err.code = 'EXPORT_LIMIT';
    throw err;
  }
  exportCounts.set(key, count + 1);
}

async function handle(req, res, pathname, url) {
  if (!pathname.startsWith('/api/leads')) return false;

  const isReadRoute = (pathname === '/api/leads' && req.method === 'GET')
    || (pathname === '/api/leads/meta' && req.method === 'GET');

  if (isReadRoute) {
    ensureAnalyzerSync().catch((err) => {
      console.warn('[Vault API] analyzer sync failed:', err.message);
    });
  }

  if (pathname === '/api/leads/sync' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const stats = await ensureAnalyzerSync({ force: true });
    sendJson(res, 200, { ok: true, sync: stats });
    return true;
  }

  if (pathname === '/api/leads/meta' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const sync = getLastSyncStats();
    sendJson(res, 200, {
      ok: true,
      meta: getMeta(),
      sync: sync ? {
        lastSyncAt: sync.lastSyncAt,
        published: sync.published,
        eligible: sync.eligible,
        scanned: sync.scanned
      } : null
    });
    return true;
  }

  if (pathname === '/api/leads' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const user = readPhugleeUser(req);
    const overlays = readOverlays(user);
    const query = parseListQuery(url);
    if (query.favoritesOnly) query.favoriteIds = new Set(overlays.favorites);
    const result = queryLeads(query);
    result.leads = result.leads.map((row) => ({
      ...row,
      favorite: overlays.favorites.includes(row.leadId)
    }));
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  const detailMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (detailMatch && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(detailMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    const user = readPhugleeUser(req);
    const overlays = readOverlays(user);
    sendJson(res, 200, {
      ok: true,
      lead,
      favorite: overlays.favorites.includes(lead.leadId),
      note: overlays.notes[lead.leadId] || ''
    });
    return true;
  }

  if (pathname === '/api/leads/export' && req.method === 'POST') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) {
      sendJson(res, 400, { ok: false, error: 'No leads selected', code: 'NO_IDS' });
      return true;
    }
    if (ids.length > MAX_EXPORT_ROWS) {
      sendJson(res, 400, { ok: false, error: `Max ${MAX_EXPORT_ROWS} rows per export`, code: 'TOO_MANY' });
      return true;
    }
    try {
      checkExportLimit(user);
    } catch (err) {
      sendJson(res, 429, { ok: false, error: err.message, code: err.code });
      return true;
    }
    const leads = getLeadsByIds(ids);
    const csv = leadsToCsv(leads);
    sendJson(res, 200, {
      ok: true,
      filename: `vault-export-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      count: leads.length
    });
    return true;
  }

  if (pathname === '/api/leads/user/overlays' && req.method === 'GET') {
    const user = requireMax(req, res);
    if (!user) return true;
    sendJson(res, 200, { ok: true, overlays: readOverlays(user) });
    return true;
  }

  if (pathname === '/api/leads/user/favorites/bulk' && req.method === 'POST') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const favorite = body.favorite !== false;
    const favorites = bulkSetFavorites(user, ids, favorite);
    sendJson(res, 200, { ok: true, favorites });
    return true;
  }

  const favMatch = /^\/api\/leads\/user\/favorites\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (favMatch && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const favorite = toggleFavorite(user, favMatch[1]);
    sendJson(res, 200, { ok: true, favorite });
    return true;
  }

  const noteMatch = /^\/api\/leads\/user\/notes\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (noteMatch && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const note = upsertNote(user, noteMatch[1], body.note);
    sendJson(res, 200, { ok: true, note });
    return true;
  }

  if (pathname === '/api/leads/user/presets' && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const presets = savePresets(user, body.presets);
    sendJson(res, 200, { ok: true, presets });
    return true;
  }

  if (pathname === '/api/leads/publish' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    if (Array.isArray(body.leads)) {
      const result = publishBatch(body.leads, body.meta || {});
      sendJson(res, 200, { ok: true, ...result });
      return true;
    }
    const lead = publishLead(body.lead ? body.lead : body, {
      ...(body.meta || {}),
      forceApprove: !!body.forceApprove
    });
    sendJson(res, 200, { ok: true, lead });
    return true;
  }

  sendJson(res, 404, { ok: false, error: 'Not found', code: 'NOT_FOUND' });
  return true;
}

module.exports = {
  handle,
  isMaxAccess,
  leadsToCsv
};

// One-time backfill when index predates address/thumb fields (large catalogs).
setImmediate(() => {
  try {
    const { readIndex, rebuildIndexFromLeads } = require('./store');
    const index = readIndex();
    if (!index.length || index[0].address) return;
    console.log('[Vault] Rebuilding leads index for fast list queries…');
    const result = rebuildIndexFromLeads();
    console.log('[Vault] Index rebuilt:', result.rebuilt, 'leads');
  } catch (err) {
    console.warn('[Vault] Index rebuild skipped:', err.message);
  }
});
