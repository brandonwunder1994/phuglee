'use strict';

/**
 * Photographer scheduling, public upload tokens, intro SMS, Done alerts.
 */

const crypto = require('crypto');
const ghl = require('./ghl-client');
const teamNotify = require('./team-notify');
const { normalizeTeamUser, getTeamMember } = require('./team-contacts');

function slugPart(v) {
  return String(v == null ? '' : v).trim();
}

function bookerDisplayName(username) {
  const key = normalizeTeamUser(username);
  if (key === 'brad') return 'Brad';
  if (key === 'admin') return 'Brandon';
  return getTeamMember(key)?.name?.split(/\s+/)[0] || 'Phuglee';
}

function publicBaseUrl() {
  return teamNotify.publicBaseUrl();
}

function uploadPageUrl(token) {
  return `${publicBaseUrl()}/photo-upload?token=${encodeURIComponent(token)}`;
}

function mintUploadToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizePhotographerSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const token = slugPart(raw.uploadToken);
  if (!token && !raw.scheduled) return null;
  return {
    scheduled: Boolean(raw.scheduled),
    date: slugPart(raw.date),
    time: slugPart(raw.time),
    photographerName: slugPart(raw.photographerName),
    photographerEmail: slugPart(raw.photographerEmail).toLowerCase(),
    photographerPhone: slugPart(raw.photographerPhone),
    ghlContactId: slugPart(raw.ghlContactId) || null,
    conversationId: slugPart(raw.conversationId) || null,
    bookedBy: slugPart(raw.bookedBy) || null,
    bookedByName: slugPart(raw.bookedByName) || null,
    bookedAt: slugPart(raw.bookedAt) || null,
    uploadToken: token || null,
    uploadUrl: slugPart(raw.uploadUrl) || (token ? uploadPageUrl(token) : ''),
    introSmsSentAt: slugPart(raw.introSmsSentAt) || null,
    doneAt: slugPart(raw.doneAt) || null,
    doneAlertSentAt: slugPart(raw.doneAlertSentAt) || null,
    tokenRevokedAt: slugPart(raw.tokenRevokedAt) || null
  };
}

function firstName(full) {
  const p = String(full || '').trim().split(/\s+/).filter(Boolean);
  return p[0] || 'there';
}

function buildIntroSms({ bookerName, photographerName, address, uploadUrl }) {
  const first = firstName(photographerName);
  const addr = slugPart(address) || 'the property';
  const who = bookerName || 'Phuglee';
  return (
    `Hey ${first}, this is ${who} — thanks for helping with photos at ${addr}.\n\n` +
    `Upload everything here (no login): ${uploadUrl}\n\n` +
    `When you're finished, tap “I'm Done” on that page and we'll get a heads-up.\n` +
    `This is my direct line if you need anything.`
  );
}

