'use strict';

/**
 * CRM auto-tagger: person:dnc vs system:landline
 *
 * - Bulk pass over phuglee contacts (admin button)
 * - Webhook events from GHL (inbound STOP, failed SMS)
 */

const {
  TAG_PERSON_DNC,
  TAG_SYSTEM_LANDLINE
} = require('./sms-policy');
const { classifyDncDnd, normalizeTag } = require('./sms-tags');
const {
  searchContactsByTag,
  isSmsDndContact
} = require('./sms-ghl');
const { PHUGLEE_TAG } = require('./sms-policy');
const ghlDefault = require('../leads-platform/ghl-client');
const { clearKpiCache } = require('./sms-kpis');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function contactIdOf(c) {
  return String(c?.id || c?.contactId || '').trim();
}

function tagsOf(c) {
  return Array.isArray(c?.tags) ? c.tags : [];
}

function hasExactTag(tags, want) {
  const w = normalizeTag(want);
  return (tags || []).some((t) => normalizeTag(t) === w || String(t || '').trim() === want);
}

/**
 * Desired tags for a contact from current signals.
 * @returns {{ add: string[], kind: 'person'|'system'|null }}
 */
function desiredTagsForContact(contact) {
  const tags = tagsOf(contact);
  const systemSmsDnd = isSmsDndContact(contact);
  const cls = classifyDncDnd({ tags, systemSmsDnd });
  if (cls.personOptOut) {
    return { add: [TAG_PERSON_DNC], kind: 'person' };
  }
  if (cls.systemSmsBlock) {
    return { add: [TAG_SYSTEM_LANDLINE], kind: 'system' };
  }
  return { add: [], kind: null };
}

/**
 * Apply missing person:dnc / system:landline tags on one contact.
 */
async function applyTagsToContact(contact, { dryRun = false, ghl = ghlDefault } = {}) {
  const id = contactIdOf(contact);
  if (!id) return { ok: false, skipped: true, reason: 'no id' };
  const tags = tagsOf(contact);
  const desired = desiredTagsForContact(contact);
  if (!desired.add.length) {
    return { ok: true, skipped: true, reason: 'no classify', contactId: id, kind: null };
  }
  const missing = desired.add.filter((t) => !hasExactTag(tags, t));
  if (!missing.length) {
    return {
      ok: true,
      skipped: true,
      reason: 'already tagged',
      contactId: id,
      kind: desired.kind,
      tags: desired.add
    };
  }
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      contactId: id,
      kind: desired.kind,
      wouldAdd: missing
    };
  }
  await ghl.addContactTags(id, missing);
  return {
    ok: true,
    contactId: id,
    kind: desired.kind,
    added: missing
  };
}

/**
 * Scan phuglee contacts and write canonical tags into GHL.
 */
async function retagPhugleeDncSplit({
  dryRun = true,
  maxContacts = 5000,
  delayMs = 350,
  ghl = ghlDefault
} = {}) {
  const { contacts, total } = await searchContactsByTag(
    PHUGLEE_TAG,
    { pageLimit: 100, maxPages: 100 },
    { ghl }
  );
  const list = (contacts || []).slice(0, Math.max(1, Math.min(20000, maxContacts)));
  const summary = {
    dryRun: !!dryRun,
    scanned: list.length,
    totalReported: total != null ? total : list.length,
    personTagged: 0,
    systemTagged: 0,
    alreadyOk: 0,
    skipped: 0,
    failed: 0,
    samples: { person: [], system: [] }
  };

  for (const c of list) {
    try {
      const r = await applyTagsToContact(c, { dryRun, ghl });
      if (r.failed || r.ok === false) {
        summary.failed += 1;
        continue;
      }
      if (r.skipped && r.reason === 'already tagged') {
        summary.alreadyOk += 1;
        if (r.kind === 'person') summary.personTagged += 1;
        if (r.kind === 'system') summary.systemTagged += 1;
        continue;
      }
      if (r.skipped) {
        summary.skipped += 1;
        continue;
      }
      if (r.kind === 'person') {
        summary.personTagged += 1;
        if (summary.samples.person.length < 5) {
          summary.samples.person.push({
            contactId: r.contactId,
            tags: r.added || r.wouldAdd
          });
        }
      }
      if (r.kind === 'system') {
        summary.systemTagged += 1;
        if (summary.samples.system.length < 5) {
          summary.samples.system.push({
            contactId: r.contactId,
            tags: r.added || r.wouldAdd
          });
        }
      }
      if (!dryRun) await sleep(delayMs);
    } catch (err) {
      summary.failed += 1;
      if (/429/.test(err.message || '')) await sleep(Math.min(15000, delayMs * 8));
    }
  }

  if (!dryRun) clearKpiCache();
  return summary;
}

