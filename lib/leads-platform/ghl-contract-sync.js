'use strict';

/**
 * Pull DTS pipeline opportunities from GHL into Phuglee deals
 * (sales + dispo stages) and hide matching Vault leads.
 */

const ghl = require('./ghl-client');
const { getLead } = require('./store');
const { resolveDealPropertyAddress } = require('./deal-property-address');
const {
  upsertDeal,
  findDealByGhlOpportunityId,
  resolveLeadIdFromAddress,
  applyCatalogStatusForDeal,
  normalizeMoney,
  mergeGhlDocumentsOntoDeal,
  formatClosingSlash,
  pickDeskLocalFields
} = require('./contracts');

const US_STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
};

/**
 * Live GHL DTS stage names (💰 DTS Pipeline) → Phuglee stages.
 * First matching rule wins. Dead/lost stages return null (skipped).
 *
 * Sales:
 *   🧑‍🍳 Interested | Nurturing     → interested
 *   🔥 Warm | Engaged              → warm
 *   🗣️ Verbal Offer Made           → verbal_offer
 *   📨 Sent Contract to Seller     → contract_sent
 * Dispo:
 *   ✅ Seller Signed …             → under_contract  (contract signed)
 *   🔎 Escrow Opened …             → under_contract
 *   📮 AOC Sent / ✅ AOC Signed /
 *   🏁 In Line to Close            → buyer_found (Buyer Submitted EMD)
 *   🥳 Funded                      → funded
 *   Terminated                     → terminated (fell out of contract)
 */
const STAGE_RULES = [
  { re: /funded/i, stage: 'funded' },
  { re: /\bterminated\b/i, stage: 'terminated' },
  { re: /in line to close/i, stage: 'buyer_found' },
  { re: /aoc signed/i, stage: 'buyer_found' },
  { re: /aoc sent/i, stage: 'buyer_found' },
  // Contract signed = seller signed PSA → Under Contract in Phuglee
  { re: /seller\s*signed|contract\s*signed/i, stage: 'under_contract' },
  { re: /escrow opened/i, stage: 'under_contract' },
  // Sent-to-seller only (must stay after "contract signed")
  { re: /sent\s+contract|contract\s+sent/i, stage: 'contract_sent' },
  { re: /verbal\s*offer|verbal/i, stage: 'verbal_offer' },
  { re: /\bwarm\b/i, stage: 'warm' },
  { re: /interested/i, stage: 'interested' }
];

/** Skip / lost early stages — do not pull onto Phuglee boards */
const DEAD_STAGE_RE =
  /not interested|offer rejected|cash won.?t work|follow\s*up/i;

/** Stages that belong on the Contract Tracker (dispo) board */
const CONTRACT_STAGE_RE =
  /seller\s*signed|contract\s*signed|escrow opened|aoc sent|aoc signed|in line to close|funded|\bterminated\b/i;

/** Any mapped DTS stage (sales + dispo) for full pipeline sync */
const PIPELINE_STAGE_RE =
  /interested|\bwarm\b|verbal|sent\s+contract|contract\s+sent|seller\s*signed|contract\s*signed|escrow opened|aoc sent|aoc signed|in line to close|funded|\bterminated\b/i;

function mapGhlStageName(stageName) {
  const name = String(stageName || '');
  if (DEAD_STAGE_RE.test(name)) return null;
  for (const rule of STAGE_RULES) {
    if (rule.re.test(name)) return rule.stage;
  }
  return null;
}

function isContractBoardStage(stageName) {
  return CONTRACT_STAGE_RE.test(String(stageName || ''));
}

function isPipelineBoardStage(stageName) {
  if (PIPELINE_STAGE_RE.test(String(stageName || ''))) return true;
  return mapGhlStageName(stageName) != null;
}

function stageIdToName(pipeline, stageId) {
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const hit = stages.find((s) => s.id === stageId);
  return hit?.name || '';
}

