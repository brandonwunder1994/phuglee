/**
 * Geocodio clean jobs: create, run, list, download, retain last 10.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { resolveSessionScope } = require('./phuglee-user');
const { loadGeocodioKeys, hasGeocodioKeys } = require('./geocodio-keys');
const {
  pickNextKey,
  remainingForKey,
  recordLookups,
  markExhausted,
  loadUsage
} = require('./geocodio-usage');
const {
  geocodeRowsWithKey,
  cleanRowsToCsv
} = require('./geocodio-client');
const { parseAddressUpload } = require('./geocodio-parse');

const MAX_JOBS = 10;
const MAX_ROWS = 100000;
const SUB_BATCH = 100;

/** In-process runners so we don't double-start */
const running = new Map();

function jobsRoot(rootOverride) {
  return rootOverride || config.GEOCODIO_ROOT;
}

function resolveScope(meta = {}) {
  return resolveSessionScope({
    username: meta.username || '',
    plan: meta.plan || ''
  });
}

function scopeDir(scope, rootOverride) {
  const key = scope?.storageKey || '_anonymous';
  return path.join(jobsRoot(rootOverride), 'jobs', key);
}

function indexPath(scope, rootOverride) {
  return path.join(scopeDir(scope, rootOverride), 'index.json');
}

function jobDir(scope, jobId, rootOverride) {
  return path.join(scopeDir(scope, rootOverride), jobId);
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readIndex(scope, rootOverride) {
  const index = readJson(indexPath(scope, rootOverride), { jobs: [] });
  return Array.isArray(index.jobs) ? index.jobs : [];
}

function writeIndex(scope, jobs, rootOverride) {
  writeJsonAtomic(indexPath(scope, rootOverride), {
    jobs,
    updatedAt: new Date().toISOString()
  });
}

function createJobId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  return `geo_${stamp}_${rand}`;
}

