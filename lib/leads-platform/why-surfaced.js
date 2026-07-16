/**
 * Plain-English "why this surfaced" + pressure signal tags for Vault leads.
 * Mirrors the Vantage-style proof line without copying their scoring.
 */

const PRESSURE_TAGS = {
  LONG_OPEN: 'Long Open Case',
  REPEAT: 'Repeat Enforcement',
  CHRONIC: 'Chronic Property'
};

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function daysBetween(isoOrDate, nowMs = Date.now()) {
  const t = Date.parse(isoOrDate);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}

function violationRecords(lead = {}) {
  const cv = lead.codeViolation && typeof lead.codeViolation === 'object' ? lead.codeViolation : {};
  const list = Array.isArray(cv.records) ? cv.records : [];
  return list.filter((v) => v && typeof v === 'object');
}

function oldestViolationDays(lead = {}, nowMs = Date.now()) {
  const cv = lead.codeViolation || {};
  const dates = [];
  if (cv.date) dates.push(cv.date);
  for (const r of violationRecords(lead)) {
    if (r.date) dates.push(r.date);
  }
  let maxDays = null;
  for (const d of dates) {
    const days = daysBetween(d, nowMs);
    if (days == null) continue;
    if (maxDays == null || days > maxDays) maxDays = days;
  }
  return maxDays;
}

function openCaseCount(lead = {}) {
  const records = violationRecords(lead);
  if (records.length) return records.length;
  const indicators = Array.isArray(lead.distress?.indicators) ? lead.distress.indicators : [];
  // Fallback: treat stacked indicators as pressure count when no clerk records
  return indicators.length >= 2 ? indicators.length : 0;
}

/**
 * Derive Long Open / Repeat / Chronic tags from lead dossier fields.
 * Safe to merge into signalTags — does not invent fake municipal history.
 */
function buildPressureTags(lead = {}, nowMs = Date.now()) {
  const tags = [];
  const open = openCaseCount(lead);
  const days = oldestViolationDays(lead, nowMs);
  const indicators = Array.isArray(lead.distress?.indicators) ? lead.distress.indicators : [];
  const tier = lead.distressTier == null ? null : Number(lead.distressTier);

  if (open >= 3 || indicators.length >= 4) tags.push(PRESSURE_TAGS.REPEAT);
  if (days != null && days >= 90) tags.push(PRESSURE_TAGS.LONG_OPEN);
  if ((days != null && days >= 365) || (open >= 5 && days != null && days >= 180) || (tier != null && tier >= 9 && open >= 3)) {
    tags.push(PRESSURE_TAGS.CHRONIC);
  }

  // Soft fallbacks from existing analyst language
  const blob = [
    lead.distress?.summary,
    lead.distress?.rationale,
    ...(lead.signalTags || [])
  ].join(' ').toLowerCase();
  if (/\brepeat\b|\bmultiple\b|\bchronic\b/.test(blob) && !tags.includes(PRESSURE_TAGS.REPEAT)) {
    if (/\brepeat\b|\bmultiple\b/.test(blob)) tags.push(PRESSURE_TAGS.REPEAT);
  }
  if (/\blong.?open\b|\bunresolved\b|\baging\b/.test(blob) && !tags.includes(PRESSURE_TAGS.LONG_OPEN)) {
    tags.push(PRESSURE_TAGS.LONG_OPEN);
  }

  return [...new Set(tags)];
}

function mergeSignalTags(existing = [], pressure = []) {
  const out = [];
  const seen = new Set();
  for (const t of [...pressure, ...(existing || [])]) {
    const s = cleanText(t);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * One plain-English sentence operators can read before dialing.
 */
function buildWhySurfaced(lead = {}, nowMs = Date.now()) {
  const parts = [];
  const open = openCaseCount(lead);
  const days = oldestViolationDays(lead, nowMs);
  const cv = lead.codeViolation || {};
  const d = lead.distress || {};
  const tier = lead.distressTier != null ? Number(lead.distressTier) : (d.score != null ? Number(d.score) : null);
  const pressure = buildPressureTags(lead, nowMs);

  if (open > 0) {
    parts.push(`${open} open code case${open === 1 ? '' : 's'}`);
  }
  if (days != null && days > 0) {
    parts.push(`oldest unresolved ~${days} day${days === 1 ? '' : 's'}`);
  }
  if (cv.type) {
    parts.push(cleanText(cv.type));
  } else if (Array.isArray(d.indicators) && d.indicators[0]) {
    parts.push(cleanText(d.indicators[0]));
  }
  if (pressure.includes(PRESSURE_TAGS.REPEAT)) parts.push('repeat enforcement');
  if (pressure.includes(PRESSURE_TAGS.CHRONIC)) parts.push('chronic pressure');
  if (tier != null && Number.isFinite(tier) && !parts.length) {
    parts.push(`distress tier ${tier}/10`);
  }

  if (parts.length) {
    const head = parts.slice(0, 3).join(' · ');
    return `Surfaced because ${head}.`;
  }

  if (d.summary) return cleanText(d.summary);
  if (d.rationale) return cleanText(d.rationale);

  const tags = Array.isArray(lead.signalTags) ? lead.signalTags.filter(Boolean) : [];
  if (tags.length) return `Surfaced on ${tags.slice(0, 3).join(', ')}.`;

  return 'Surfaced from clerk-reviewed distress signals.';
}

/**
 * Attach whySurfaced + merged pressure tags onto a lead (non-destructive).
 */
function enrichLeadProof(lead = {}, nowMs = Date.now()) {
  if (!lead || typeof lead !== 'object') return lead;
  const pressure = buildPressureTags(lead, nowMs);
  const signalTags = mergeSignalTags(lead.signalTags, pressure);
  const whySurfaced = cleanText(lead.whySurfaced) || buildWhySurfaced({ ...lead, signalTags }, nowMs);
  return {
    ...lead,
    signalTags,
    whySurfaced,
    pressureTags: pressure
  };
}

module.exports = {
  PRESSURE_TAGS,
  buildPressureTags,
  buildWhySurfaced,
  mergeSignalTags,
  enrichLeadProof,
  openCaseCount,
  oldestViolationDays
};