async function resolveFromNumber() {
  try {
    const nums = await ghl.listLocationPhoneNumbers();
    const first = nums[0];
    const raw = first?.phoneNumber || first?.number || first?.phone || null;
    return raw ? (ghl.toE164Us(raw) || String(raw)) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Schedule photographer: persist fields, GHL contact+tag+note, mint token, intro SMS.
 */
async function schedulePhotographer(dealId, input = {}, bookedByUser) {
  const contracts = require('./contracts');
  const deal = contracts.getDeal(dealId);
  if (!deal) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const name = slugPart(input.photographerName);
  const email = slugPart(input.photographerEmail).toLowerCase();
  const phone = slugPart(input.photographerPhone);
  const date = slugPart(input.date);
  const time = slugPart(input.time);
  if (!name || !phone) {
    const err = new Error('Photographer name and phone required');
    err.code = 'MISSING_FIELDS';
    throw err;
  }
  if (!date || !time) {
    const err = new Error('Date and time required');
    err.code = 'MISSING_FIELDS';
    throw err;
  }

  const bookedBy = normalizeTeamUser(bookedByUser) || 'admin';
  const bookedByName = bookerDisplayName(bookedBy);
  const token = mintUploadToken();
  const uploadUrl = uploadPageUrl(token);
  const address = [deal.address, deal.city, deal.state].filter(Boolean).join(', ');

  let ghlContactId = null;
  let introSmsSentAt = null;
  let ghlWarning = null;

  if (ghl.isConfigured()) {
    try {
      const contact = await ghl.ensureContactByEmail({
        email: email || undefined,
        phone,
        name
      });
      ghlContactId = contact?.id || contact?.contactId || null;
      if (ghlContactId) {
        await ghl.addContactTags(ghlContactId, ['photographer']).catch((err) => {
          ghlWarning = `Tag failed: ${err.message}`;
        });
        const noteBody = [
          `Photographer scheduled for property: ${address || deal.dealId}`,
          `Shoot: ${date} ${time}`,
          `Booked by: ${bookedByName}`,
          `Upload: ${uploadUrl}`
        ].join('\n');
        await ghl.createContactNote(ghlContactId, noteBody).catch((err) => {
          ghlWarning = [ghlWarning, `Note failed: ${err.message}`].filter(Boolean).join('; ');
        });

        const fromNumber = await resolveFromNumber();
        const sms = buildIntroSms({
          bookerName: bookedByName,
          photographerName: name,
          address: deal.address || address,
          uploadUrl
        });
        await ghl.sendSms({
          contactId: ghlContactId,
          message: sms,
          fromNumber: fromNumber || undefined,
          toNumber: ghl.toE164Us(phone) || phone
        });
        introSmsSentAt = new Date().toISOString();
      }
    } catch (err) {
      ghlWarning = err.message;
      console.warn('[photographer] GHL schedule side-effects failed', err.message);
    }
  } else {
    ghlWarning = 'GHL not configured — schedule saved, SMS skipped';
  }

  const photographerSchedule = normalizePhotographerSchedule({
    scheduled: true,
    date,
    time,
    photographerName: name,
    photographerEmail: email,
    photographerPhone: phone,
    ghlContactId,
    bookedBy,
    bookedByName,
    bookedAt: new Date().toISOString(),
    uploadToken: token,
    uploadUrl,
    introSmsSentAt
  });

  const saved = contracts.patchDeal(dealId, { photographerSchedule });
  return {
    deal: contracts.enrichDealForDisplay(saved),
    photographerSchedule,
    uploadUrl,
    introSmsSentAt,
    ghlWarning
  };
}

function findDealByUploadToken(token) {
  const contracts = require('./contracts');
  const t = slugPart(token);
  if (!t || t.length < 16) return null;
  const deals = contracts.listDeals();
  for (const d of deals) {
    const sched = normalizePhotographerSchedule(d.photographerSchedule);
    if (sched?.uploadToken === t && !sched.tokenRevokedAt) {
      return { deal: d, schedule: sched };
    }
  }
  return null;
}

function publicUploadMeta(token) {
  const found = findDealByUploadToken(token);
  if (!found) {
    const err = new Error('Upload link invalid or expired');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  const { deal, schedule } = found;
  return {
    ok: true,
    address: deal.address || '',
    city: deal.city || '',
    state: deal.state || '',
    photographerName: schedule.photographerName,
    shootDate: schedule.date,
    shootTime: schedule.time,
    done: Boolean(schedule.doneAt),
    mediaCount: Array.isArray(deal.sellerMedia) ? deal.sellerMedia.filter((m) => m.source === 'photographer' || m.uploadSource === 'photographer').length : 0,
    checklist: [
      'Kitchen (wide + cabinets/counters)',
      'Each bathroom',
      'Living areas + bedrooms',
      'Mechanical labels (HVAC, water heater, panel)',
      'All four exterior sides + roof line',
      'Yard / fence / drainage'
    ]
  };
}

async function markPhotographerDone(token) {
  const contracts = require('./contracts');
  const found = findDealByUploadToken(token);
  if (!found) {
    const err = new Error('Upload link invalid or expired');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  const { deal, schedule } = found;
  if (schedule.doneAlertSentAt) {
    return {
      ok: true,
      already: true,
      dealId: deal.dealId,
      doneAt: schedule.doneAt
    };
  }
  const doneAt = new Date().toISOString();
  const next = {
    ...schedule,
    doneAt,
    doneAlertSentAt: doneAt
  };
  const saved = contracts.patchDeal(deal.dealId, {
    photographerSchedule: next,
    photosAvailable: 'yes'
  });

  await teamNotify.alertPhotographerDone({
    deal: saved,
    photographerName: schedule.photographerName,
    mediaCount: (saved.sellerMedia || []).length
  }).catch((err) => console.warn('[photographer] done alert failed', err.message));

  // Kick AI label + scan
  try {
    const vision = require('./media-vision');
    vision.enqueueLabelDealMedia(deal.dealId, { runScan: true });
  } catch (_) { /* optional */ }

  return {
    ok: true,
    already: false,
    dealId: deal.dealId,
    doneAt
  };
}

async function regenerateUploadToken(dealId) {
  const contracts = require('./contracts');
  const deal = contracts.getDeal(dealId);
  if (!deal?.photographerSchedule) {
    const err = new Error('No photographer schedule');
    err.code = 'NOT_SCHEDULED';
    throw err;
  }
  const token = mintUploadToken();
  const photographerSchedule = normalizePhotographerSchedule({
    ...deal.photographerSchedule,
    uploadToken: token,
    uploadUrl: uploadPageUrl(token),
    tokenRevokedAt: null,
    doneAt: null,
    doneAlertSentAt: null
  });
  const saved = contracts.patchDeal(dealId, { photographerSchedule });
  return {
    deal: contracts.enrichDealForDisplay(saved),
    uploadUrl: photographerSchedule.uploadUrl,
    uploadToken: token
  };
}

module.exports = {
  bookerDisplayName,
  buildIntroSms,
  normalizePhotographerSchedule,
  schedulePhotographer,
  findDealByUploadToken,
  publicUploadMeta,
  markPhotographerDone,
  regenerateUploadToken,
  uploadPageUrl,
  mintUploadToken
};