function parseAddressFromOppName(name) {
  // Common: "123 Main St — City ST" | "123 Main St, City, ST" | "123 Main St Ohio"
  const text = String(name || '').trim();
  if (!text) return { address: '', city: '', state: '', zip: '' };
  const dash = text.split(/\s+[—–-]\s+/);
  if (dash.length >= 2) {
    const cityState = dash[dash.length - 1].trim();
    const m = cityState.match(/^(.+?)\s+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/);
    if (m) {
      return {
        address: dash[0].trim(),
        city: m[1].trim(),
        state: m[2],
        zip: m[3] || ''
      };
    }
    return { address: dash[0].trim(), city: cityState, state: '', zip: '' };
  }
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1];
    const st = (stateZip.match(/\b([A-Z]{2})\b/) || [])[1] || '';
    const zip = (stateZip.match(/\b(\d{5}(?:-\d{4})?)\b/) || [])[1] || '';
    return { address: parts[0], city: parts[1], state: st, zip };
  }
  // Trailing full state name: "910 Delaware Avenue Ohio"
  const stateNameMatch = text.match(/^(.*\S)\s+([A-Za-z][A-Za-z ]{2,})\s*$/);
  if (stateNameMatch) {
    const st = US_STATE_NAMES[stateNameMatch[2].trim().toLowerCase()];
    if (st) {
      return { address: stateNameMatch[1].trim(), city: '', state: st, zip: '' };
    }
  }
  return { address: text, city: '', state: '', zip: '' };
}

/**
 * Pick one coherent address block — never mix street from opp name with
 * city/state/zip from a different contact property.
 */
function pickCoherentAddress(fromContact, fromName, existing) {
  const contact = {
    address: String(fromContact.address1 || '').trim(),
    city: String(fromContact.city || '').trim(),
    state: String(fromContact.state || '').trim().toUpperCase().slice(0, 2),
    zip: String(fromContact.zip || '').trim()
  };
  const named = {
    address: String(fromName.address || '').trim(),
    city: String(fromName.city || '').trim(),
    state: String(fromName.state || '').trim().toUpperCase().slice(0, 2),
    zip: String(fromName.zip || '').trim()
  };
  const prior = {
    address: String(existing?.address || '').trim(),
    city: String(existing?.city || '').trim(),
    state: String(existing?.state || '').trim().toUpperCase().slice(0, 2),
    zip: String(existing?.zip || '').trim()
  };

  const complete = (p) => Boolean(p.address && p.city && p.state);

  if (complete(contact)) return contact;
  if (complete(named)) {
    return { ...named, zip: named.zip || contact.zip || prior.zip || '' };
  }
  // Contact street + contact city only (same source). Do not attach named street to contact city.
  if (contact.address && contact.city && contact.state) return contact;
  if (contact.address && (contact.city || contact.state)) {
    return {
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip
    };
  }
  if (named.address) {
    return {
      address: named.address,
      city: named.city,
      state: named.state,
      zip: named.zip || contact.zip || ''
    };
  }
  if (complete(prior)) return prior;
  return {
    address: contact.address || named.address || prior.address || '',
    city: contact.city || named.city || prior.city || '',
    state: contact.state || named.state || prior.state || '',
    zip: contact.zip || named.zip || prior.zip || ''
  };
}

