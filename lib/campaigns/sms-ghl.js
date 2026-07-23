'use strict';

/**
 * GHL helpers for Campaigns SMS. Injectable for tests.
 */

const ghlDefault = require('../leads-platform/ghl-client');
const {
  SOURCE_TAG,
  classTagForLeadType,
  resolveFromNumber
} = require('./sms-policy');
const { contactHasSuppressTag } = require('./sms-tags');

function deps(overrides = {}) {
  return {
    ghl: overrides.ghl || ghlDefault,
    ...overrides
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchContactsByTag(tag, { pageLimit = 100, searchAfter = null, maxPages = 40 } = {}, d = {}) {
  const { ghl } = deps(d);
  const locationId = ghl.ghlConfig().locationId;
  const all = [];
  let after = searchAfter;
  let pages = 0;
  let total = null;
  while (pages < maxPages) {
    pages += 1;
    const body = {
      locationId,
      pageLimit,
      page: 1,
      filters: [{ field: 'tags', operator: 'contains', value: tag }]
    };
    if (after) body.searchAfter = after;
    let data;
    try {
      data = await ghl.api('POST', '/contacts/search', body);
    } catch (err) {
      if (err.status === 429) {
        await sleep(2000 * pages);
        continue;
      }
      throw err;
    }
    if (total == null) total = Number(data.total) || 0;
    const contacts = data.contacts || [];
    all.push(...contacts);
    if (!contacts.length || all.length >= total) break;
    after = contacts[contacts.length - 1]?.searchAfter;
    if (!after) break;
    await sleep(200);
  }
  return { contacts: all, total: total ?? all.length };
}

async function contactHasOpenDts(contactId, d = {}) {
  const { ghl } = deps(d);
  if (!contactId) return false;
  try {
    const pipe = await ghl.findDtsPipeline();
    const { opportunities } = await ghl.searchOpportunities({
      contactId: String(contactId),
      status: 'open',
      pipelineId: pipe.id,
      limit: 5
    });
    return Array.isArray(opportunities) && opportunities.length > 0;
  } catch (_) {
    return false;
  }
}

function isSmsDndContact(contact) {
  if (!contact) return false;
  if (contact.dnd === true) return true;
  const settings = contact.dndSettings || contact.dnd_settings || {};
  if (settings.SMS === true || settings.sms === true) return true;
  if (settings.SMS && String(settings.SMS.status || '').toLowerCase() === 'active') return true;
  return false;
}

function readSmsCount(contact) {
  if (!contact) return 0;
  const map = ghlDefault.customFieldMap
    ? ghlDefault.customFieldMap(contact)
    : {};
  // Prefer named fields if id map unknown — scan customFields by name-like keys
  for (const cf of contact.customFields || []) {
    const key = String(cf.key || cf.fieldKey || cf.name || cf.id || '').toLowerCase();
    if (key.includes('sms_count') || key.includes('smscount')) {
      const n = Number(cf.value);
      return Number.isFinite(n) ? n : 0;
    }
  }
  // Tag fallback: sms:3
  for (const t of contact.tags || []) {
    const m = String(t).match(/^sms:(\d+)$/i);
    if (m) return Number(m[1]);
  }
  // Historical: 1st text sent
  const tags = (contact.tags || []).map((t) => String(t).toLowerCase());
  if (tags.some((t) => t.includes('1st text sent') || t.includes('first text sent'))) {
    return 1;
  }
  if (tags.some((t) => t.includes('2nd text sent') || t.includes('second text sent'))) {
    return 2;
  }
  return 0;
}

function readLastSmsAt(contact) {
  for (const cf of contact.customFields || []) {
    const key = String(cf.key || cf.fieldKey || cf.name || cf.id || '').toLowerCase();
    if (key.includes('last_sms_at') || key.includes('lastsms')) {
      return cf.value || null;
    }
  }
  return null;
}

async function writeSmsState(contactId, { smsCount, lastSmsAt, campaignId } = {}, d = {}) {
  const { ghl } = deps(d);
  const tags = [];
  if (smsCount != null) tags.push(`sms:${smsCount}`);
  if (campaignId) tags.push(String(campaignId));
  if (tags.length) {
    await ghl.addContactTags(contactId, tags);
  }
  // Best-effort note for audit trail when custom field IDs unknown
  if (lastSmsAt || campaignId) {
    const note = [
      'Phuglee SMS state',
      smsCount != null ? `sms_count=${smsCount}` : null,
      lastSmsAt ? `last_sms_at=${lastSmsAt}` : null,
      campaignId ? `campaign=${campaignId}` : null
    ].filter(Boolean).join(' | ');
    try {
      await ghl.createContactNote(contactId, note);
    } catch (_) { /* optional */ }
  }
}

function splitOwnerName(ownerName) {
  const parts = String(ownerName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: undefined, lastName: undefined };
  if (/\b(llc|inc|corp|trust|bank|estate|properties|holdings)\b/i.test(ownerName)) {
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
  }
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined
  };
}

async function upsertVaultLeadContact(lead, d = {}) {
  const { ghl } = deps(d);
  const phone = (lead.phones && lead.phones[0]) || lead.firstPhone || lead.phone || '';
  const email = String(lead.email || '').trim();
  const e164 = ghl.toE164Us(phone);
  if (!e164 && !email) {
    const err = new Error('phone or email required');
    err.code = 'NO_CONTACT_POINT';
    throw err;
  }

  let existing = null;
  if (e164) {
    const list = await ghl.searchContacts(ghl.digitsOnly(phone).slice(-10), { limit: 10 }).catch(() => []);
    existing = (list || []).find((c) => {
      const cd = ghl.digitsOnly(c.phone || '');
      const want = ghl.digitsOnly(e164);
      return cd && want && (cd === want || cd.endsWith(want.slice(-10)) || want.endsWith(cd.slice(-10)));
    }) || null;
  }
  if (!existing && email) {
    const list = await ghl.searchContacts(email, { limit: 5 }).catch(() => []);
    existing = (list || []).find(
      (c) => String(c.email || '').toLowerCase() === email.toLowerCase()
    ) || null;
  }

  const { firstName, lastName } = splitOwnerName(lead.ownerName);
  const classTag = classTagForLeadType(lead.leadType);
  const tags = [
    SOURCE_TAG,
    'src:phuglee',
    classTag,
    'vault:active'
  ].filter(Boolean);

  if (existing && existing.id) {
    const patch = {
      address1: lead.address || undefined,
      city: lead.city || undefined,
      state: lead.state || undefined,
      postalCode: lead.zip || undefined
    };
    if (e164 && !existing.phone) patch.phone = e164;
    if (email && !existing.email) patch.email = email;
    try {
      await ghl.api('PUT', `/contacts/${existing.id}`, patch);
    } catch (_) { /* best effort */ }
    try {
      await ghl.addContactTags(existing.id, tags);
    } catch (_) { /* best effort */ }
    return { contactId: existing.id, created: false, reused: true, tags };
  }

  const locationId = ghl.ghlConfig().locationId;
  const payload = {
    locationId,
    phone: e164 || undefined,
    email: email || undefined,
    firstName,
    lastName,
    name: lead.ownerName || undefined,
    address1: lead.address || undefined,
    city: lead.city || undefined,
    state: lead.state || undefined,
    postalCode: lead.zip || undefined,
    source: 'phuglee-vault',
    tags
  };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  try {
    const created = await ghl.api('POST', '/contacts/', payload);
    const contact = created.contact || created;
    const id = contact.id || contact.contactId;
    if (id) {
      try {
        await ghl.addContactTags(id, tags);
      } catch (_) { /* already on create */ }
    }
    return { contactId: id, created: true, reused: false, tags };
  } catch (err) {
    const metaId = err?.body?.meta?.contactId || err?.body?.contactId;
    if (metaId) {
      try {
        await ghl.addContactTags(metaId, tags);
      } catch (_) { /* ignore */ }
      return { contactId: String(metaId), created: false, reused: true, tags };
    }
    throw err;
  }
}

module.exports = {
  searchContactsByTag,
  contactHasOpenDts,
  isSmsDndContact,
  readSmsCount,
  readLastSmsAt,
  writeSmsState,
  upsertVaultLeadContact,
  resolveFromNumber,
  contactHasSuppressTag,
  SOURCE_TAG
};
