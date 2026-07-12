const config = require('./config');
const runtime = require('./runtime');
const { fetchForgeJson, postForgeJson } = require('./forge-client');
const { parseMultipart, collectUploadFiles } = require('./multipart');
const {
  validateUploadType,
  isAcceptedFile,
  buildNormalizedRow,
  emptyProcessingStats,
  incrementTag,
  incrementConfidence
} = require('./bridge-intake-schema');
const { tagRow } = require('./bridge-distress-tagger');
const { processUpload, processUploadBatch, MAX_BATCH_FILES } = require('./bridge-engine');
const { parseResponseReceivedAt } = require('./bridge-export');
const {
  listSummaries,
  getList,
  saveList,
  renameList,
  markDownloaded,
  setListStatus,
  deleteList,
  deleteLists,
  clearAllLists,
  buildDownload,
  buildDownloadAll,
  buildDownloadAllBatched
} = require('./bridge-list-store');
const { readPhugleeUser, readPhugleePlan } = require('./phuglee-user');
const { loadBrain, saveBrain, recomputeMetrics } = require('./bridge-brain-store');
const { applyDecision, undoLastDecision } = require('./bridge-brain-decisions');
const {
  scoreApplyCoverage,
  buildLearningHealth,
  scoreGoldFixtures
} = require('./bridge-learning-metrics');
const {
  loadCityFormat,
  deleteCityFormat
} = require('./bridge-city-format-store');
const { pasteTextToExcel } = require('./paste-to-excel');
const {
  createJob: createGeocodioJob,
  listJobs: listGeocodioJobs,
  getJob: getGeocodioJob,
  getJobDownload: getGeocodioJobDownload,
  deleteJob: deleteGeocodioJob,
  hasGeocodioKeys
} = require('./geocodio-jobs');
const { getUsageForModal } = require('./geocodio-usage');
const { loadGeocodioKeys } = require('./geocodio-keys');

const ADMIN_USERNAME = 'admin';
const MAX_BRAIN_DECISION_BYTES = 15_000_000;
const MAX_PASTE_BODY_BYTES = 6_000_000;
const MAX_GEOCODIO_UPLOAD_BYTES = 40_000_000;

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
      category: tags.category || '',
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

/**
 * List cities for a state, or the full city index for typeahead.
 * - state=Arizona → cities in that state
 * - all=1 → every profile as { id, city, state } (for Filter quick search)
 */