async function fetchAllDtsPipelineOpps(pipeline) {
  const byId = new Map();
  // Search open opps on pipeline, then filter by stage client-side
  // (stage-specific search can miss depending on GHL API quirks)
  let page = 1;
  let guard = 0;
  while (guard < 40) {
    guard += 1;
    const { opportunities } = await ghl.searchOpportunities({
      pipelineId: pipeline.id,
      status: 'open',
      limit: 100,
      page
    });
    if (!opportunities.length) break;
    for (const opp of opportunities) {
      if (!opp?.id) continue;
      const stageName = stageIdToName(pipeline, opp.pipelineStageId) || opp.pipelineStageName || '';
      if (!isPipelineBoardStage(stageName)) continue;
      if (!mapGhlStageName(stageName)) {
        console.warn('[ghl-sync] unmapped DTS stage skipped:', stageName);
        continue;
      }
      byId.set(opp.id, { ...opp, _stageName: stageName });
    }
    if (opportunities.length < 100) break;
    page += 1;
  }

  // Also pull won/funded if they linger as won status
  page = 1;
  guard = 0;
  while (guard < 20) {
    guard += 1;
    let opportunities = [];
    try {
      ({ opportunities } = await ghl.searchOpportunities({
        pipelineId: pipeline.id,
        status: 'won',
        limit: 100,
        page
      }));
    } catch (_) {
      break;
    }
    if (!opportunities.length) break;
    for (const opp of opportunities) {
      if (!opp?.id) continue;
      const stageName = stageIdToName(pipeline, opp.pipelineStageId) || opp.pipelineStageName || 'Funded';
      if (!isContractBoardStage(stageName) && !/funded/i.test(stageName)) continue;
      byId.set(opp.id, { ...opp, _stageName: stageName || 'Funded' });
    }
    if (opportunities.length < 100) break;
    page += 1;
  }

  // Lost / abandoned — Terminated and similar fallen-out deals
  page = 1;
  guard = 0;
  while (guard < 20) {
    guard += 1;
    let opportunities = [];
    try {
      ({ opportunities } = await ghl.searchOpportunities({
        pipelineId: pipeline.id,
        status: 'lost',
        limit: 100,
        page
      }));
    } catch (_) {
      break;
    }
    if (!opportunities.length) break;
    for (const opp of opportunities) {
      if (!opp?.id) continue;
      const stageName = stageIdToName(pipeline, opp.pipelineStageId)
        || opp.pipelineStageName
        || 'Terminated';
      const mapped = mapGhlStageName(stageName) || (/terminated/i.test(stageName) ? 'terminated' : null);
      if (mapped !== 'terminated') continue;
      byId.set(opp.id, { ...opp, _stageName: stageName || 'Terminated' });
    }
    if (opportunities.length < 100) break;
    page += 1;
  }

  return [...byId.values()];
}

/** @deprecated alias — prefer fetchAllDtsPipelineOpps */
async function fetchAllDtsContractOpps(pipeline) {
  return fetchAllDtsPipelineOpps(pipeline);
}

async function upsertDealFromOpportunity(opp, pipeline, contactSummary) {
  const stageName = opp._stageName || stageIdToName(pipeline, opp.pipelineStageId) || '';
  const mapped = mapGhlStageName(stageName);
  if (!mapped) {
    const err = new Error(`Unmapped GHL stage: ${stageName || '(empty)'}`);
    err.code = 'GHL_STAGE_UNMAPPED';
    throw err;
  }
  const stage = mapped;

  const fromContact = contactSummary || {};
  const fromName = parseAddressFromOppName(opp.name);
  const existing = findDealByGhlOpportunityId(opp.id);
  let addressBlock = pickCoherentAddress(fromContact, fromName, existing);

  let leadId = resolveLeadIdFromAddress({
    address: addressBlock.address,
    city: addressBlock.city,
    state: addressBlock.state
  });
  // If we can attach a catalog lead, its address is authoritative (never keep GHL mix-ups).
  if (leadId) {
    const lead = getLead(leadId);
    if (lead) {
      const resolved = resolveDealPropertyAddress(addressBlock, lead);
      addressBlock = {
        address: resolved.address,
        city: resolved.city,
        state: resolved.state,
        zip: resolved.zip
      };
    }
  } else if (existing?.leadId) {
    leadId = existing.leadId;
    const lead = getLead(leadId);
    if (lead) {
      const resolved = resolveDealPropertyAddress(addressBlock, lead);
      addressBlock = {
        address: resolved.address,
        city: resolved.city,
        state: resolved.state,
        zip: resolved.zip
      };
    }
  }

  const deskKeep = pickDeskLocalFields(existing);
  const contactLocked = Boolean(existing?.ghlContactLocked);
  const lockedContactId = contactLocked
    ? (existing?.ghlContactId || null)
    : null;
  const nextContactId = lockedContactId
    || opp.contactId
    || fromContact.id
    || existing?.ghlContactId
    || null;

  // Prefer opportunity monetaryValue as purchase if contact missing price
  const purchasePrice = normalizeMoney(fromContact.contractPrice)
    ?? normalizeMoney(opp.monetaryValue)
    ?? existing?.purchasePrice
    ?? null;

  const deal = upsertDeal({
    ...(existing || {}),
    ...deskKeep,
    dealId: existing?.dealId,
    ghlOpportunityId: opp.id,
    ghlContactId: nextContactId,
    ghlContactLocked: contactLocked,
    ghlPipelineId: pipeline.id,
    ghlStageId: opp.pipelineStageId || null,
    ghlStageName: stageName,
    stage,
    address: addressBlock.address || '',
    city: addressBlock.city || '',
    state: addressBlock.state || '',
    zip: addressBlock.zip || '',
    ownerName: fromContact.sellersName || fromContact.name || existing?.ownerName || '',
    // Locked SMS POC keeps remapped phone/email/conversation across sync
    phone: contactLocked
      ? (existing?.phone || fromContact.phone || '')
      : (fromContact.phone || existing?.phone || ''),
    email: contactLocked
      ? (existing?.email || fromContact.email || '')
      : (fromContact.email || existing?.email || ''),
    conversationId: contactLocked
      ? (existing?.conversationId || null)
      : (existing?.conversationId || null),
    purchasePrice,
    assignmentFee: normalizeMoney(fromContact.assignmentFee) ?? existing?.assignmentFee ?? null,
    cashBuyerName: fromContact.cashBuyerName || existing?.cashBuyerName || '',
    closingDate: fromContact.closingDate || existing?.closingDate || '',
    originalAgreementDate: formatClosingSlash(fromContact.contractSignedDate)
      || existing?.originalAgreementDate
      || deskKeep.originalAgreementDate
      || '',
    emdDeposit: normalizeMoney(fromContact.emdDeposit) ?? existing?.emdDeposit ?? null,
    leadId: leadId || existing?.leadId || null,
    source: 'ghl',
    // Keep local desk edits (rehab, title, EMD, notes, …) when refreshing from GHL
    profitOverride: deskKeep.profitOverride ?? existing?.profitOverride ?? null,
    notes: deskKeep.notes != null ? deskKeep.notes : (existing?.notes || '')
  });

  applyCatalogStatusForDeal(deal);
  return deal;
}

