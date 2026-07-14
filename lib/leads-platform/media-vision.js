'use strict';

/**
 * Gemini vision labeling for contract media. Dollars stay in rehab-cost-engine.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash'
];

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
  try {
    const analyzer = require('../../modules/property-analyzer/routes/gemini');
    if (typeof analyzer.loadGeminiKey === 'function') {
      const k = analyzer.loadGeminiKey();
      if (k) return k;
    }
  } catch (_) { /* analyzer optional */ }
  return normalizeGeminiKey(process.env.GEMINI_API_KEY || '');
}

function httpsPost(url, body, headers = {}, timeoutMs = 90000) {
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
      reject(new Error('Gemini timeout'));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function geminiAuthForKey(key) {
  const k = String(key || '');
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

async function geminiVision({ prompt, base64, mimeType, maxOutputTokens = 1024 }) {
  const key = loadGeminiKey();
  if (!key) {
    return { ok: false, error: 'GEMINI_API_KEY missing', code: 'NO_GEMINI_KEY' };
  }
  const parts = [{ text: prompt }];
  if (base64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/jpeg',
        data: base64
      }
    });
  }
  const auth = geminiAuthForKey(key);
  let lastErr = 'All Gemini models failed';
  for (const model of GEMINI_MODELS) {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens }
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await httpsPost(auth.url(model), body, auth.headers);
        if (result.status === 200) {
          const data = JSON.parse(result.body);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) return { ok: true, model, text };
          lastErr = `empty from ${model}`;
          break;
        }
        lastErr = `HTTP ${result.status} ${String(result.body || '').slice(0, 120)}`;
        const retryable = result.status === 429 || result.status === 503 || result.status === 500;
        if (retryable && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        if (retryable) break;
        break;
      } catch (err) {
        lastErr = err.message;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  return { ok: false, error: lastErr };
}

const LABEL_PROMPT = `You are inspecting a distressed investment property photo for rehab screening.
Return ONLY valid JSON (no markdown) with this shape:
{
  "room": "kitchen|bathroom|bedroom|living|laundry|garage|mechanical|roof|attic|exterior_front|exterior_side|exterior_rear|yard|other",
  "surfaces": ["floor","walls","ceiling","cabinets",...],
  "issues": [{"text":"short finding","severity":1-5,"category":"roofing|kitchen|bathrooms|flooring|hvac|plumbing|electrical|paint_drywall|exterior|windows_doors|other"}],
  "severity": 1-5,
  "confidence": 0-1,
  "evidence": "one short note"
}
Rules: severity 1=cosmetic, 5=major replace. Prefer mechanical label close-ups when present. If unclear, lower confidence. Do not invent dollars.`;

function parseLabelJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function normalizeAiLabel(raw, meta = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const issues = Array.isArray(raw.issues)
    ? raw.issues.map((i) => ({
      text: String(i.text || i.label || '').trim().slice(0, 200),
      severity: Math.min(5, Math.max(1, Number(i.severity) || 2)),
      category: String(i.category || '').slice(0, 40)
    })).filter((i) => i.text)
    : [];
  return {
    room: String(raw.room || 'other').slice(0, 60),
    surfaces: Array.isArray(raw.surfaces) ? raw.surfaces.map((s) => String(s).slice(0, 40)).slice(0, 12) : [],
    issues,
    severity: Math.min(5, Math.max(1, Number(raw.severity) || 2)),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
    evidence: String(raw.evidence || '').slice(0, 240),
    model: meta.model || null,
    labeledAt: new Date().toISOString(),
    source: meta.source || 'gemini'
  };
}

async function labelImageBuffer(buffer, mimeType = 'image/jpeg') {
  if (!buffer?.length) return { ok: false, error: 'Empty buffer' };
  const base64 = Buffer.from(buffer).toString('base64');
  const result = await geminiVision({
    prompt: LABEL_PROMPT,
    base64,
    mimeType: mimeType || 'image/jpeg',
    maxOutputTokens: 900
  });
  if (!result.ok) return result;
  const parsed = parseLabelJson(result.text);
  const label = normalizeAiLabel(parsed, { model: result.model });
  if (!label) return { ok: false, error: 'Could not parse vision JSON', raw: result.text?.slice(0, 300) };
  return { ok: true, label, model: result.model };
}

/**
 * Queue: label unlabeled image media for a deal, then optional scan synthesize.
 */
const jobState = new Map(); // dealId -> { status, error, updatedAt }

function getMediaJobStatus(dealId) {
  return jobState.get(dealId) || null;
}