function extractContactId(body) {
  if (!body || typeof body !== 'object') return '';
  return String(
    body.contactId
    || body.contact_id
    || body.contact?.id
    || body.contact?.contactId
    || body.id
    || ''
  ).trim();
}

function extractMessageText(body) {
  if (!body || typeof body !== 'object') return '';
  return String(
    body.body
    || body.message
    || body.text
    || body.msg
    || body.inboundMessage
    || body.conversation?.lastMessageBody
    || ''
  ).trim();
}

function extractType(body) {
  return String(
    body.type || body.event || body.eventType || body.direction || body.status || ''
  ).toLowerCase();
}

/**
 * Inbound STOP / opt-out language in message body.
 */
function messageLooksLikePersonOptOut(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return false;
  if (t === 'stop' || t === 'stopall' || t === 'unsubscribe' || t === 'cancel' || t === 'end' || t === 'quit') {
    return true;
  }
  if (/\bstop\b/.test(t) && t.length < 40) return true;
  if (t.includes('do not text') || t.includes("don't text") || t.includes('dont text')) return true;
  if (t.includes('do not contact') || t.includes('remove me') || t.includes('take me off')) return true;
  if (t.includes('unsubscribe') || t.includes('opt out')) return true;
  return false;
}

/**
 * Delivery failure / landline signals from webhook payload.
 */
function payloadLooksLikeSystemBlock(body) {
  const type = extractType(body);
  const status = String(body.status || body.messageStatus || body.deliveryStatus || '').toLowerCase();
  const err = String(body.error || body.errorMessage || body.failReason || body.reason || '').toLowerCase();
  const blob = `${type} ${status} ${err} ${extractMessageText(body)}`.toLowerCase();
  if (status.includes('fail') || status.includes('undeliver') || status === 'failed') return true;
  if (err.includes('landline') || err.includes('undeliver') || err.includes('not a mobile')) return true;
  if (blob.includes('landline') || blob.includes('cannot receive sms')) return true;
  if (type.includes('outbound') && (status.includes('fail') || status.includes('reject'))) return true;
  return false;
}

/**
 * Handle GHL workflow / webhook payload — tag contact in place.
 */
async function handleGhlSmsTagWebhook(body, { ghl = ghlDefault } = {}) {
  const contactId = extractContactId(body);
  if (!contactId) {
    return { ok: false, error: 'contactId required', code: 'NO_CONTACT' };
  }

  const msg = extractMessageText(body);
  const personMsg = messageLooksLikePersonOptOut(msg);
  const systemFail = payloadLooksLikeSystemBlock(body);
  const explicit = String(body.tagKind || body.kind || body.dncKind || '').toLowerCase();

  let tag = null;
  let kind = null;
  if (explicit === 'person' || explicit === 'person:dnc' || personMsg) {
    tag = TAG_PERSON_DNC;
    kind = 'person';
  } else if (
    explicit === 'system'
    || explicit === 'landline'
    || explicit === 'system:landline'
    || systemFail
  ) {
    tag = TAG_SYSTEM_LANDLINE;
    kind = 'system';
  } else if (body.dndSms === true || body.smsDnd === true || body.dnd === true) {
    // DND without STOP text → treat as system channel block
    tag = TAG_SYSTEM_LANDLINE;
    kind = 'system';
  }

  if (!tag) {
    return {
      ok: true,
      skipped: true,
      reason: 'no person/system signal in payload',
      contactId
    };
  }

  await ghl.addContactTags(contactId, [tag]);
  clearKpiCache();
  return { ok: true, contactId, kind, added: [tag] };
}

module.exports = {
  TAG_PERSON_DNC,
  TAG_SYSTEM_LANDLINE,
  desiredTagsForContact,
  applyTagsToContact,
  retagPhugleeDncSplit,
  handleGhlSmsTagWebhook,
  messageLooksLikePersonOptOut,
  payloadLooksLikeSystemBlock
};