async function syncContractsFromGhl(opts = {}) {
  if (!ghl.isConfigured()) {
    const err = new Error('GHL is not configured (set GHL_API_KEY and GHL_LOCATION_ID)');
    err.code = 'GHL_NOT_CONFIGURED';
    throw err;
  }

  const pipeline = await ghl.findDtsPipeline();
  const opps = await fetchAllDtsPipelineOpps(pipeline);
  const stats = {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    scanned: opps.length,
    upserted: 0,
    linkedLeads: 0,
    skippedUnmapped: 0,
    errors: [],
    deals: []
  };

  const concurrency = Math.max(1, Math.min(5, Number(opts.concurrency) || 4));
  let i = 0;
  async function worker() {
    while (i < opps.length) {
      const idx = i;
      i += 1;
      const opp = opps[idx];
      try {
        let contactSummary = null;
        let ghlDocs = [];
        if (opp.contactId) {
          try {
            const contact = await ghl.getContact(opp.contactId);
            contactSummary = ghl.summarizeContactMoney(contact);
            ghlDocs = ghl.extractContactDocuments(contact);
          } catch (cerr) {
            stats.errors.push({ opportunityId: opp.id, error: `contact: ${cerr.message}` });
          }
        }
        const deal = await upsertDealFromOpportunity(opp, pipeline, contactSummary);
        if (ghlDocs.length) {
          mergeGhlDocumentsOntoDeal(deal.dealId, ghlDocs);
        }
        stats.upserted += 1;
        if (deal.leadId) stats.linkedLeads += 1;
        stats.deals.push({
          dealId: deal.dealId,
          stage: deal.stage,
          address: deal.address,
          leadId: deal.leadId
        });
      } catch (err) {
        if (err.code === 'GHL_STAGE_UNMAPPED') {
          stats.skippedUnmapped += 1;
          continue;
        }
        stats.errors.push({ opportunityId: opp.id, error: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return stats;
}

module.exports = {
  STAGE_RULES,
  mapGhlStageName,
  isContractBoardStage,
  isPipelineBoardStage,
  parseAddressFromOppName,
  syncContractsFromGhl,
  upsertDealFromOpportunity,
  fetchAllDtsPipelineOpps,
  fetchAllDtsContractOpps
};
