'use strict';

const { readPhugleeUser } = require('../phuglee-user');
const { isAdminUsername } = require('../phuglee-roles');
const { isSmsCampaignsLive, isSmsCampaignsAuto } = require('./sms-flags');
const {
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SMS_MAX_TOUCHES,
  SOURCE_TAG
} = require('./sms-policy');
const { fetchOverviewKpis } = require('./sms-kpis');
const { planSend, executeSend } = require('./sms-send');
const {
  listRuns,
  getAutoState,
  setAutoState,
  queueDepth
} = require('./sms-store');
const { processSyncQueue, enqueueLeadSync, syncLeadById } = require('./sms-sync');
const { TEMPLATES } = require('./sms-messages');

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
          sourceTag: SOURCE_TAG,
          exclusions: [
            'wrong number',
            'not interested',
            'dnc',
            'dnd',
            'interested',
            'follow up',
            'open DTS',
            'system SMS DND',
            'no phone',
            'sms_count >= 12',
            'last SMS within 4 days'
          ]
        },
        autoState: getAutoState(),
        queueDepth: queueDepth(),
        kpis,
        templateCount: TEMPLATES.length
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

module.exports = {
  handle
};