async function handleCities(res, state, { all = false } = {}) {
  const cities = await loadCitySummaries();

  if (all) {
    const rows = cities
      .map((city) => ({
        id: city.id,
        city: city.city,
        state: city.state
      }))
      .filter((row) => row.city && row.state)
      .sort((a, b) => {
        const byCity = String(a.city).localeCompare(String(b.city));
        return byCity !== 0 ? byCity : String(a.state).localeCompare(String(b.state));
      });
    sendJson(res, 200, { cities: rows, total: rows.length });
    return;
  }

  if (!state) {
    sendJson(res, 400, { error: 'state query parameter is required', code: 'MISSING_STATE' });
    return;
  }
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
  const fileList = collectUploadFiles(files);

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

  if (!fileList.length) {
    sendJson(res, 400, { error: 'file is required', code: 'MISSING_FILE' });
    return;
  }

  if (fileList.length > MAX_BATCH_FILES) {
    sendJson(res, 400, {
      error: `Up to ${MAX_BATCH_FILES} files per upload`,
      code: 'TOO_MANY_FILES',
      maxFiles: MAX_BATCH_FILES
    });
    return;
  }

  for (const file of fileList) {
    if (!file || !file.filename) {
      sendJson(res, 400, { error: 'file is required', code: 'MISSING_FILE' });
      return;
    }
    if (!isAcceptedFile(file.filename)) {
      sendJson(res, 400, {
        error: `Unsupported file type: ${file.filename}. Upload Excel, CSV, PDF, Word, TXT, or JPG/PNG list images.`,
        code: 'UNSUPPORTED_FILE'
      });
      return;
    }
    if (!file.data || !file.data.length) {
      sendJson(res, 400, {
        error: `Uploaded file is empty: ${file.filename}`,
        code: 'EMPTY_FILE'
      });
      return;
    }
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

  // Type-column confirm resume fields (Plan 52-04) — only pass key when present
  // so absence means "need confirm" for the engine gate.
  // Multi-format batches: confirmedFormats JSON [{ formatFingerprint, confirmedTypeHeader }, ...]
  const hasConfirmed = Object.prototype.hasOwnProperty.call(fields, 'confirmedTypeHeader');
  const confirmedTypeHeader = hasConfirmed ? fields.confirmedTypeHeader : undefined;
  const formatFingerprint = fields.formatFingerprint != null && fields.formatFingerprint !== ''
    ? String(fields.formatFingerprint)
    : undefined;

  let confirmedFormats;
  if (fields.confirmedFormats != null && fields.confirmedFormats !== '') {
    try {
      const parsed =
        typeof fields.confirmedFormats === 'string'
          ? JSON.parse(fields.confirmedFormats)
          : fields.confirmedFormats;
      if (Array.isArray(parsed)) confirmedFormats = parsed;
    } catch {
      sendJson(res, 400, {
        error: 'confirmedFormats must be a JSON array',
        code: 'INVALID_CONFIRMED_FORMATS'
      });
      return;
    }
  }

  try {
    // 1–5 files: process each and merge kept rows (same city / type).
    // Mixed header formats OK — each fingerprint gets its own Type confirm.
    const batchArgs = {
      city: cityPayload,
      uploadType,
      username,
      plan
    };
    if (hasConfirmed) {
      batchArgs.confirmedTypeHeader = confirmedTypeHeader;
    }
    if (formatFingerprint !== undefined) {
      batchArgs.formatFingerprint = formatFingerprint;
    }
    if (confirmedFormats) {
      batchArgs.confirmedFormats = confirmedFormats;
    }
    const payload = await processUploadBatch(fileList, batchArgs);

    // Filter only — do not auto-push to Analyze. Lists are saved explicitly via /api/bridge/lists.
    sendJson(res, 200, payload);
  } catch (err) {
    if (err.code === 'TYPE_COLUMN_CONFIRM_REQUIRED') {
      sendJson(res, 409, {
        error: err.message || 'Confirm Violation Type column for this city format',
        code: 'TYPE_COLUMN_CONFIRM_REQUIRED',
        ...(err.details || {})
      });
      return;
    }
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    if (err.code === 'INVALID_TYPE_COLUMN' || err.code === 'FORMAT_MISMATCH') {
      sendJson(res, 400, { error: err.message, code: err.code, ...(err.details || {}) });
      return;
    }
    if (err.code === 'OCR_UNAVAILABLE') {
      sendJson(res, 503, { error: err.message, code: err.code });
      return;
    }
    if (err.code === 'NO_USABLE_ROWS') {
      sendJson(res, 422, {
        error: err.message,
        code: err.code,
        discarded: err.details?.discarded || [],
        stats: err.details?.stats || {},
        fileFailures: err.details?.fileFailures || null
      });
      return;
    }
    if (err.code === 'TOO_MANY_FILES' || err.code === 'MISSING_FILE') {
      sendJson(res, 400, { error: err.message, code: err.code });
      return;
    }
    if (err.code === 'PARSER_NOT_READY') {
      sendJson(res, 501, { error: err.message, code: err.code });
      return;
    }
    if (err.code === 'UNSUPPORTED_FILE') {
      sendJson(res, 400, {
        error: err.failedFile ? `${err.message} (${err.failedFile})` : err.message,
        code: err.code
      });
      return;
    }
    if (err.message?.includes('empty') || err.message?.includes('no usable headers')) {
      sendJson(res, 400, {
        error: err.failedFile ? `${err.message} (${err.failedFile})` : err.message,
        code: 'PARSE_FAILED'
      });
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

/**
 * City Tracker response_status values that mean “no usable list / did not scan”.
 * Includes Filter outcome tags plus common City Tracker no-list replies.
 */
const NO_USABLE_LIST_STATUSES = new Set([
  'needs_clarification',
  'no',
  'other_source',
  'they_charge',
  'approved_bad_data',
  'wont_give',
  'not_available',
  'denied',
  'gave_other_info',
  'specific_address_only',
  'approved_parcels',
  'request_from_pd'
]);

/**
 * Pull no-usable-list outcomes from city.requests for Filter dossier display.
 * @param {object} requests
 * @returns {Array<object>}
 */
function extractNoUsableListOutcomes(requests) {
  const reqs = requests && typeof requests === 'object' ? requests : {};
  const out = [];
  for (const requestType of ['code_violation', 'water_shutoff']) {
    const req = reqs[requestType];
    if (!req || typeof req !== 'object') continue;
    const status = String(req.response_status || '').trim();
    if (!status || status === 'pending' || status === 'yes') continue;
    if (!NO_USABLE_LIST_STATUSES.has(status)) continue;
    out.push({
      request_type: requestType,
      response_status: status,
      response_at: req.response_at || req.responseAt || '',
      response_raw: req.response_raw || req.responseRaw || '',
      notes: req.notes || ''
    });
  }
  return out;
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
    const outcomes = extractNoUsableListOutcomes(data.requests);
    sendJson(res, 200, {
      cityId,
      city: data.city,
      state: data.state,
      history,
      outcomes
    });
  } catch (err) {
    if (err.statusCode === 404 || String(err.message).includes('404') || /not found/i.test(String(err.message))) {
      sendJson(res, 404, { error: 'City profile not found', code: 'CITY_NOT_FOUND' });
      return;
    }
    throw err;
  }
}

/** Allowed Filter city-outcome tags (no-list replies). Does not wipe lists. */
const CITY_OUTCOME_STATUSES = new Set([
  'needs_clarification',
  'no',
  'other_source',
  'they_charge',
  // City replied with a file/notes that cannot be used as a Filter list
  'approved_bad_data'
]);
const CITY_OUTCOME_REQUEST_TYPES = new Set(['code_violation', 'water_shutoff']);

/**
 * POST body: { cityId, response_status, request_type?, notes?, response_raw? }
 * Proxies to Form Forge City Tracker response log.
 */
async function handleCityOutcome(req, res) {
  let body;
  try {
    const raw = await readBody(req);
    body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch (_) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  const cityId = String(body.cityId || body.city_id || '').trim();
  const responseStatus = String(body.response_status || body.responseStatus || '').trim();
  const requestType = String(body.request_type || body.requestType || 'code_violation').trim();
  const notes = String(body.notes || '').trim();
  const responseRaw = String(body.response_raw || body.responseRaw || notes || '').trim();

  if (!cityId) {
    sendJson(res, 400, { error: 'cityId is required', code: 'MISSING_CITY' });
    return;
  }
  if (!CITY_OUTCOME_STATUSES.has(responseStatus)) {
    sendJson(res, 400, {
      error:
        'response_status must be needs_clarification, no, other_source, they_charge, or approved_bad_data',
      code: 'INVALID_STATUS'
    });
    return;
  }
  if (!CITY_OUTCOME_REQUEST_TYPES.has(requestType)) {
    sendJson(res, 400, { error: 'Invalid request_type', code: 'INVALID_REQUEST_TYPE' });
    return;
  }
  if (responseStatus === 'other_source' && !notes && !responseRaw) {
    sendJson(res, 400, {
      error: 'Notes required for other_source (who/where to contact)',
      code: 'MISSING_NOTES'
    });
    return;
  }

  try {
    await ensureForgeReady();
    const forgePayload = await postForgeJson(
      `/api/portal/city/${encodeURIComponent(cityId)}/response`,
      {
        request_type: requestType,
        response_status: responseStatus,
        response_raw: responseRaw,
        response_at: body.response_at || body.responseAt || new Date().toISOString().slice(0, 10),
        notes
      }
    );
    sendJson(res, 200, {
      ok: true,
      event: forgePayload.event || null,
      city: forgePayload.city || null,
      response_status: responseStatus,
      request_type: requestType
    });
  } catch (err) {
    const msg = err.message || 'Could not save city outcome';
    const status = err.statusCode === 404 ? 404 : 400;
    sendJson(res, status, { error: msg, code: 'OUTCOME_FAILED' });
  }
}

function scopeFromReq(req) {
  return {
    username: readPhugleeUser(req),
    plan: readPhugleePlan(req)
  };
}

/**
 * Strict admin gate for brain write routes.
 * Always enforced — AUTH_DISABLED must not open training writes.
 */
function requireAdmin(req) {
  const username = readPhugleeUser(req);
  if (username !== ADMIN_USERNAME) {
    const err = new Error('Admin required');
    err.code = 'ADMIN_REQUIRED';
    err.statusCode = 403;
    throw err;
  }
  return username;
}

function rowIdsPresentInList(rows, rowIds) {
  if (!Array.isArray(rowIds) || rowIds.length === 0) return false;
  const set = new Set(
    (rows || [])
      .map((r) => (r && r.rowId != null && r.rowId !== '' ? String(r.rowId) : ''))
      .filter(Boolean)
  );
  return rowIds.some((id) => id != null && id !== '' && set.has(String(id)));
}

async function handleBrainDecision(req, res) {
  let username;
  try {
    username = requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const buffer = await readBody(req);
  if (buffer.length > MAX_BRAIN_DECISION_BYTES) {
    sendJson(res, 413, {
      error: 'Decision payload too large',
      code: 'PAYLOAD_TOO_LARGE'
    });
    return;
  }

  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  const action = body && body.action;
  const section = body && body.section;
  const rowIds = body && body.rowIds;
  const validAction = action === 'approve' || action === 'deny';
  const validSection = section === 'distressed' || section === 'not_distressed';

  if (!validAction || !validSection || !Array.isArray(rowIds)) {
    sendJson(res, 400, {
      error: 'Missing or invalid action, section, or rowIds',
      code: !validAction || !validSection ? 'INVALID_DECISION' : 'MISSING_FIELDS'
    });
    return;
  }

  if (body.uploadType === 'water_shut_off') {
    sendJson(res, 400, {
      error: 'Water shut-off training is not supported',
      code: 'WATER_TRAINING_UNSUPPORTED'
    });
    return;
  }

  const clientApplied = Boolean(body && body.clientApplied);
  const currentRows = Array.isArray(body.rows) ? body.rows : [];
  const notDistressedRows = Array.isArray(body.notDistressedRows)
    ? body.notDistressedRows
    : [];

  // Mutating / affirmation paths that need rows present in a target list.
  // clientApplied: browser already moved rows for snappy Train UX — skip bulk
  // row payload validation (and avoid requiring multi‑MB decision bodies).
  if (!clientApplied) {
    if (section === 'distressed' && action === 'deny') {
      if (!rowIdsPresentInList(currentRows, rowIds)) {
        sendJson(res, 400, {
          error: 'None of the provided rowIds were found in kept rows',
          code: 'ROW_IDS_NOT_FOUND'
        });
        return;
      }
    } else if (section === 'not_distressed' && (action === 'approve' || action === 'deny')) {
      // Deny (promote) must see the rows in the FN list — stale snapshots used to
      // "succeed" with 0 moves and overwrite a previous promote's kept count.
      if (!rowIdsPresentInList(notDistressedRows, rowIds)) {
        sendJson(res, 400, {
          error: 'None of the provided rowIds were found in not-distressed rows',
          code: 'ROW_IDS_NOT_FOUND'
        });
        return;
      }
    }
  } else if (!Array.isArray(rowIds) || rowIds.length === 0) {
    sendJson(res, 400, {
      error: 'clientApplied decisions require non-empty rowIds',
      code: 'MISSING_FIELDS'
    });
    return;
  }

  const expectedVersion =
    body.brainVersion != null ? Number(body.brainVersion) : undefined;

  let result;
  let saved;
  try {
    const brain = loadBrain();
    result = applyDecision(body, {
      brain,
      currentRows,
      notDistressedRows,
      by: username
    });
    saved = saveBrain(result.brain, {
      expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : undefined
    });
  } catch (err) {
    if (err.code === 'INVALID_DECISION' || err.code === 'ROW_IDS_NOT_FOUND') {
      sendJson(res, 400, {
        error: err.message || 'Invalid decision',
        code: err.code || 'INVALID_DECISION'
      });
      return;
    }
    if (err.code === 'VERSION_CONFLICT') {
      sendJson(res, 409, {
        error: err.message || 'Brain version conflict',
        code: 'VERSION_CONFLICT',
        currentVersion: err.currentVersion
      });
      return;
    }
    throw err;
  }

  const brainSummary = {
    version: saved.version,
    typeRulesActive: saved.metrics?.typeRulesActive,
    totalDecisions: saved.metrics?.totalDecisions,
    metrics: saved.metrics
  };

  const payload = {
    ok: true,
    event: result.event,
    brainSummary,
    movedCount: Number(result.movedCount) || 0,
    clientApplied: Boolean(result.clientApplied)
  };
  if (result.clientApplied) {
    // Client already owns working lists — do not echo multi‑MB row arrays.
    payload.statsPatch = null;
  } else {
    payload.rows = result.rows;
    payload.notDistressedRows = result.notDistressedRows;
    payload.reviewGroups = result.reviewGroups;
    payload.statsPatch = {
      kept: Array.isArray(result.rows) ? result.rows.length : 0,
      notDistressed: Array.isArray(result.notDistressedRows)
        ? result.notDistressedRows.length
        : 0
    };
  }
  sendJson(res, 200, payload);
}

const ALLOWED_RULE_STATUSES = new Set(['active', 'rejected', 'disabled']);

/**
 * Status transition table (v1):
 * proposed → active | rejected
 * active   → disabled
 * disabled → active
 * rejected → (no re-open)
 */
function isAllowedRuleStatusTransition(from, to) {
  if (from === to) return true;
  if (from === 'proposed') return to === 'active' || to === 'rejected';
  if (from === 'active') return to === 'disabled';
  if (from === 'disabled') return to === 'active';
  return false;
}

function findBrainRule(brain, ruleId) {
  const id = String(ruleId || '');
  if (!id) return null;
  const typeRules = Array.isArray(brain.typeRules) ? brain.typeRules : [];
  const phraseRules = Array.isArray(brain.phraseRules) ? brain.phraseRules : [];
  for (const rule of typeRules) {
    if (rule && rule.id === id) return { rule, collection: 'typeRules' };
  }
  for (const rule of phraseRules) {
    if (rule && rule.id === id) return { rule, collection: 'phraseRules' };
  }
  return null;
}

function recountBrainMetrics(brain) {
  const metrics = recomputeMetrics(brain);
  brain.metrics = metrics;
  return metrics;
}

function shortAuditId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function auditActionForStatus(nextStatus, collection) {
  if (nextStatus === 'active') {
    return collection === 'phraseRules' ? 'approve_phrase_rule' : 'enable_rule';
  }
  if (nextStatus === 'rejected') return 'reject_phrase_rule';
  if (nextStatus === 'disabled') return 'disable_rule';
  return 'update_rule_status';
}

async function buildLearningPayload(brain, req) {
  const events = Array.isArray(brain.events) ? brain.events : [];
  let includeGold = true;
  try {
    const host = req.headers && (req.headers.host || 'localhost');
    const url = new URL(req.url || '/', `http://${host}`);
    if (url.searchParams.get('includeGold') === '0') includeGold = false;
  } catch (_) {
    /* default include gold */
  }

  let goldScore = null;
  if (includeGold) {
    try {
      goldScore = await scoreGoldFixtures(processUpload, {
        brainVersion: brain.version
      });
    } catch (_) {
      goldScore = {
        precision: null,
        recall: null,
        baselinePrecision: 1,
        baselineRecall: 1,
        degraded: false,
        source: 'unavailable'
      };
    }
  }

  const coverage = scoreApplyCoverage({ appliedRuleIds: [], source: 'unknown' });
  coverage.note = 'apply coverage from last process brainAppliedRuleIds (client) or unknown on server';

  return buildLearningHealth({
    events,
    goldScore: includeGold ? goldScore : null,
    applyCoverage: coverage,
    discardBlob: ''
  });
}

async function handleBrainGet(req, res) {
  try {
    requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const brain = loadBrain();
  const events = Array.isArray(brain.events) ? brain.events : [];
  const eventsTail = events.length > 20 ? events.slice(-20) : events;

  const flat = recomputeMetrics(brain);
  const learning = await buildLearningPayload(brain, req);
  const metrics = { ...flat, learning };

  sendJson(res, 200, {
    version: brain.version,
    updatedAt: brain.updatedAt,
    typeRules: Array.isArray(brain.typeRules) ? brain.typeRules : [],
    phraseRules: Array.isArray(brain.phraseRules) ? brain.phraseRules : [],
    metrics,
    events: eventsTail
  });
}

async function handleBrainMetrics(req, res) {
  try {
    requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const brain = loadBrain();
  const flat = recomputeMetrics(brain);
  const learning = await buildLearningPayload(brain, req);
  sendJson(res, 200, { ...flat, learning });
}

async function handleBrainUndo(req, res) {
  let username;
  try {
    username = requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const buffer = await readBody(req);
  let body = {};
  if (buffer.length) {
    try {
      body = JSON.parse(buffer.toString('utf8') || '{}');
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
      return;
    }
  }

  const expectedVersion =
    body && body.brainVersion != null ? Number(body.brainVersion) : undefined;

  let saved;
  try {
    const brain = loadBrain();
    undoLastDecision(brain, { by: username });
    saved = saveBrain(brain, {
      expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : undefined
    });
  } catch (err) {
    if (err.code === 'NOTHING_TO_UNDO') {
      sendJson(res, 400, {
        error: err.message || 'Nothing to undo',
        code: 'NOTHING_TO_UNDO'
      });
      return;
    }
    if (err.code === 'VERSION_CONFLICT') {
      sendJson(res, 409, {
        error: err.message || 'Brain version conflict',
        code: 'VERSION_CONFLICT',
        currentVersion: err.currentVersion
      });
      return;
    }
    throw err;
  }

  sendJson(res, 200, {
    ok: true,
    brainSummary: {
      version: saved.version,
      metrics: saved.metrics
    }
  });
}

async function handleBrainRuleStatus(req, res, ruleId) {
  let username;
  try {
    username = requireAdmin(req);
  } catch (err) {
    if (err.code === 'ADMIN_REQUIRED') {
      sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
      return;
    }
    throw err;
  }

  const buffer = await readBody(req);
  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  const nextStatus = body && body.status != null ? String(body.status).trim() : '';
  if (!ALLOWED_RULE_STATUSES.has(nextStatus)) {
    sendJson(res, 400, {
      error: 'status must be active, rejected, or disabled',
      code: 'INVALID_STATUS'
    });
    return;
  }

  const expectedVersion =
    body && body.brainVersion != null ? Number(body.brainVersion) : undefined;

  const brain = loadBrain();
  const found = findBrainRule(brain, ruleId);
  if (!found) {
    sendJson(res, 404, { error: 'Rule not found', code: 'RULE_NOT_FOUND' });
    return;
  }

  const { rule, collection } = found;
  const fromStatus = String(rule.status || '');
  if (!isAllowedRuleStatusTransition(fromStatus, nextStatus)) {
    sendJson(res, 400, {
      error: `Cannot transition rule from ${fromStatus || 'unknown'} to ${nextStatus}`,
      code: 'INVALID_STATUS'
    });
    return;
  }

  rule.status = nextStatus;
  rule.reviewedAt = new Date().toISOString();
  rule.reviewedBy = username;
  if (nextStatus === 'disabled') {
    rule.disabledAt = rule.reviewedAt;
  }

  if (!Array.isArray(brain.events)) brain.events = [];
  brain.events.push({
    id: shortAuditId('ev'),
    at: rule.reviewedAt,
    by: username,
    action: auditActionForStatus(nextStatus, collection),
    ruleId: rule.id,
    kind: rule.kind || '',
    fromStatus,
    toStatus: nextStatus
  });

  let saved;
  try {
    saved = saveBrain(brain, {
      expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : undefined
    });
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      sendJson(res, 409, {
        error: err.message || 'Brain version conflict',
        code: 'VERSION_CONFLICT',
        currentVersion: err.currentVersion
      });
      return;
    }
    throw err;
  }

  sendJson(res, 200, {
    ok: true,
    rule,
    brainSummary: {
      version: saved.version,
      metrics: saved.metrics
    }
  });
}

function handleListError(res, err) {
  const code = err.code || 'SERVER_ERROR';
  const status =
    code === 'LIST_NOT_FOUND' || code === 'NO_LISTS' ? 404
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
    const scope = scopeFromReq(req);
    const hasName = body.name !== undefined && body.name !== null && String(body.name).trim();
    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim();
    if (!hasName && !hasStatus) {
      sendJson(res, 400, {
        error: 'name or status is required',
        code: 'INVALID_PATCH'
      });
      return;
    }
    let meta = null;
    if (hasName) {
      const result = renameList(listId, body.name, scope);
      meta = result.meta;
    }
    if (hasStatus) {
      const result = setListStatus(listId, body.status, scope);
      meta = result.meta;
    }
    sendJson(res, 200, { ok: true, list: meta });
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

async function handleListDownloadAll(req, res, format, url) {
  try {
    const idsRaw = url && url.searchParams ? url.searchParams.get('ids') : '';
    const listIds = String(idsRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const opts = listIds.length ? { listIds } : {};
    const download = buildDownloadAll(format, scopeFromReq(req), opts);
    const disposition = `attachment; filename="${download.filename.replace(/"/g, '')}"`;
    res.writeHead(200, {
      'Content-Type': download.contentType,
      'Content-Disposition': disposition,
      'Content-Length': download.buffer.length,
      'Cache-Control': 'no-store',
      'X-Filter-List-Count': String(download.listCount || 0),
      'X-Filter-Record-Count': String(download.recordCount || 0)
    });
    res.end(download.buffer);
  } catch (err) {
    if (!res.headersSent) handleListError(res, err);
  }
}

/**
 * GET /api/bridge/lists/download-all-batched?format=xlsx|csv&ids=a,b&batchSize=5000
 * XLSX: one file, one sheet per 5k batch. CSV: zip of one CSV per batch.
 */
async function handleListDownloadAllBatched(req, res, format, url) {
  try {
    const idsRaw = url && url.searchParams ? url.searchParams.get('ids') : '';
    const listIds = String(idsRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const batchRaw = url && url.searchParams ? url.searchParams.get('batchSize') : '';
    const batchSize = batchRaw ? Number(batchRaw) : undefined;
    const opts = listIds.length ? { listIds } : {};
    if (Number.isFinite(batchSize) && batchSize > 0) opts.batchSize = batchSize;
    const download = await buildDownloadAllBatched(format, scopeFromReq(req), opts);
    const disposition = `attachment; filename="${download.filename.replace(/"/g, '')}"`;
    res.writeHead(200, {
      'Content-Type': download.contentType,
      'Content-Disposition': disposition,
      'Content-Length': download.buffer.length,
      'Cache-Control': 'no-store',
      'X-Filter-List-Count': String(download.listCount || 0),
      'X-Filter-Record-Count': String(download.recordCount || 0),
      'X-Filter-Batch-Count': String(download.batchCount || 0),
      'X-Filter-Batch-Size': String(download.batchSize || 5000)
    });
    res.end(download.buffer);
  } catch (err) {
    if (!res.headersSent) handleListError(res, err);
  }
}

/**
 * POST /api/bridge/paste-to-excel
 * Body: { text: string, filename?: string }
 * Returns a downloadable .xlsx (AutoFilter, Arial, bold headers). No tagging.
 */
async function handlePasteToExcel(req, res) {
  try {
    const raw = await readBody(req);
    if (raw.length > MAX_PASTE_BODY_BYTES) {
      sendJson(res, 413, { error: 'Paste body is too large', code: 'PASTE_TOO_LARGE' });
      return;
    }
    let body = {};
    try {
      body = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body', code: 'BAD_JSON' });
      return;
    }
    const text = body.text != null ? String(body.text) : '';
    if (!text.trim()) {
      sendJson(res, 400, { error: 'Paste is empty — paste tabular text first', code: 'EMPTY_PASTE' });
      return;
    }
    const result = await pasteTextToExcel(text, { filename: body.filename });
    const disposition = `attachment; filename="${result.filename.replace(/"/g, '')}"`;
    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': disposition,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'no-store',
      'X-Paste-Rows': String(result.rowCount),
      'X-Paste-Cols': String(result.colCount),
      'X-Paste-Delimiter': String(result.delimiter || '')
    });
    res.end(result.buffer);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Could not convert paste to Excel';
    const status = /empty|no usable|no columns|Could not parse/i.test(msg) ? 400 : 500;
    if (!res.headersSent) {
      sendJson(res, status, { error: msg, code: status === 400 ? 'PASTE_PARSE' : 'SERVER_ERROR' });
    }
  }
}

async function handleListClearAll(req, res) {
  try {
    const result = clearAllLists(scopeFromReq(req));
    sendJson(res, 200, { ok: true, deleted: result.deleted, remaining: 0 });
  } catch (err) {
    handleListError(res, err);
  }
}

/** Bulk delete by ids — body: { ids: string[] } */
async function handleListDeleteMany(req, res) {
  try {
    const buffer = await readBody(req);
    let body = {};
    try {
      body = JSON.parse(buffer.toString('utf8') || '{}');
    } catch (_) {
      body = {};
    }
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) {
      sendJson(res, 400, { error: 'ids array required', code: 'INVALID_IDS' });
      return;
    }
    const result = deleteLists(ids, scopeFromReq(req));
    sendJson(res, 200, {
      ok: true,
      deleted: result.deleted,
      remaining: result.remaining
    });
  } catch (err) {
    handleListError(res, err);
  }
}

function handleGeocodioError(res, err) {
  const code = err.code || 'SERVER_ERROR';
  const status =
    code === 'NOT_FOUND' || code === 'NO_RESULT' ? 404
      : code === 'NOT_READY' || code === 'JOB_IN_PROGRESS' ? 409
        : code === 'NO_KEYS' || code === 'NO_STREET_COLUMN' || code === 'NO_ADDRESS_ROWS'
          || code === 'TOO_MANY_ROWS' || code === 'INVALID_UPLOAD'
          ? 400
          : 500;
  sendJson(res, status, {
    error: err.message || 'Geocodio error',
    code,
    jobId: err.jobId || undefined,
    status: err.status || undefined
  });
}

async function handleGeocodioUsage(req, res) {
  try {
    sendJson(res, 200, getUsageForModal());
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handleGeocodioStatus(req, res) {
  try {
    const { keys, dailyLimit, timezone } = loadGeocodioKeys();
    sendJson(res, 200, {
      ok: true,
      configured: keys.length > 0,
      keyCount: keys.length,
      dailyLimit,
      timezone,
      totalCapacity: keys.length * dailyLimit
    });
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handleGeocodioJobsList(req, res) {
  try {
    const { jobs } = listGeocodioJobs(scopeFromReq(req));
    sendJson(res, 200, { ok: true, jobs, configured: hasGeocodioKeys() });
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handleGeocodioJobCreate(req, res) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!/multipart\/form-data/i.test(contentType)) {
      sendJson(res, 400, { error: 'Expected multipart form upload', code: 'INVALID_UPLOAD' });
      return;
    }
    const buffer = await readBody(req);
    if (buffer.length > MAX_GEOCODIO_UPLOAD_BYTES) {
      sendJson(res, 413, { error: 'Upload too large', code: 'UPLOAD_TOO_LARGE' });
      return;
    }
    const { files } = parseMultipart(buffer, contentType);
    const uploaded = collectUploadFiles(files)[0];
    if (!uploaded || !uploaded.data) {
      sendJson(res, 400, { error: 'No file uploaded', code: 'INVALID_UPLOAD' });
      return;
    }
    const filename = uploaded.filename || 'upload.csv';
    if (!/\.(csv|tsv|xlsx|xls|xlsm)$/i.test(filename)) {
      sendJson(res, 400, { error: 'Upload a CSV or Excel file', code: 'INVALID_UPLOAD' });
      return;
    }
    const job = createGeocodioJob({
      buffer: uploaded.data,
      filename,
      scopeMeta: scopeFromReq(req)
    });
    sendJson(res, 201, { ok: true, job });
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handleGeocodioJobGet(req, res, jobId) {
  try {
    const job = getGeocodioJob(jobId, scopeFromReq(req));
    sendJson(res, 200, { ok: true, job });
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handleGeocodioJobDownload(req, res, jobId) {
  try {
    const download = getGeocodioJobDownload(jobId, scopeFromReq(req));
    const disposition = `attachment; filename="${download.filename.replace(/"/g, '')}"`;
    res.writeHead(200, {
      'Content-Type': download.contentType,
      'Content-Disposition': disposition,
      'Content-Length': download.buffer.length,
      'Cache-Control': 'no-store'
    });
    res.end(download.buffer);
  } catch (err) {
    if (!res.headersSent) handleGeocodioError(res, err);
  }
}

async function handleGeocodioJobDelete(req, res, jobId) {
  try {
    sendJson(res, 200, deleteGeocodioJob(jobId, scopeFromReq(req)));
  } catch (err) {
    handleGeocodioError(res, err);
  }
}

async function handle(req, res, pathname, url) {
  try {
    if (pathname === '/api/bridge/states' && req.method === 'GET') {
      await handleStates(res);
      return true;
    }

    if (pathname === '/api/bridge/cities' && req.method === 'GET') {
      const all = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true';
      await handleCities(res, url.searchParams.get('state'), { all });
      return true;
    }

    if (pathname === '/api/bridge/process' && req.method === 'POST') {
      await handleProcess(req, res);
      return true;
    }

    if (pathname === '/api/bridge/paste-to-excel' && req.method === 'POST') {
      await handlePasteToExcel(req, res);
      return true;
    }

    if (pathname === '/api/bridge/attach' && req.method === 'POST') {
      await handleAttach(req, res);
      return true;
    }

    if (pathname === '/api/bridge/city-outcome' && req.method === 'POST') {
      await handleCityOutcome(req, res);
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

    if (pathname === '/api/bridge/lists' && req.method === 'DELETE') {
      await handleListClearAll(req, res);
      return true;
    }

    if (pathname === '/api/bridge/lists/download-all' && req.method === 'GET') {
      await handleListDownloadAll(req, res, url.searchParams.get('format'), url);
      return true;
    }

    if (pathname === '/api/bridge/lists/download-all-batched' && req.method === 'GET') {
      await handleListDownloadAllBatched(req, res, url.searchParams.get('format'), url);
      return true;
    }

    if (pathname === '/api/bridge/lists/delete-many' && req.method === 'POST') {
      await handleListDeleteMany(req, res);
      return true;
    }

    if (pathname === '/api/bridge/lists/clear' && req.method === 'POST') {
      await handleListClearAll(req, res);
      return true;
    }

    if (pathname === '/api/bridge/geocodio/usage' && req.method === 'GET') {
      await handleGeocodioUsage(req, res);
      return true;
    }

    if (pathname === '/api/bridge/geocodio/status' && req.method === 'GET') {
      await handleGeocodioStatus(req, res);
      return true;
    }

    if (pathname === '/api/bridge/geocodio/jobs' && req.method === 'GET') {
      await handleGeocodioJobsList(req, res);
      return true;
    }

    if (pathname === '/api/bridge/geocodio/jobs' && req.method === 'POST') {
      await handleGeocodioJobCreate(req, res);
      return true;
    }

    const geoDownloadMatch = pathname.match(/^\/api\/bridge\/geocodio\/jobs\/([^/]+)\/download$/);
    if (geoDownloadMatch && req.method === 'GET') {
      await handleGeocodioJobDownload(req, res, decodeURIComponent(geoDownloadMatch[1]));
      return true;
    }

    const geoJobMatch = pathname.match(/^\/api\/bridge\/geocodio\/jobs\/([^/]+)$/);
    if (geoJobMatch) {
      const jobId = decodeURIComponent(geoJobMatch[1]);
      if (req.method === 'GET') {
        await handleGeocodioJobGet(req, res, jobId);
        return true;
      }
      if (req.method === 'DELETE') {
        await handleGeocodioJobDelete(req, res, jobId);
        return true;
      }
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

    // Admin: clear Type-column format memory so re-upload re-prompts confirm
    const cityFormatMatch = pathname.match(
      /^\/api\/bridge\/city-format\/([^/]+)(?:\/([^/]+))?$/
    );
    if (cityFormatMatch && req.method === 'DELETE') {
      let username;
      try {
        username = requireAdmin(req);
      } catch (err) {
        if (err.code === 'ADMIN_REQUIRED') {
          sendJson(res, 403, { error: err.message || 'Admin required', code: 'ADMIN_REQUIRED' });
          return true;
        }
        throw err;
      }
      const cityId = decodeURIComponent(cityFormatMatch[1]);
      const uploadType = cityFormatMatch[2]
        ? decodeURIComponent(cityFormatMatch[2])
        : undefined;
      const before = loadCityFormat(cityId, uploadType || 'code_violation');
      const removed = deleteCityFormat(cityId, uploadType);
      sendJson(res, 200, {
        ok: true,
        cityId,
        uploadType: uploadType || null,
        removed,
        hadFormat: Boolean(before),
        clearedBy: username
      });
      return true;
    }

    if (pathname === '/api/bridge/brain/decisions' && req.method === 'POST') {
      await handleBrainDecision(req, res);
      return true;
    }

    if (pathname === '/api/bridge/brain/undo' && req.method === 'POST') {
      await handleBrainUndo(req, res);
      return true;
    }

    if (pathname === '/api/bridge/brain/metrics' && req.method === 'GET') {
      await handleBrainMetrics(req, res);
      return true;
    }

    if (pathname === '/api/bridge/brain' && req.method === 'GET') {
      await handleBrainGet(req, res);
      return true;
    }

    const brainRuleStatusMatch = pathname.match(/^\/api\/bridge\/brain\/rules\/([^/]+)\/status$/);
    if (brainRuleStatusMatch && req.method === 'POST') {
      await handleBrainRuleStatus(req, res, decodeURIComponent(brainRuleStatusMatch[1]));
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
  requireAdmin,
  groupStates,
  citiesForState,
  buildStubProcessResponse,
  parseResponseReceivedAt,
  forgeDownloadUrl
};