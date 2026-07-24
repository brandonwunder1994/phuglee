'use strict';

const { readPhugleeUser } = require('../phuglee-user');
const { isAdminUsername } = require('../phuglee-roles');
const { isSmsCampaignsLive, isSmsCampaignsAuto } = require('./sms-flags');
const {
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SMS_MAX_TOUCHES,
  PHUGLEE_TAG,
  SOURCE_TAG,
  TAG_PERSON_DNC,
  TAG_SYSTEM_LANDLINE
} = require('./sms-policy');
const { fetchOverviewKpis, clearKpiCache } = require('./sms-kpis');
const { planSend, executeSend } = require('./sms-send');
const {
  listRuns,
  getAutoState,
  setAutoState,
  queueDepth
} = require('./sms-store');
const { processSyncQueue, enqueueLeadSync, syncLeadById } = require('./sms-sync');
const { TEMPLATES } = require('./sms-messages');
const { getBackfillProgress } = require('./sms-backfill-progress');
const { searchContactsByTag } = require('./sms-ghl');
const { retagPhugleeDncSplit, handleGhlSmsTagWebhook } = require('./sms-auto-tag');

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readJsonBody(req) {
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

function requireAdmin(req, res) {
  const user = readPhugleeUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (!isAdminUsername(user)) {
    sendJson(res, 403, { ok: false, error: 'Admin only', code: 'ADMIN_REQUIRED' });
    return null;
  }
  return user;
}

/**
 * @returns {Promise<boolean>} true if handled
 */
async function handle(req, res, pathname, url) {
  if (!pathname.startsWith('/api/admin/campaigns/sms')) return false;
  if (!requireAdmin(req, res)) return true;

  try {
    // Opportunistic queue drain (non-blocking failures)
    if (req.method === 'GET' && pathname === '/api/admin/campaigns/sms/overview') {
      processSyncQueue({ max: 10 }).catch(() => {});
      // Live GHL phuglee total for temp backfill tracker (first page only — cheap)
      let ghlPhugleeTotal = null;
      try {
        const snap = await searchContactsByTag(PHUGLEE_TAG, { pageLimit: 1, maxPages: 1 });
        ghlPhugleeTotal = snap.total != null ? Number(snap.total) : null;
      } catch (_) {
        ghlPhugleeTotal = null;
      }
      const backfillProgress = getBackfillProgress({ ghlPhugleeTotal });
      const kpis = await fetchOverviewKpis().catch((err) => ({
        error: err.message,
        outcomes: {},
        funnel: {}
      }));
      sendJson(res, 200, {
        ok: true,
        live: isSmsCampaignsLive(),
        autoEnv: isSmsCampaignsAuto(),
        policy: {
          spacingDays: 4,
          spacingMs: SMS_SPACING_MS,
          hardMinMs: SMS_HARD_MIN_MS,
          maxTouches: SMS_MAX_TOUCHES,
          phugleeTag: PHUGLEE_TAG,
          sourceTag: SOURCE_TAG,
          kpiScope: `Only contacts tagged "${PHUGLEE_TAG}" (Phuglee vault leads)`,
          exclusions: [
            'wrong number',
            'not interested',
            'dnc (person opt-out)',
            'dnd / system SMS DND (incl. landline text fail)',
            'interested',
            'follow up',
            'open DTS',
            'no phone',
            'sms_count >= 12',
            'last SMS within 4 days'
          ],
          dncSplit:
            'Person DNC = STOP/DNC language. System/landline = GHL SMS DND or undeliverable/landline tags (not a person asking out).',
          autoTags: {
            person: TAG_PERSON_DNC,
            system: TAG_SYSTEM_LANDLINE,
            note: 'Run “Tag DNC split in GHL” to write these on contacts. Webhook: POST /api/webhooks/ghl/sms-dnd-tags'
          }
        },
        autoState: getAutoState(),
        queueDepth: queueDepth(),
        kpis,
        backfillProgress,
        templateCount: TEMPLATES.length
      });
      return true;
    }

    // TEMP: lightweight progress poll without full KPI recompute
    if (req.method === 'GET' && pathname === '/api/admin/campaigns/sms/backfill-progress') {
      let ghlPhugleeTotal = null;
      try {
        const snap = await searchContactsByTag(PHUGLEE_TAG, { pageLimit: 1, maxPages: 1 });
        ghlPhugleeTotal = snap.total != null ? Number(snap.total) : null;
      } catch (_) {
        ghlPhugleeTotal = null;
      }
      sendJson(res, 200, {
        ok: true,
        backfillProgress: getBackfillProgress({ ghlPhugleeTotal })
      });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/campaigns/sms/eligible') {
      const touch = Number(url.searchParams.get('touch') || 0);
      const sample = Math.min(50, Number(url.searchParams.get('sample') || 10));
      const plan = await planSend({ touch, limit: sample });
      sendJson(res, 200, {
        ok: true,
        touch: plan.touch,
        nextTouch: plan.nextTouch,
        candidates: plan.candidates,
        excluded: plan.excluded,
        sample: plan.wouldSend.slice(0, sample)
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/campaigns/sms/dry-run') {
      const body = await readJsonBody(req);
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        return true;
      }
      const result = await executeSend({
        touch: body.touch ?? 0,
        limit: body.limit ?? 500,
        dryRun: true
      });
      sendJson(res, 200, { ok: true, ...result });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/admin/campaigns/sms/send') {
      if (!isSmsCampaignsLive()) {
        sendJson(res, 409, {
          ok: false,
          error: 'SMS campaigns not live',
          code: 'LIVE_DISABLED'
        });
        return true;
      }
      const body = await readJsonBody(req);
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        return true;
      }
      try {
        const result = await executeSend({
          touch: body.touch ?? 0,
          limit: body.limit ?? 500,
          dryRun: false,
          confirm: body.confirm || ''
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        const status = err.code === 'CONFIRM_REQUIRED' || err.code === 'LIVE_DISABLED' ? 409 : 500;
        sendJson(res, status, {
          ok: false,
          error: err.message,
          code: err.code || 'SEND_FAILED'
        });
      }
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/admin/campaigns/sms/runs') {
      const limit = Number(url.searchParams.get('limit') || 20);
      sendJson(res, 200, { ok: true, runs: listRuns({ limit }) });
      return true;
    }

    if (pathname === '/api/admin/campaigns/sms/auto') {
      if (req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          live: isSmsCampaignsLive(),
          autoEnv: isSmsCampaignsAuto(),
          state: getAutoState()
        });
        return true;
      }
      if (req.method === 'POST') {
        if (!isSmsCampaignsLive()) {
          sendJson(res, 409, {
            ok: false,
            error: 'Cannot enable auto while LIVE is false',
            code: 'LIVE_DISABLED'
          });
          return true;
        }
        const body = await readJsonBody(req);
        const enabled = !!(body && body.enabled);
        const state = setAutoState({ enabled });
        sendJson(res, 200, { ok: true, state });
        return true;
      }
    }

    if (req.method === 'POST' && pathname === '/api/admin/campaigns/sms/sync-lead') {
      const body = await readJsonBody(req);
      const leadId = body && body.leadId;
      if (!leadId) {
        sendJson(res, 400, { ok: false, error: 'leadId required' });
        return true;
      }
      enqueueLeadSync(leadId);
      const result = await syncLeadById(leadId);
      sendJson(res, result.ok ? 200 : 500, { ok: result.ok, ...result });
      return true;
    }

    // Bulk: write person:dnc / system:landline on phuglee contacts in GHL
    if (req.method === 'POST' && pathname === '/api/admin/campaigns/sms/auto-tag-dnc') {
      const body = await readJsonBody(req);
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        return true;
      }
      const dryRun = body.dryRun !== false; // default dry-run safe
      const maxContacts = Math.min(15000, Math.max(1, Number(body.maxContacts) || 3000));
      const delayMs = Math.min(2000, Math.max(100, Number(body.delayMs) || 350));
      const summary = await retagPhugleeDncSplit({ dryRun, maxContacts, delayMs });
      if (!dryRun) clearKpiCache();
      sendJson(res, 200, {
        ok: true,
        tags: { person: TAG_PERSON_DNC, system: TAG_SYSTEM_LANDLINE },
        summary
      });
      return true;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
    return true;
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err.message || String(err),
      code: err.code || 'CAMPAIGNS_SMS_ERROR'
    });
    return true;
  }
}