async function labelDealMedia(dealId, { force = false, runScan = true } = {}) {
  const contracts = require('./contracts');
  const engine = require('./rehab-cost-engine');
  const deal = contracts.getDeal(dealId);
  if (!deal) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  jobState.set(dealId, { status: 'labeling', error: null, updatedAt: new Date().toISOString() });
  contracts.patchDeal(dealId, {
    conditionScan: {
      ...(deal.conditionScan || {}),
      status: 'labeling',
      jobError: null
    }
  });

  const media = contracts.normalizeSellerMediaList(deal.sellerMedia);
  let labeledN = 0;
  let failedN = 0;
  let lastError = null;

  for (const item of media) {
    if (item.kind === 'video') continue;
    if (!force && item.aiLabel?.room) continue;
    const full = contracts.resolveLocalMediaPath(dealId, item);
    if (!full || !fs.existsSync(full)) {
      failedN += 1;
      lastError = `Missing file for ${item.id}`;
      continue;
    }
    try {
      const buf = fs.readFileSync(full);
      let out = await labelImageBuffer(buf, item.mimeType || 'image/jpeg');
      if (!out.ok && /429|rate|quota|503|overload/i.test(String(out.error || ''))) {
        await new Promise((r) => setTimeout(r, 4000));
        out = await labelImageBuffer(buf, item.mimeType || 'image/jpeg');
      }
      if (!out.ok) {
        failedN += 1;
        lastError = out.error || 'label failed';
        console.warn('[media-vision] label failed', dealId, item.id, lastError);
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      const nextMedia = contracts.normalizeSellerMediaList(
        contracts.getDeal(dealId).sellerMedia
      ).map((m) => {
        if (m.id !== item.id) return m;
        return { ...m, aiLabel: out.label };
      });
      const saved = contracts.upsertDeal({
        ...contracts.getDeal(dealId),
        sellerMedia: nextMedia
      });
      deal.sellerMedia = saved.sellerMedia;
      labeledN += 1;
      await new Promise((r) => setTimeout(r, 900));
    } catch (err) {
      failedN += 1;
      lastError = err.message;
      console.warn('[media-vision] label failed', dealId, item.id, err.message);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  let scan = null;
  if (runScan) {
    jobState.set(dealId, { status: 'scanning', error: null, updatedAt: new Date().toISOString() });
    contracts.patchDeal(dealId, {
      conditionScan: {
        ...(contracts.getDeal(dealId).conditionScan || {}),
        status: 'scanning'
      }
    });
    const fresh = contracts.getDeal(dealId);
    const mediaItems = contracts.enrichSellerMediaForDisplay(fresh);
    // enrich doesn't include aiLabel stripping — preserve from list
    const withLabels = mediaItems.map((m) => {
      const raw = contracts.normalizeSellerMediaList(fresh.sellerMedia).find((x) => x.id === m.id);
      return { ...m, aiLabel: raw?.aiLabel || m.aiLabel };
    });
    scan = engine.synthesizeConditionScan({ deal: fresh, mediaItems: withLabels });
    contracts.patchDeal(dealId, { conditionScan: scan });
  } else {
    contracts.patchDeal(dealId, {
      conditionScan: {
        ...(contracts.getDeal(dealId).conditionScan || {}),
        status: labeledN ? 'labeled' : 'idle'
      }
    });
  }

  jobState.set(dealId, {
    status: 'ready',
    error: failedN && !labeledN ? (lastError || 'Label failures') : null,
    labeledN,
    failedN,
    lastError,
    updatedAt: new Date().toISOString()
  });

  const finalDeal = contracts.getDeal(dealId);
  if (finalDeal?.conditionScan && lastError && failedN) {
    contracts.patchDeal(dealId, {
      conditionScan: {
        ...finalDeal.conditionScan,
        jobError: failedN ? `${failedN} label failure(s): ${lastError}` : null
      }
    });
  }

  return {
    deal: contracts.enrichDealForDisplay(contracts.getDeal(dealId)),
    labeledN,
    failedN,
    lastError,
    scan: contracts.getDeal(dealId).conditionScan
  };
}

function enqueueLabelDealMedia(dealId, opts = {}) {
  const key = String(dealId);
  const cur = jobState.get(key);
  if (cur && (cur.status === 'labeling' || cur.status === 'scanning' || cur.status === 'queued')) {
    return { queued: false, already: true };
  }
  jobState.set(key, { status: 'queued', updatedAt: new Date().toISOString() });
  setImmediate(() => {
    labelDealMedia(dealId, opts).catch((err) => {
      console.warn('[media-vision] job failed', dealId, err.message);
      jobState.set(key, {
        status: 'error',
        error: err.message,
        updatedAt: new Date().toISOString()
      });
      try {
        const contracts = require('./contracts');
        const d = contracts.getDeal(dealId);
        if (d) {
          contracts.patchDeal(dealId, {
            conditionScan: {
              ...(d.conditionScan || {}),
              status: 'error',
              jobError: err.message
            }
          });
        }
      } catch (_) { /* ignore */ }
    });
  });
  return { queued: true };
}

module.exports = {
  loadGeminiKey,
  labelImageBuffer,
  labelDealMedia,
  enqueueLabelDealMedia,
  getMediaJobStatus,
  normalizeAiLabel,
  parseLabelJson
};
