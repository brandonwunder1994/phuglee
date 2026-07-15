const https = require('https');
const fs = require('fs');
const path = require('path');

// New AI Studio (AQ.) keys cannot call retired 2.5/2.0 models ("no longer available to new users").
// Prefer cheap high-volume lite first; keep flash-latest / 3.5 as quality fallbacks.
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash'
];
const GEMINI_MAX_CONCURRENT = 50;

let serverGeminiKey = '';
let geminiActive = 0;
const geminiWaiters = [];
let geminiAuditWriteChain = Promise.resolve();

function normalizeGeminiKey(key) {
  let k = String(key || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  const aq = k.match(/AQ\.[A-Za-z0-9_.-]{8,}/);
  if (aq) return aq[0];
  const aiZa = k.match(/AIza[A-Za-z0-9_-]{20,}/);
  if (aiZa) return aiZa[0];
  return k.replace(/\s+/g, '');
}

function loadGeminiKey() {
  if (serverGeminiKey) return serverGeminiKey;
  serverGeminiKey = normalizeGeminiKey(process.env.GEMINI_API_KEY || '');
  return serverGeminiKey;
}

function geminiKeyStatus() {
  const k = loadGeminiKey();
  return {
    hasGeminiKey: !!k,
    geminiKeyTail: k.length >= 6 ? k.slice(-6) : null
  };
}

function getGeminiQueueState() {
  return { active: geminiActive, waiting: geminiWaiters.length, maxConcurrent: GEMINI_MAX_CONCURRENT };
}

function httpsPost(url, body, headers = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function acquireGeminiSlot() {
  return new Promise((resolve) => {
    if (geminiActive < GEMINI_MAX_CONCURRENT) {
      geminiActive++;
      resolve();
    } else {
      geminiWaiters.push(resolve);
    }
  });
}

function releaseGeminiSlot() {
  geminiActive = Math.max(0, geminiActive - 1);
  if (geminiWaiters.length && geminiActive < GEMINI_MAX_CONCURRENT) {
    geminiActive++;
    const next = geminiWaiters.shift();
    next();
  }
}

function parseGeminiErrorBody(body) {
  try {
    const data = JSON.parse(body);
    return data.error?.message || '';
  } catch (_) {
    return String(body || '').slice(0, 200);
  }
}

function shortenGeminiError(status, body) {
  const msg = parseGeminiErrorBody(body);
  if (status === 503 || /high demand|overloaded|unavailable/i.test(msg)) {
    return 'Gemini is temporarily overloaded (503). Wait and retry — your API key is fine.';
  }
  // IMPORTANT: do not use bare /rate/ — it matches "generateContent" and mislabels every Gemini error as 429.
  if (status === 429 || /\brate[\s_-]?limit\b|too many requests|resource_exhausted|quota exceeded|exceeded your current quota/i.test(msg)) {
    return 'Gemini rate limit hit (429). Slow down workers or wait a few minutes.';
  }
  if (status === 404 || /not found for API version|is not supported for generateContent|model .* not found/i.test(msg)) {
    return `Gemini model unavailable (HTTP ${status}): ${msg || 'model not found'}`;
  }
  if (status === 400 && /api key/i.test(msg)) {
    return 'Gemini API key invalid. Paste a new key from aistudio.google.com/apikey (AIza or AQ. format).';
  }
  if (status === 401 && /api key/i.test(msg)) {
    return 'Gemini API key rejected (401). New AQ. keys from AI Studio are supported — paste the full key including the AQ. prefix.';
  }
  if ((status === 403 || status === 400) && /generativelanguage|has not been used|not enabled/i.test(msg)) {
    return 'This is a Google Cloud Maps key, not a Gemini key. Create a separate key at aistudio.google.com/apikey (AI Studio) — do not reuse the Street View key unless it was created there.';
  }
  return msg ? `Gemini HTTP ${status}: ${msg}` : `Gemini HTTP ${status}`;
}

function geminiAuthForKey(key) {
  const k = normalizeGeminiKey(key);
  if (!k) return { urlKey: '', headers: {} };
  if (k.startsWith('AQ.')) {
    return {
      url: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: { 'x-goog-api-key': k }
    };
  }
  return {
    url: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(k)}`,
    headers: {}
  };
}

function createGeminiHelpers(apiStats, usageStore) {
  const { isHardQuotaError } = require('../lib/api-usage');

  function noteGeminiResult(status, ok, errMsg) {
    const now = Date.now();
    const st = Number(status) || 0;
    if (ok) {
      apiStats.geminiOk++;
      // Clear sticky rate-limit banner so /api/status recovers after a good call
      if (/429|rate limit/i.test(apiStats.lastGeminiError || '')) {
        apiStats.lastGeminiError = '';
        apiStats.lastGeminiErrorAt = 0;
      }
      if (usageStore) usageStore.recordGemini({ ok: true, status: 200 });
      return;
    }
    apiStats.geminiFail++;
    if (st === 429) {
      apiStats.gemini429++;
      apiStats.gemini429Times.push(now);
    }
    if (st === 503) apiStats.gemini503++;
    apiStats.gemini429Times = apiStats.gemini429Times.filter(t => now - t < 120000);
    if (errMsg) {
      apiStats.lastGeminiError = String(errMsg).slice(0, 200);
      apiStats.lastGeminiErrorAt = now;
    }
    if (isHardQuotaError(st, errMsg)) {
      apiStats.geminiHardQuota = (apiStats.geminiHardQuota || 0) + 1;
      apiStats.lastHardQuota = {
        provider: 'gemini',
        at: now,
        status: st,
        message: String(errMsg || '').slice(0, 280)
      };
    }
    if (usageStore) usageStore.recordGemini({ ok: false, status: st, error: errMsg });
  }

  async function geminiGenerateInner(key, { prompt, base64, mimeType, images, maxOutputTokens = 1024 }) {
    const parts = [{ text: prompt }];
    const imgList = Array.isArray(images) && images.length
      ? images
      : (base64 ? [{ base64, mimeType }] : []);
    for (const img of imgList) {
      if (img?.base64) {
        parts.push({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.base64 } });
      }
    }
    let lastErr = 'All Gemini models failed';
    let lastRawGoogle = '';
    let lastHttpStatus = 0;
    const attempts = [];
    const auth = geminiAuthForKey(key);

    for (const model of GEMINI_MODELS) {
      const geminiUrl = auth.url(model);
      const body = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens }
      });
      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await httpsPost(geminiUrl, body, auth.headers);
        if (result.status === 200) {
          const data = JSON.parse(result.body);
          const partsOut = data.candidates?.[0]?.content?.parts || [];
          // Gemini 3.x may return thought parts before the visible answer.
          const text = partsOut
            .filter((p) => p && p.text && !p.thought)
            .map((p) => p.text)
            .join('')
            || partsOut.map((p) => p.text || '').join('')
            || '';
          if (text) {
            noteGeminiResult(200, true);
            return { ok: true, model, text };
          }
          lastErr = `Gemini ${model}: empty response`;
          lastRawGoogle = '';
          lastHttpStatus = 200;
          attempts.push({ model, attempt, status: 200, error: 'empty response' });
          break;
        }
        lastRawGoogle = parseGeminiErrorBody(result.body);
        lastHttpStatus = result.status;
        lastErr = shortenGeminiError(result.status, result.body);
        attempts.push({
          model,
          attempt,
          status: result.status,
          error: (lastRawGoogle || lastErr).slice(0, 240)
        });
        const hardQuota = isHardQuotaError(result.status, lastRawGoogle || lastErr);
        // Hard quota is not retryable — stop trying models/attempts immediately
        if (hardQuota) {
          noteGeminiResult(result.status, false, lastErr);
          return {
            ok: false,
            error: lastErr,
            rawGoogleError: lastRawGoogle || undefined,
            httpStatus: result.status,
            hardQuota: true,
            status: result.status,
            attempts
          };
        }
        const retryable = result.status === 429 || result.status === 503 || result.status === 500;
        if (retryable && attempt < maxAttempts - 1) {
          const waitMs = result.status === 503
            ? 3000 + attempt * 2000 + Math.floor(Math.random() * 1500)
            : 1200 * (attempt + 1);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        if (retryable) {
          console.error(`[Gemini] ${model} ${result.status}:`, (lastRawGoogle || lastErr).slice(0, 220));
          break;
        }
        console.error(`[Gemini] ${model} failed:`, (lastRawGoogle || lastErr).slice(0, 160));
        break;
      }
    }
    // Infer status from error text when loop ends without a hard-quota short-circuit
    let failStatus = lastHttpStatus || 500;
    if (!failStatus || failStatus === 200) {
      if (/429|rate limit/i.test(lastErr) || /429|rate limit/i.test(lastRawGoogle)) failStatus = 429;
      else if (/503|overloaded/i.test(lastErr)) failStatus = 503;
    }
    noteGeminiResult(failStatus, false, lastErr);
    return {
      ok: false,
      error: lastErr,
      rawGoogleError: lastRawGoogle || undefined,
      httpStatus: failStatus,
      hardQuota: isHardQuotaError(failStatus, lastRawGoogle || lastErr),
      status: failStatus,
      attempts
    };
  }

  async function geminiGenerate(key, opts) {
    await acquireGeminiSlot();
    try {
      return await geminiGenerateInner(key, opts);
    } finally {
      releaseGeminiSlot();
    }
  }

  return { geminiGenerate, noteGeminiResult };
}

function ensureGeminiAuditDir(GEMINI_AUDIT_DIR) {
  if (!fs.existsSync(GEMINI_AUDIT_DIR)) {
    fs.mkdirSync(GEMINI_AUDIT_DIR, { recursive: true });
  }
}

function geminiAuditPathForDate(GEMINI_AUDIT_DIR, d = new Date()) {
  const stamp = d.toISOString().slice(0, 10);
  return path.join(GEMINI_AUDIT_DIR, `gemini_audit_${stamp}.jsonl`);
}

function extractAddressFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const patterns = [
    /Address:\s*([^\n]+)/i,
    /property at:\s*([^\n.]+)/i,
    /SUBJECT lot at:\s*([^\n.]+)/i,
    /Target parcel address:\s*([^\n.]+)/i
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1]) return m[1].trim().slice(0, 240);
  }
  return null;
}

function createAuditHelpers(GEMINI_AUDIT_DIR) {
  function appendGeminiAudit(entry) {
    ensureGeminiAuditDir(GEMINI_AUDIT_DIR);
    const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
    const file = geminiAuditPathForDate(GEMINI_AUDIT_DIR);
    geminiAuditWriteChain = geminiAuditWriteChain
      .then(() => fs.promises.appendFile(file, line, 'utf8'))
      .catch((err) => console.warn('[Gemini audit] write failed:', err.message));
  }

  function readGeminiAuditFiles() {
    ensureGeminiAuditDir(GEMINI_AUDIT_DIR);
    return fs.readdirSync(GEMINI_AUDIT_DIR)
      .filter((f) => f.startsWith('gemini_audit_') && f.endsWith('.jsonl'))
      .map((f) => path.join(GEMINI_AUDIT_DIR, f))
      .sort();
  }

  function summarizeGeminiAudit() {
    const files = readGeminiAuditFiles();
    let total = 0;
    let ok = 0;
    let fail = 0;
    const byType = {};
    const addresses = new Set();
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          total++;
          if (row.ok) ok++;
          else fail++;
          const type = row.scanType || 'unknown';
          byType[type] = (byType[type] || 0) + 1;
          if (row.address) addresses.add(String(row.address).toLowerCase());
        } catch (_) {}
      }
    }
    return {
      dir: GEMINI_AUDIT_DIR,
      files: files.map((f) => path.basename(f)),
      total,
      success: ok,
      fail,
      uniqueAddresses: addresses.size,
      byType
    };
  }

  return { appendGeminiAudit, readGeminiAuditFiles, summarizeGeminiAudit };
}

function register(ctx) {
  const { router, sendJson, readBody, config, apiStats, usageStore, fs: ctxFs } = ctx;
  const { GEMINI_AUDIT_DIR } = config;
  const geminiHelpers = createGeminiHelpers(apiStats, usageStore);
  const auditHelpers = createAuditHelpers(GEMINI_AUDIT_DIR);

  ctx.loadGeminiKey = loadGeminiKey;

  router.get('/api/gemini-audit/stats', async (req, res, url) => {
    sendJson(res, 200, { ok: true, ...auditHelpers.summarizeGeminiAudit() });
    return true;
  });

  router.get('/api/gemini-audit/export', async (req, res, url) => {
    const limit = Math.min(50000, Math.max(1, parseInt(url.searchParams.get('limit') || '5000', 10)));
    const onlyOk = url.searchParams.get('ok') === '1';
    const rows = [];
    for (const file of auditHelpers.readGeminiAuditFiles()) {
      const lines = ctxFs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (onlyOk && !row.ok) continue;
          rows.push(row);
        } catch (_) {}
      }
    }
    rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    sendJson(res, 200, {
      ok: true,
      count: rows.length,
      returned: Math.min(limit, rows.length),
      rows: rows.slice(0, limit)
    });
    return true;
  });

  router.post('/api/gemini-vision', async (req, res, url) => {
    let raw = await readBody(req);
    const { prompt, base64, mimeType, images, maxOutputTokens, address, scanType } = JSON.parse(raw);
    const key = loadGeminiKey();
    if (!key) {
      sendJson(res, 400, { ok: false, error: 'GEMINI_API_KEY not configured in .env' });
      return true;
    }
    if (!prompt) {
      sendJson(res, 400, { ok: false, error: 'Missing prompt' });
      return true;
    }

    const addr = (address && String(address).trim()) || extractAddressFromPrompt(prompt);
    const result = await geminiHelpers.geminiGenerate(key, { prompt, base64, mimeType, images, maxOutputTokens: maxOutputTokens || 1024 });
    auditHelpers.appendGeminiAudit({
      address: addr,
      scanType: scanType || 'unknown',
      ok: !!result.ok,
      model: result.model || null,
      text: result.ok ? result.text : null,
      error: result.ok ? null : (result.error || 'Gemini failed'),
      promptLen: prompt?.length || 0,
      hasImages: !!(base64 || (Array.isArray(images) && images.length))
    });
    sendJson(res, 200, result);
    return true;
  });

  router.post('/api/test-gemini', async (req, res, url) => {
    let raw = await readBody(req);
    const { prompt } = JSON.parse(raw);
    const key = loadGeminiKey();
    if (!key) {
      sendJson(res, 400, { ok: false, error: 'GEMINI_API_KEY not configured in .env' });
      return true;
    }

    const result = await geminiHelpers.geminiGenerate(key, { prompt: prompt || 'Reply with only: OK', maxOutputTokens: 64 });
    sendJson(res, 200, result.ok
      ? { ok: true, model: result.model, text: result.text }
      : {
          ok: false,
          error: result.error,
          rawGoogleError: result.rawGoogleError || null,
          httpStatus: result.httpStatus || result.status || null,
          hardQuota: !!result.hardQuota,
          keyTail: geminiKeyStatus().geminiKeyTail,
          keyFormat: loadGeminiKey().startsWith('AQ.') ? 'AQ' : (loadGeminiKey().startsWith('AIza') ? 'AIza' : 'other'),
          attempts: result.attempts || null
        });
    return true;
  });
}

module.exports = {
  register,
  loadGeminiKey,
  geminiKeyStatus,
  getGeminiQueueState,
  GEMINI_MAX_CONCURRENT
};