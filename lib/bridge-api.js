const config = require('./config');
const runtime = require('./runtime');
const { fetchForgeJson, postForgeJson } = require('./forge-client');
const { parseMultipart } = require('./multipart');
const {
  validateUploadType,
  isAcceptedFile,
  buildNormalizedRow,
  emptyProcessingStats,
  incrementTag,
  incrementConfidence
} = require('./bridge-intake-schema');
const { tagRow } = require('./bridge-distress-tagger');
const { processUpload } = require('./bridge-engine');
const { parseResponseReceivedAt } = require('./bridge-export');
const {
  listSummaries,
  getList,
  saveList,
  renameList,
  markDownloaded,
  deleteList,
  buildDownload
} = require('./bridge-list-store');
const { readPhugleeUser, readPhugleePlan } = require('./phuglee-user');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function ensureForgeReady() {
  if (runtime.remoteForgeUrl() || runtime.skipChildProcesses()) return;
  const { checkForgeHealth } = require('./forge-proxy');
  const health = await checkForgeHealth();
  if (health.ok) return;
  if (process.env.NODE_ENV !== 'production') return;
  const { ensureForgeRunning } = require('./forge-process');
  // Do not block bridge reads — bundled registry fallback returns city data immediately.
  ensureForgeRunning({ spawnIfMissing: true }).catch(() => {});
}

async function loadCitySummaries() {
  await ensureForgeReady();
  const data = await fetchForgeJson('/api/portal/cities/summary');
  return data.items || data.cities || [];
}