function sanitizeJobId(id) {
  return String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/**
 * Drop oldest jobs beyond MAX_JOBS.
 */
function enforceRetention(scope, rootOverride) {
  let jobs = readIndex(scope, rootOverride);
  while (jobs.length > MAX_JOBS) {
    const oldest = jobs[jobs.length - 1];
    jobs = jobs.slice(0, -1);
    if (oldest?.id) {
      try {
        fs.rmSync(jobDir(scope, oldest.id, rootOverride), { recursive: true, force: true });
      } catch (_) { /* ignore */ }
    }
  }
  writeIndex(scope, jobs, rootOverride);
  return jobs;
}

/**
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.filename
 * @param {object} [opts.scopeMeta]
 * @param {string} [opts.root]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl]
 */
function createJob(opts) {
  const env = opts.env || process.env;
  if (!hasGeocodioKeys(env)) {
    const err = new Error('Geocodio API keys are not configured on the server');
    err.code = 'NO_KEYS';
    throw err;
  }

  const scope = resolveScope(opts.scopeMeta || {});
  const root = opts.root;
  const active = readIndex(scope, root).find(
    (j) => j.status === 'queued' || j.status === 'running'
  );
  if (active) {
    const err = new Error(
      `A Geocodio job is already ${active.status} (${active.id}). Wait for it to finish.`
    );
    err.code = 'JOB_IN_PROGRESS';
    err.jobId = active.id;
    throw err;
  }

  const parsed = parseAddressUpload(opts.buffer, opts.filename);
  if (parsed.rows.length > MAX_ROWS) {
    const err = new Error(`Too many address rows (max ${MAX_ROWS})`);
    err.code = 'TOO_MANY_ROWS';
    throw err;
  }

  const jobId = createJobId();
  const dir = jobDir(scope, jobId, root);
  fs.mkdirSync(dir, { recursive: true });

  const inputPath = path.join(dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(parsed.rows), 'utf8');

  const meta = {
    id: jobId,
    status: 'queued',
    sourceFilename: String(opts.filename || 'upload.csv').slice(0, 200),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inputRows: parsed.rows.length,
    processed: 0,
    kept: 0,
    lookupsUsed: 0,
    currentKeyIndex: null,
    currentKeyEmail: null,
    error: null,
    message: null
  };
  writeJsonAtomic(path.join(dir, 'meta.json'), meta);

  const jobs = readIndex(scope, root);
  jobs.unshift({
    id: jobId,
    status: meta.status,
    sourceFilename: meta.sourceFilename,
    createdAt: meta.createdAt,
    inputRows: meta.inputRows,
    kept: 0,
    processed: 0
  });
  writeIndex(scope, jobs, root);
  enforceRetention(scope, root);

  // Fire-and-forget runner
  setImmediate(() => {
    runJob(jobId, {
      scopeMeta: opts.scopeMeta,
      root,
      env,
      fetchImpl: opts.fetchImpl
    }).catch((err) => {
      console.error('[Geocodio job]', jobId, err.message);
    });
  });

  return { ...meta };
}

function loadJobMeta(scope, jobId, rootOverride) {
  const id = sanitizeJobId(jobId);
  const meta = readJson(path.join(jobDir(scope, id, rootOverride), 'meta.json'), null);
  if (!meta) {
    const err = new Error('Job not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return meta;
}

function saveJobMeta(scope, meta, rootOverride) {
  const dir = jobDir(scope, meta.id, rootOverride);
  meta.updatedAt = new Date().toISOString();
  writeJsonAtomic(path.join(dir, 'meta.json'), meta);
  const jobs = readIndex(scope, rootOverride).map((j) => {
    if (j.id !== meta.id) return j;
    return {
      id: meta.id,
      status: meta.status,
      sourceFilename: meta.sourceFilename,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      inputRows: meta.inputRows,
      kept: meta.kept,
      processed: meta.processed,
      error: meta.error || null
    };
  });
  writeIndex(scope, jobs, rootOverride);
  return meta;
}

/**
 * @param {string} jobId
 * @param {{ scopeMeta?: object, root?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} opts
 */
async function runJob(jobId, opts = {}) {
  const env = opts.env || process.env;
  const scope = resolveScope(opts.scopeMeta || {});
  const root = opts.root;
  const id = sanitizeJobId(jobId);
  const runKey = `${scope.storageKey || '_anonymous'}:${id}`;

  if (running.has(runKey)) return loadJobMeta(scope, id, root);
  running.set(runKey, true);

  try {
    const meta = loadJobMeta(scope, id, root);
    if (meta.status === 'complete' || meta.status === 'partial' || meta.status === 'failed') {
      return meta;
    }

    meta.status = 'running';
    meta.message = 'Geocoding…';
    saveJobMeta(scope, meta, root);

    const inputPath = path.join(jobDir(scope, id, root), 'input.json');
    let rows = [];
    try {
      rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } catch {
      meta.status = 'failed';
      meta.error = 'Could not read job input';
      return saveJobMeta(scope, meta, root);
    }

    const allCleaned = [];
    let cursor = 0;
    const { keys } = loadGeocodioKeys(env);
    const usageOpts = { root, env };

    while (cursor < rows.length) {
      const picked = pickNextKey(usageOpts);
      if (!picked) {
        meta.message = 'Daily free tier exhausted across all keys';
        break;
      }

      const keyIndex = keys.findIndex((k) => k.id === picked.id);
      meta.currentKeyIndex = keyIndex >= 0 ? keyIndex + 1 : null;
      meta.currentKeyEmail = picked.email;
      meta.message = `Key ${meta.currentKeyIndex || '?'} of ${keys.length} · ${picked.email}`;
      saveJobMeta(scope, meta, root);

      const remaining = remainingForKey(picked.id, usageOpts);
      if (remaining <= 0) {
        markExhausted(picked.id, 'No remaining lookups', usageOpts);
        continue;
      }

      const slice = rows.slice(cursor, cursor + remaining);
      const result = await geocodeRowsWithKey(slice, picked.key, {
        maxLookups: remaining,
        batchSize: SUB_BATCH,
        fetchImpl: opts.fetchImpl
      });

      if (result.lookupsUsed > 0) {
        recordLookups(picked.id, result.lookupsUsed, usageOpts);
      }
      if (result.exhausted) {
        markExhausted(picked.id, result.error || 'Daily limit', usageOpts);
      }

      allCleaned.push(...result.cleaned);

      if (result.lookupsUsed > 0) {
        cursor += result.lookupsUsed;
      } else if (result.exhausted) {
        // Key blocked with no progress — try next key
        continue;
      } else {
        // Hard failure for this key/network — stop job
        if (result.error) meta.error = result.error;
        break;
      }

      meta.processed = Math.min(rows.length, cursor);
      meta.kept = allCleaned.length;
      meta.lookupsUsed = (meta.lookupsUsed || 0) + (result.lookupsUsed || 0);
      saveJobMeta(scope, meta, root);
    }

    const resultPath = path.join(jobDir(scope, id, root), 'result.csv');
    fs.writeFileSync(resultPath, cleanRowsToCsv(allCleaned), 'utf8');

    meta.processed = Math.min(rows.length, cursor);
    meta.kept = allCleaned.length;
    meta.currentKeyIndex = null;
    meta.currentKeyEmail = null;

    if (cursor < rows.length && allCleaned.length > 0) {
      meta.status = 'partial';
      meta.message = `Stopped with ${rows.length - cursor} rows left (quota). ${allCleaned.length} cleaned rows saved.`;
    } else if (cursor < rows.length && allCleaned.length === 0) {
      meta.status = 'failed';
      meta.error = meta.error || 'No capacity or Geocodio returned no matches';
      meta.message = meta.error;
    } else if (allCleaned.length === 0) {
      meta.status = 'failed';
      meta.error = 'Geocodio returned no complete addresses (street, city, state, zip)';
      meta.message = meta.error;
    } else {
      meta.status = 'complete';
      meta.message = `Done — ${allCleaned.length} cleaned of ${rows.length} input`;
      meta.error = null;
    }

    return saveJobMeta(scope, meta, root);
  } finally {
    running.delete(runKey);
  }
}

function listJobs(scopeMeta = {}, rootOverride) {
  const scope = resolveScope(scopeMeta);
  const jobs = readIndex(scope, rootOverride);
  return {
    jobs: jobs.map((j) => {
      try {
        const meta = loadJobMeta(scope, j.id, rootOverride);
        return {
          id: meta.id,
          status: meta.status,
          sourceFilename: meta.sourceFilename,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          inputRows: meta.inputRows,
          processed: meta.processed,
          kept: meta.kept,
          lookupsUsed: meta.lookupsUsed,
          currentKeyIndex: meta.currentKeyIndex,
          currentKeyEmail: meta.currentKeyEmail,
          message: meta.message,
          error: meta.error
        };
      } catch {
        return j;
      }
    })
  };
}

function getJob(jobId, scopeMeta = {}, rootOverride) {
  const scope = resolveScope(scopeMeta);
  return loadJobMeta(scope, jobId, rootOverride);
}

function getJobDownload(jobId, scopeMeta = {}, rootOverride) {
  const scope = resolveScope(scopeMeta);
  const meta = loadJobMeta(scope, jobId, rootOverride);
  if (!['complete', 'partial'].includes(meta.status)) {
    const err = new Error('Job is not ready to download');
    err.code = 'NOT_READY';
    err.status = meta.status;
    throw err;
  }
  const resultPath = path.join(jobDir(scope, meta.id, rootOverride), 'result.csv');
  if (!fs.existsSync(resultPath)) {
    const err = new Error('Result file missing');
    err.code = 'NO_RESULT';
    throw err;
  }
  const stamp = (meta.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return {
    buffer: fs.readFileSync(resultPath),
    contentType: 'text/csv; charset=utf-8',
    filename: `geocodio-clean-${stamp}-${meta.id}.csv`,
    meta
  };
}

function deleteJob(jobId, scopeMeta = {}, rootOverride) {
  const scope = resolveScope(scopeMeta);
  const id = sanitizeJobId(jobId);
  const dir = jobDir(scope, id, rootOverride);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
  const jobs = readIndex(scope, rootOverride).filter((j) => j.id !== id);
  writeIndex(scope, jobs, rootOverride);
  return { ok: true, id };
}

module.exports = {
  MAX_JOBS,
  createJob,
  runJob,
  listJobs,
  getJob,
  getJobDownload,
  deleteJob,
  hasGeocodioKeys
};