/**
 * Public webhook for GHL workflows (no admin cookie).
 * Optional shared secret: header x-phuglee-webhook-secret or ?secret=
 * Env: GHL_SMS_TAG_WEBHOOK_SECRET or CAMPAIGNS_WEBHOOK_SECRET
 */
async function handleWebhook(req, res, pathname, url) {
  if (pathname !== '/api/webhooks/ghl/sms-dnd-tags') return false;
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'POST only' });
    return true;
  }
  const secret = String(
    process.env.GHL_SMS_TAG_WEBHOOK_SECRET
    || process.env.CAMPAIGNS_WEBHOOK_SECRET
    || ''
  ).trim();
  if (secret) {
    const got = String(
      req.headers['x-phuglee-webhook-secret']
      || req.headers['x-webhook-secret']
      || url.searchParams.get('secret')
      || ''
    ).trim();
    if (got !== secret) {
      sendJson(res, 401, { ok: false, error: 'Invalid webhook secret', code: 'UNAUTHORIZED' });
      return true;
    }
  }
  try {
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
      return true;
    }
    const result = await handleGhlSmsTagWebhook(body);
    sendJson(res, result.ok === false ? 400 : 200, { ok: true, ...result });
    return true;
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err.message || String(err),
      code: 'WEBHOOK_ERROR'
    });
    return true;
  }
}

module.exports = {
  handle,
  handleWebhook
};