function forgeDownloadUrl(path) {
  const cleaned = String(path || '').replace(/^\//, '');
  if (!cleaned) return '';
  return `${config.FORGE_PREFIX}/api/file/${cleaned}`;
}

function groupStates(cities) {
  const map = new Map();
  for (const city of cities) {
    const state = String(city.state || '').trim();
    if (!state) continue;
    if (!map.has(state)) map.set(state, []);
    map.get(state).push(city);
  }
  return [...map.entries()]
    .map(([state, rows]) => ({
      code: state,
      label: state,
      cityCount: rows.length
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function citiesForState(cities, state) {
  const needle = String(state || '').trim();
  return cities
    .filter((city) => String(city.state || '').trim() === needle)
    .map((city) => ({
      id: city.id,
      city: city.city,
      state: city.state
    }))
    .sort((a, b) => a.city.localeCompare(b.city));
}

function buildStubRows(city, uploadType, sourceFile, processedAt) {
  const samples = uploadType === 'water_shut_off'
    ? [
        {
          streetAddress: '410 Cedar Ln',
          violationIssueType: 'Water shut off — delinquency',
          descriptionNotes: 'Utility disconnected for non-payment',
          zip: '85704',
          violationDate: '2026-05-12'
        },
        {
          streetAddress: '88 W River Rd',
          violationIssueType: 'Water service terminated',
          descriptionNotes: 'Outstanding utility balance',
          zip: '85705',
          violationDate: '2026-05-18'
        }
      ]
    : [
        {
          streetAddress: '123 Main St',
          violationIssueType: 'Overgrown weeds',
          descriptionNotes: 'Vegetation exceeding 12 inches in front yard',
          zip: '85704',
          violationDate: '2026-04-02'
        },
        {
          streetAddress: '456 Oak Ave',
          violationIssueType: 'Accumulation of trash',
          descriptionNotes: 'Junk and debris visible from street',
          zip: '85705',
          violationDate: '2026-04-15'
        },
        {
          streetAddress: '901 Pine Dr',
          violationIssueType: 'Fence permit',
          descriptionNotes: 'Expired fence permit — administrative',
          zip: '85710',
          violationDate: '2026-03-28'
        }
      ];

  return samples.map((sample) => {
    const tags = tagRow(sample, uploadType);
    return buildNormalizedRow(sample, {
      city: city.city,
      state: city.state,
      uploadType,
      sourceFile,
      processedAt,
      distressedSignalTag: tags.distressedSignalTag,
      matchedIndicators: tags.matchedIndicators,
      confidenceLevel: 'high'
    });
  });
}

function buildStubProcessResponse({ city, uploadType, sourceFile }) {
  const processedAt = new Date().toISOString();
  const rows = buildStubRows(city, uploadType, sourceFile, processedAt);
  const stats = emptyProcessingStats();
  stats.totalParsed = rows.length + 2;
  stats.kept = rows.length;
  stats.discarded = 2;
  stats.deduplicated = 0;
  stats.alreadyImported = 0;
  stats.lowConfidence = 0;
  stats.discardReasons = {
    'No usable street address': 1,
    'Blank or empty row': 1
  };

  for (const row of rows) {
    incrementTag(stats, row.distressedSignalTag);
    incrementConfidence(stats, row.confidenceLevel);
  }

  return {
    ok: true,
    stub: true,
    city,
    uploadType,
    sourceFile,
    processedAt,
    stats,
    rows,
    discarded: [
      { reason: 'No usable street address', rawPreview: '(empty address field)' },
      { reason: 'Blank or empty row', rawPreview: '(blank line)' }
    ],
    processingMeta: {
      parser: 'stub',
      message: 'Phase 2 preview — full parsing ships in Phase 3–5',
      durationMs: 480
    }
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function handleStates(res) {
  const cities = await loadCitySummaries();
  sendJson(res, 200, { states: groupStates(cities) });
}

async function handleCities(res, state) {
  if (!state) {
    sendJson(res, 400, { error: 'state query parameter is required', code: 'MISSING_STATE' });
    return;
  }
  const cities = await loadCitySummaries();
  const rows = citiesForState(cities, state);
  if (!rows.length) {
    sendJson(res, 400, { error: 'No city profiles found for that state', code: 'UNKNOWN_STATE' });
    return;
  }
  sendJson(res, 200, { state, cities: rows });
}

async function handleProcess(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    sendJson(res, 400, { error: 'Expected multipart/form-data upload', code: 'INVALID_CONTENT_TYPE' });
    return;
  }

  const buffer = await readBody(req);
  const { fields, files } = parseMultipart(buffer, contentType);
  const cityId = String(fields.cityId || '').trim();
  const uploadTypeRaw = String(fields.uploadType || '').trim();
  const file = files.file;

  if (!cityId) {
    sendJson(res, 400, { error: 'cityId is required', code: 'MISSING_CITY' });
    return;
  }

  let uploadType;
  try {
    uploadType = validateUploadType(uploadTypeRaw);
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'INVALID_UPLOAD_TYPE' });
    return;
  }

  if (!file || !file.filename) {
    sendJson(res, 400, { error: 'file is required', code: 'MISSING_FILE' });
    return;
  }

  if (!isAcceptedFile(file.filename)) {
    sendJson(res, 400, {
      error: 'Unsupported file type. Upload Excel, CSV, PDF, Word, TXT, or JPG/PNG list images.',
      code: 'UNSUPPORTED_FILE'
    });
    return;
  }

  if (!file.data || !file.data.length) {
    sendJson(res, 400, { error: 'Uploaded file is empty', code: 'EMPTY_FILE' });
    return;
  }

  const summaries = await loadCitySummaries();
  const city = summaries.find((row) => row.id === cityId);
  if (!city) {
    sendJson(res, 404, { error: 'City profile not found', code: 'CITY_NOT_FOUND' });
    return;
  }

  const cityPayload = { id: city.id, city: city.city, state: city.state };
  const username = readPhugleeUser(req);
  const plan = readPhugleePlan(req);

  try {
    const payload = await processUpload({
      buffer: file.data,
      filename: file.filename,
      city: cityPayload,
      uploadType,
      username,
      plan
    });

    // Filter only — do not auto-push to Analyze. Lists are saved explicitly via /api/bridge/lists.
    sendJson(res, 200, payload);
  } catch (err) {
    if (err.code === 'OCR_UNAVAILABLE') {
      sendJson(res, 503, { error: err.message, code: err.code });
      return;
    }
    if (err.code === 'NO_USABLE_ROWS') {
      sendJson(res, 422, {
        error: err.message,
        code: err.code,
        discarded: err.details?.discarded || [],
        stats: err.details?.stats || {}
      });
      return;
    }
    if (err.code === 'PARSER_NOT_READY') {
      sendJson(res, 501, { error: err.message, code: err.code });
      return;
    }
    if (err.code === 'UNSUPPORTED_FILE') {
      sendJson(res, 400, { error: err.message, code: err.code });
      return;
    }
    if (err.message?.includes('empty') || err.message?.includes('no usable headers')) {
      sendJson(res, 400, { error: err.message, code: 'PARSE_FAILED' });
      return;
    }
    throw err;
  }
}

async function handleAttach(req, res) {
  const buffer = await readBody(req);
  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  const cityId = String(body.cityId || '').trim();
  const uploadTypeRaw = String(body.uploadType || '').trim();
  const originalFilename = String(body.originalFilename || body.sourceFile || '').trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const stats = body.stats || {};
  const metadata = body.metadata || {};

  if (!cityId) {
    sendJson(res, 400, { error: 'cityId is required', code: 'MISSING_CITY' });
    return;
  }

  let uploadType;
  try {
    uploadType = validateUploadType(uploadTypeRaw);
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'INVALID_UPLOAD_TYPE' });
    return;
  }

  if (!originalFilename) {
    sendJson(res, 400, { error: 'originalFilename is required', code: 'MISSING_FILENAME' });
    return;
  }

  if (!rows.length) {
    sendJson(res, 400, { error: 'rows must be a non-empty array', code: 'MISSING_ROWS' });
    return;
  }

  let responseReceivedAt;
  try {
    responseReceivedAt = parseResponseReceivedAt(body.responseReceivedAt);
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'INVALID_RESPONSE_AT' });
    return;
  }

  try {
    const forgePayload = await postForgeJson(
      `/api/portal/city/${encodeURIComponent(cityId)}/bridge/attach`,
      {
        uploadType,
        responseReceivedAt,
        originalFilename,
        rows,
        stats,
        metadata
      }
    );
    const version = forgePayload.version || {};
    sendJson(res, 200, {
      ok: true,
      version: {
        ...version,
        csv_download_url: forgeDownloadUrl(version.csv_path) || version.csv_download_url || '',
        xlsx_download_url: forgeDownloadUrl(version.xlsx_path) || version.xlsx_download_url || ''
      },
      turnaroundDays: forgePayload.version?.turnaround_days ?? forgePayload.event?.turnaround_days ?? null
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Attach failed', code: 'ATTACH_FAILED' });
  }
}

async function handleHistory(res, cityId) {
  if (!cityId) {
    sendJson(res, 400, { error: 'cityId is required', code: 'MISSING_CITY' });
    return;
  }

  try {
    const data = await fetchForgeJson(`/api/portal/city/${encodeURIComponent(cityId)}`);
    const history = (data.bridge_datasets || []).map((entry) => ({
      ...entry,
      csv_download_url: entry.csv_download_url || forgeDownloadUrl(entry.csv_path),
      xlsx_download_url: entry.xlsx_download_url || forgeDownloadUrl(entry.xlsx_path)
    }));
    sendJson(res, 200, {
      cityId,
      city: data.city,
      state: data.state,
      history
    });
  } catch (err) {
    if (err.statusCode === 404 || String(err.message).includes('404') || /not found/i.test(String(err.message))) {
      sendJson(res, 404, { error: 'City profile not found', code: 'CITY_NOT_FOUND' });
      return;
    }
    throw err;
  }
}

function scopeFromReq(req) {
  return {
    username: readPhugleeUser(req),
    plan: readPhugleePlan(req)
  };
}

function handleListError(res, err) {
  const code = err.code || 'SERVER_ERROR';
  const status =
    code === 'LIST_NOT_FOUND' ? 404
      : code === 'MISSING_ROWS' || code === 'MISSING_LIST_ID' || code === 'TOO_MANY_ROWS' || code === 'INVALID_NAME'
        ? 400
        : 500;
  sendJson(res, status, { error: err.message || 'List error', code });
}

async function handleListIndex(req, res) {
  const { lists } = listSummaries(scopeFromReq(req));
  sendJson(res, 200, { ok: true, lists });
}

async function handleListCreate(req, res) {
  const buffer = await readBody(req);
  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  try {
    const scope = scopeFromReq(req);
    const city = body.city && typeof body.city === 'object' ? body.city : {};
    const result = saveList({
      name: body.name,
      rows: body.rows,
      stats: body.stats || {},
      cityId: body.cityId || city.id || '',
      city: body.cityName || city.city || '',
      state: body.state || city.state || '',
      uploadType: body.uploadType || '',
      sourceFile: body.sourceFile || body.originalFilename || '',
      processingMeta: body.processingMeta || body.metadata?.processingMeta || {},
      username: scope.username,
      plan: scope.plan
    });
    sendJson(res, 200, { ok: true, list: result.meta });
  } catch (err) {
    handleListError(res, err);
  }
}

async function handleListPatch(req, res, listId) {
  const buffer = await readBody(req);
  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  try {
    if (body.name === undefined || body.name === null || !String(body.name).trim()) {
      sendJson(res, 400, { error: 'name is required', code: 'INVALID_NAME' });
      return;
    }
    const result = renameList(listId, body.name, scopeFromReq(req));
    sendJson(res, 200, { ok: true, list: result.meta });
  } catch (err) {
    handleListError(res, err);
  }
}

async function handleListDelete(req, res, listId) {
  try {
    deleteList(listId, scopeFromReq(req));
    sendJson(res, 200, { ok: true, id: listId });
  } catch (err) {
    handleListError(res, err);
  }
}

async function handleListDownload(req, res, listId, format) {
  try {
    const scope = scopeFromReq(req);
    const download = buildDownload(listId, format, scope);
    markDownloaded(listId, scope);
    const disposition = `attachment; filename="${download.filename.replace(/"/g, '')}"`;
    res.writeHead(200, {
      'Content-Type': download.contentType,
      'Content-Disposition': disposition,
      'Content-Length': download.buffer.length,
      'Cache-Control': 'no-store'
    });
    res.end(download.buffer);
  } catch (err) {
    if (!res.headersSent) handleListError(res, err);
  }
}

async function handle(req, res, pathname, url) {
  try {
    if (pathname === '/api/bridge/states' && req.method === 'GET') {
      await handleStates(res);
      return true;
    }

    if (pathname === '/api/bridge/cities' && req.method === 'GET') {
      await handleCities(res, url.searchParams.get('state'));
      return true;
    }

    if (pathname === '/api/bridge/process' && req.method === 'POST') {
      await handleProcess(req, res);
      return true;
    }

    if (pathname === '/api/bridge/attach' && req.method === 'POST') {
      await handleAttach(req, res);
      return true;
    }

    if (pathname === '/api/bridge/lists' && req.method === 'GET') {
      await handleListIndex(req, res);
      return true;
    }

    if (pathname === '/api/bridge/lists' && req.method === 'POST') {
      await handleListCreate(req, res);
      return true;
    }

    const listDownloadMatch = pathname.match(/^\/api\/bridge\/lists\/([^/]+)\/download$/);
    if (listDownloadMatch && req.method === 'GET') {
      await handleListDownload(req, res, decodeURIComponent(listDownloadMatch[1]), url.searchParams.get('format'));
      return true;
    }

    const listItemMatch = pathname.match(/^\/api\/bridge\/lists\/([^/]+)$/);
    if (listItemMatch) {
      const listId = decodeURIComponent(listItemMatch[1]);
      if (req.method === 'GET') {
        const includeRows = url.searchParams.get('includeRows') === '1'
          || url.searchParams.get('includeRows') === 'true';
        try {
          const result = getList(listId, scopeFromReq(req), { includeRows });
          sendJson(res, 200, {
            ok: true,
            list: result.meta,
            stats: result.stats,
            rows: includeRows ? result.rows : undefined
          });
        } catch (err) {
          handleListError(res, err);
        }
        return true;
      }
      if (req.method === 'PATCH') {
        await handleListPatch(req, res, listId);
        return true;
      }
      if (req.method === 'DELETE') {
        await handleListDelete(req, res, listId);
        return true;
      }
    }

    const historyMatch = pathname.match(/^\/api\/bridge\/history\/([^/]+)$/);
    if (historyMatch && req.method === 'GET') {
      await handleHistory(res, decodeURIComponent(historyMatch[1]));
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    console.error('[Bridge API]', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Bridge API error', code: 'SERVER_ERROR' });
    }
    return true;
  }
}

module.exports = {
  handle,
  groupStates,
  citiesForState,
  buildStubProcessResponse,
  parseResponseReceivedAt,
  forgeDownloadUrl
};